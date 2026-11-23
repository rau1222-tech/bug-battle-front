/**
 * Managed Ollama runtime. A private `ollama serve` runs on its own loopback port with models in local-ai/models.
 * The binary comes from local-ai/runtime (portable, shipped in the game ZIP) or a system install. Nothing is downloaded
 * unless the player (or `npm run ai:setup`) asks for it: the portable runtime comes from the pinned official release
 * and is checksum-verified and installed atomically; the model is pulled by Ollama, which only registers it once complete.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AiSetupError, AiSetupStatus, LocalAiHealth } from '../src/game/deckGenerator/contract';
import type { LocalAiConfig } from './config';
import type { FetchLike, OllamaClient } from './ollama';
import { OLLAMA_RUNTIME_VERSION, runtimeAssetFor, runtimeAssetUrl, type ArchiveFormat, type RuntimeAsset } from './release';

export type RuntimeSource = 'portable' | 'system' | 'external' | 'unavailable';

const EXE = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
const MARKER = '.installed.json';
/** One pid file per private port, so services on different ports never touch each other's Ollama. */
const pidfileName = (port: number) => `ollama-${port}.pid`;
const STAGING = '.staging';
/** Files in local-ai/runtime that are not part of an installation. */
const isKept = (entry: string) => entry === STAGING || entry === 'ollama.log' || /^ollama-\d+\.pid$/.test(entry);

class SetupFailure extends Error {
  constructor(public readonly code: AiSetupError, message?: string) {
    super(message ?? code);
  }
}

interface Download {
  downloading: boolean;
  downloadedBytes: number | null;
  totalBytes: number | null;
}
const idle = (): Download => ({ downloading: false, downloadedBytes: null, totalBytes: null });
const percent = (d: Download) =>
  d.totalBytes && d.downloadedBytes !== null ? Math.min(100, Math.floor((d.downloadedBytes / d.totalBytes) * 100)) : null;

export interface RuntimeDeps {
  fetchImpl?: FetchLike;
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  extract?: (archive: string, format: ArchiveFormat, dest: string, signal: AbortSignal) => Promise<void>;
  /** True if something accepts TCP connections on host:port. */
  probePort?: (host: string, port: number) => Promise<boolean>;
  isPidAlive?: (pid: number) => boolean;
  killPid?: (pid: number) => void;
  asset?: RuntimeAsset | null;
  systemBinary?: () => string | null;
  startTimeoutMs?: number;
  log?: Pick<Console, 'info' | 'error'>;
}

function defaultProbePort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function defaultIsPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function defaultExtract(archive: string, format: ArchiveFormat, dest: string, signal: AbortSignal): Promise<void> {
  // Windows' bundled bsdtar extracts .zip; GNU tar from other toolchains cannot
  const systemTar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : '';
  const tar = process.platform === 'win32' && fs.existsSync(systemTar) ? systemTar : 'tar';
  const flags = format === 'tar.zst' ? ['--zstd', '-xf'] : format === 'tgz' ? ['-xzf'] : ['-xf'];
  return new Promise((resolve, reject) => {
    const child = spawn(tar, [...flags, archive, '-C', dest], { stdio: 'ignore', windowsHide: true, signal });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`))));
  });
}

export function defaultSystemBinary(): string | null {
  const candidates: string[] = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', EXE));
  candidates.push('/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama');
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, EXE));
  return candidates.find(isFile) ?? null;
}

function isFile(p: string) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export class OllamaRuntime {
  private status: AiSetupStatus = 'service_starting';
  private source: RuntimeSource = 'unavailable';
  private detectedVersion: string | null = null;
  private lastError: AiSetupError | null = null;
  private reachable = false;
  private modelInstalled = false;
  private modelLoaded = false;
  private runtimeDl = idle();
  private modelDl = idle();
  private downloadRequested = false;
  private forcePortable = false;
  private task: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private child: ChildProcess | null = null;
  /** Ollama started by a previous run of this service (recorded in the pid file). */
  private adoptedPid: number | null = null;
  private stopping = false;
  private readonly deps: Required<Omit<RuntimeDeps, 'asset'>> & { asset: RuntimeAsset | null };
  private readonly host: string;
  private readonly port: number;

  constructor(private readonly config: LocalAiConfig, private readonly ollama: OllamaClient, deps: RuntimeDeps = {}) {
    this.deps = {
      fetchImpl: deps.fetchImpl ?? fetch,
      spawnImpl: deps.spawnImpl ?? ((command, args, options) => spawn(command, args, options)),
      extract: deps.extract ?? defaultExtract,
      probePort: deps.probePort ?? defaultProbePort,
      isPidAlive: deps.isPidAlive ?? defaultIsPidAlive,
      killPid: deps.killPid ?? ((pid) => process.kill(pid)),
      asset: deps.asset === undefined ? runtimeAssetFor() : deps.asset,
      systemBinary: deps.systemBinary ?? defaultSystemBinary,
      startTimeoutMs: deps.startTimeoutMs ?? 60000,
      log: deps.log ?? console,
    };
    const url = new URL(config.ollamaBaseUrl);
    this.host = url.hostname.replace(/^\[|\]$/g, '');
    this.port = Number(url.port || 11434);
  }

  get state(): AiSetupStatus {
    return this.status;
  }

  get error(): AiSetupError | null {
    return this.lastError;
  }

  /** Detects what is available and starts it; never downloads. */
  init(): Promise<void> {
    return this.start();
  }

  /** User-requested preparation: also downloads the runtime and/or model when missing. Retries after errors. */
  prepare(options: { forcePortable?: boolean } = {}): Promise<void> {
    this.downloadRequested = true;
    this.forcePortable ||= !!options.forcePortable;
    return this.start();
  }

  /** Cancels a running download; partial files are discarded and the previous state is kept. */
  cancel() {
    this.downloadRequested = false;
    this.controller?.abort();
  }

  /** Stops only the Ollama this service started (or adopted from its own pid file). */
  async stop() {
    this.stopping = true;
    this.cancel();
    await this.task?.catch(() => undefined);
    if (this.child && this.child.exitCode === null) this.child.kill();
    if (this.adoptedPid && this.deps.isPidAlive(this.adoptedPid)) {
      try {
        this.deps.killPid(this.adoptedPid);
      } catch {
        // already gone
      }
    }
    if (this.child || this.adoptedPid) fs.rmSync(this.pidfilePath(), { force: true });
    this.child = null;
    this.adoptedPid = null;
  }

  async health(): Promise<LocalAiHealth> {
    if (this.status === 'ready' && !this.task) {
      try {
        await this.ollama.version(1000);
      } catch {
        this.fail('OLLAMA_UNAVAILABLE');
      }
    }
    return {
      service: 'ready',
      status: this.status,
      runtime: {
        source: this.source,
        ready: this.reachable,
        expectedVersion: OLLAMA_RUNTIME_VERSION,
        detectedVersion: this.detectedVersion,
        ...this.runtimeDl,
        progress: percent(this.runtimeDl),
      },
      ollama: { reachable: this.reachable },
      model: {
        name: this.config.ollamaModel,
        installed: this.modelInstalled,
        loaded: this.modelLoaded,
        ...this.modelDl,
        progress: percent(this.modelDl),
      },
      canGenerate: this.status === 'ready',
      canUseFallback: true,
      lastError: this.status === 'error' ? this.lastError : null,
      dataDir: 'local-ai/',
    };
  }

  private start(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    this.task ??= (async () => {
      try {
        do {
          await this.run();
        } while (!this.stopping && this.downloadRequested && (this.status === 'runtime_missing' || this.status === 'model_missing'));
      } finally {
        this.task = null;
      }
    })();
    return this.task;
  }

  private fail(code: AiSetupError) {
    this.status = 'error';
    this.lastError = code;
    if (code === 'OLLAMA_UNAVAILABLE' || code === 'PORT_IN_USE' || code === 'OLLAMA_START_FAILED') {
      this.reachable = false;
      this.modelLoaded = false;
    }
  }

  private async isReachable() {
    try {
      this.detectedVersion = await this.ollama.version(1500);
      return true;
    } catch {
      return false;
    }
  }

  private async run() {
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    if (this.status === 'error') this.status = 'service_starting';
    this.lastError = null;
    let phase: 'runtime' | 'model' = 'runtime';
    try {
      if (!this.config.manageOllama) {
        this.source = 'external';
        if (!(await this.isReachable())) throw new SetupFailure('OLLAMA_UNAVAILABLE');
      } else {
        if (this.forcePortable && !this.portableBinary()) await this.installRuntime(signal);
        if (!(await this.ensureServer(signal))) return;
      }
      this.reachable = true;

      phase = 'model';
      this.modelInstalled = await this.ollama.hasModel();
      if (!this.modelInstalled) {
        if (!this.downloadRequested) {
          this.status = 'model_missing';
          return;
        }
        this.status = 'model_downloading';
        this.modelDl = { downloading: true, downloadedBytes: 0, totalBytes: null };
        try {
          await this.ollama.pull((done, total) => {
            this.modelDl = { downloading: true, downloadedBytes: done, totalBytes: total || null };
          }, signal);
        } catch (err) {
          if (signal.aborted) throw err;
          throw new SetupFailure('MODEL_DOWNLOAD_FAILED');
        } finally {
          this.modelDl = idle();
        }
        this.modelInstalled = true;
      }

      if (!this.modelLoaded) {
        this.status = 'model_loading';
        const started = Date.now();
        try {
          await this.ollama.warmup(signal);
        } catch (err) {
          if (signal.aborted) throw err;
          throw new SetupFailure('MODEL_LOAD_FAILED');
        }
        this.modelLoaded = true;
        this.deps.log.info(`[local-ai] Model ${this.config.ollamaModel} loaded in ${Date.now() - started} ms`);
      }
      this.status = 'ready';
      this.downloadRequested = false;
    } catch (err) {
      if (signal.aborted) {
        // Cancelled: back to the "missing" state of the phase; nothing partial is kept as installed
        if (phase === 'model' && !this.modelInstalled) this.status = 'model_missing';
        else if (phase === 'runtime' && !this.portableBinary() && (this.forcePortable || !this.deps.systemBinary())) this.status = 'runtime_missing';
        else this.fail(phase === 'runtime' ? 'OLLAMA_START_FAILED' : 'MODEL_LOAD_FAILED');
        return;
      }
      this.downloadRequested = false;
      this.fail(err instanceof SetupFailure ? err.code : phase === 'runtime' ? 'OLLAMA_START_FAILED' : 'MODEL_LOAD_FAILED');
      this.deps.log.error(`[local-ai] Preparation failed: ${this.lastError}`);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Makes sure our private Ollama answers. Returns false when the runtime is missing and no download was requested. */
  private async ensureServer(signal: AbortSignal): Promise<boolean> {
    if (this.child && this.child.exitCode === null && (await this.isReachable())) return true;
    if (this.adoptedPid && this.deps.isPidAlive(this.adoptedPid) && (await this.isReachable())) return true;

    if (await this.isReachable()) {
      // Something answers like Ollama on our private port: only reuse it if our own pid file says we started it
      const owned = this.readPidfile();
      if (owned && owned.port === this.port && this.deps.isPidAlive(owned.pid)) {
        this.adoptedPid = owned.pid;
        this.source = owned.source;
        this.deps.log.info(`[local-ai] Reusing the private Ollama started earlier (pid ${owned.pid})`);
        return true;
      }
      throw new SetupFailure('PORT_IN_USE');
    }
    if (await this.deps.probePort(this.host, this.port)) throw new SetupFailure('PORT_IN_USE');

    let binary = this.portableBinary();
    let source: RuntimeSource = 'portable';
    if (!binary && !this.forcePortable) {
      binary = this.deps.systemBinary();
      source = 'system';
    }
    if (!binary) {
      this.source = 'unavailable';
      if (!this.downloadRequested) {
        this.status = 'runtime_missing';
        return false;
      }
      binary = await this.installRuntime(signal);
      source = 'portable';
    }
    this.source = source;
    this.status = 'runtime_ready';
    await this.startServer(binary, signal);
    return true;
  }

  private async startServer(binary: string, signal: AbortSignal) {
    const started = Date.now();
    fs.mkdirSync(this.config.modelsDir, { recursive: true });
    fs.mkdirSync(this.config.runtimeDir, { recursive: true });
    const logFd = fs.openSync(path.join(this.config.runtimeDir, 'ollama.log'), 'a');
    let child: ChildProcess;
    try {
      child = this.deps.spawnImpl(binary, ['serve'], {
        env: {
          ...process.env,
          OLLAMA_HOST: `${this.host}:${this.port}`,
          OLLAMA_MODELS: this.config.modelsDir,
          OLLAMA_KEEP_ALIVE: '30m',
        },
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
      });
    } catch {
      throw new SetupFailure('OLLAMA_START_FAILED');
    } finally {
      fs.closeSync(logFd);
    }
    this.child = child;
    let exited = false;
    child.once('error', () => {
      exited = true;
    });
    child.once('exit', () => {
      exited = true;
      if (this.child !== child) return;
      this.child = null;
      fs.rmSync(this.pidfilePath(), { force: true });
      if (!this.stopping && this.status === 'ready') this.fail('OLLAMA_UNAVAILABLE');
    });
    if (child.pid) {
      fs.writeFileSync(this.pidfilePath(), JSON.stringify({ pid: child.pid, port: this.port, source: this.source }));
    }

    const deadline = Date.now() + this.deps.startTimeoutMs;
    while (!(await this.isReachable())) {
      if (signal.aborted) throw new Error('aborted');
      if (exited || Date.now() > deadline) {
        if (!exited) child.kill();
        throw new SetupFailure('OLLAMA_START_FAILED');
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    this.deps.log.info(`[local-ai] Ollama ${this.detectedVersion} (${this.source}) started in ${Date.now() - started} ms`);
  }

  private pidfilePath() {
    return path.join(this.config.runtimeDir, pidfileName(this.port));
  }

  private readPidfile(): { pid: number; port: number; source: RuntimeSource } | null {
    try {
      const data = JSON.parse(fs.readFileSync(this.pidfilePath(), 'utf8'));
      return Number.isInteger(data.pid) && Number.isInteger(data.port) ? data : null;
    } catch {
      return null;
    }
  }

  /** The portable runtime only counts as installed once its marker exists (written after a verified, complete install). */
  portableBinary(): string | null {
    if (!isFile(path.join(this.config.runtimeDir, MARKER))) return null;
    return [path.join(this.config.runtimeDir, EXE), path.join(this.config.runtimeDir, 'bin', EXE)].find(isFile) ?? null;
  }

  /** Download → verify SHA-256 → extract to staging → move into local-ai/runtime → write marker. */
  private async installRuntime(signal: AbortSignal): Promise<string> {
    const asset = this.deps.asset;
    if (!asset) throw new SetupFailure('UNSUPPORTED_PLATFORM');
    const runtimeDir = this.config.runtimeDir;
    const staging = path.join(runtimeDir, STAGING);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(path.join(staging, 'extract'), { recursive: true });
    this.status = 'runtime_downloading';
    this.runtimeDl = { downloading: true, downloadedBytes: 0, totalBytes: asset.size };
    const started = Date.now();
    try {
      const archive = path.join(staging, `${asset.name}.part`);
      let res: Response;
      try {
        res = await this.deps.fetchImpl(runtimeAssetUrl(asset), { signal });
      } catch (err) {
        if (signal.aborted) throw err;
        throw new SetupFailure('RUNTIME_DOWNLOAD_FAILED');
      }
      if (!res.ok || !res.body) throw new SetupFailure('RUNTIME_DOWNLOAD_FAILED');
      const total = Number(res.headers.get('content-length')) || asset.size;
      this.runtimeDl = { downloading: true, downloadedBytes: 0, totalBytes: total };
      const hash = createHash('sha256');
      let received = 0;
      const source = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
      source.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        received += chunk.length;
        this.runtimeDl = { downloading: true, downloadedBytes: received, totalBytes: total };
      });
      try {
        await pipeline(source, fs.createWriteStream(archive), { signal });
      } catch (err) {
        if (signal.aborted) throw err;
        throw new SetupFailure('RUNTIME_DOWNLOAD_FAILED');
      }
      if (hash.digest('hex') !== asset.sha256) throw new SetupFailure('CHECKSUM_MISMATCH');
      this.runtimeDl = { downloading: false, downloadedBytes: received, totalBytes: total };

      const extracted = path.join(staging, 'extract');
      try {
        await this.deps.extract(archive, asset.format, extracted, signal);
      } catch (err) {
        if (signal.aborted) throw err;
        throw new SetupFailure('EXTRACT_FAILED');
      }
      if (![path.join(extracted, EXE), path.join(extracted, 'bin', EXE)].some(isFile)) throw new SetupFailure('EXTRACT_FAILED');
      if (signal.aborted) throw new Error('aborted');

      // Replace any leftovers of an incomplete install; a valid one (with marker) is never re-downloaded
      for (const entry of fs.readdirSync(runtimeDir)) {
        if (!isKept(entry)) fs.rmSync(path.join(runtimeDir, entry), { recursive: true, force: true });
      }
      for (const entry of fs.readdirSync(extracted)) fs.renameSync(path.join(extracted, entry), path.join(runtimeDir, entry));
      fs.writeFileSync(path.join(runtimeDir, MARKER), JSON.stringify({ version: OLLAMA_RUNTIME_VERSION, asset: asset.name, sha256: asset.sha256 }));
      const binary = this.portableBinary();
      if (!binary) throw new SetupFailure('EXTRACT_FAILED');
      if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);
      this.deps.log.info(`[local-ai] Ollama runtime v${OLLAMA_RUNTIME_VERSION} installed in ${Date.now() - started} ms`);
      return binary;
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
      this.runtimeDl = idle();
    }
  }
}
