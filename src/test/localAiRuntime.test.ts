import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type LocalAiConfig } from '../../local-ai/config';
import type { OllamaClient } from '../../local-ai/ollama';
import { OllamaRuntime, type RuntimeDeps } from '../../local-ai/runtime';
import type { RuntimeAsset } from '../../local-ai/release';

const EXE = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
const CONTENT = Buffer.from('fake-ollama-archive-'.repeat(50));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ASSET: RuntimeAsset = { platform: process.platform, arch: process.arch, name: 'fake.zip', size: CONTENT.length, format: 'zip', sha256: sha(CONTENT) };

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A download whose second half only arrives when `release` is called; aborting errors the stream. */
function gatedResponse(body: Buffer, signal?: AbortSignal | null) {
  const gate = deferred();
  const half = Math.floor(body.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new Uint8Array(body.subarray(0, half)));
      signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
      try {
        await gate.promise;
        controller.enqueue(new Uint8Array(body.subarray(half)));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  return { response: new Response(stream, { headers: { 'content-length': String(body.length) } }), release: gate.resolve, fail: gate.reject, half };
}

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  constructor(public pid: number, private onExit: () => void) {
    super();
  }
  kill() {
    if (this.exitCode !== null) return true;
    this.exitCode = 0;
    this.onExit();
    this.emit('exit', 0);
    return true;
  }
}

let tmp: string;
let config: LocalAiConfig;
let ollamaUp: boolean;
let modelInstalled: boolean;
let pullGate: ReturnType<typeof deferred> | null;
let pullFails: boolean;
let children: FakeChild[];
let ollama: OllamaClient;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-ai-test-'));
  config = { ...loadConfig({}), runtimeDir: path.join(tmp, 'runtime'), modelsDir: path.join(tmp, 'models') };
  ollamaUp = false;
  modelInstalled = true;
  pullGate = null;
  pullFails = false;
  children = [];
  ollama = {
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    version: vi.fn(async () => {
      if (!ollamaUp) throw new Error('down');
      return '0.40.16';
    }),
    hasModel: vi.fn(async () => modelInstalled),
    pull: vi.fn(async (onProgress?: (done: number, total: number) => void, signal?: AbortSignal) => {
      onProgress?.(400, 1000);
      if (pullGate) {
        const gate = pullGate;
        signal?.addEventListener('abort', () => gate.reject(new Error('aborted')));
        await gate.promise;
      }
      if (pullFails) throw new Error('network');
      onProgress?.(1000, 1000);
      modelInstalled = true;
    }),
    warmup: vi.fn(async () => undefined),
    chatJson: vi.fn(),
  };
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeRuntime(overrides: RuntimeDeps = {}) {
  const deps: RuntimeDeps = {
    asset: ASSET,
    systemBinary: () => null,
    probePort: async () => false,
    isPidAlive: () => false,
    killPid: vi.fn(),
    startTimeoutMs: 2000,
    log: { info: () => undefined, error: () => undefined },
    fetchImpl: vi.fn(async () => new Response(CONTENT, { headers: { 'content-length': String(CONTENT.length) } })),
    extract: vi.fn(async (_archive: string, _format: string, dest: string) => {
      fs.writeFileSync(path.join(dest, EXE), 'binary');
      fs.mkdirSync(path.join(dest, 'lib'));
    }),
    spawnImpl: vi.fn(() => {
      const child = new FakeChild(4242 + children.length, () => {
        ollamaUp = false;
      });
      children.push(child);
      ollamaUp = true;
      return child as unknown as ChildProcess;
    }),
    ...overrides,
  };
  return { runtime: new OllamaRuntime(config, ollama, deps), deps };
}

const until = async (fn: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('condition not reached');
};
const marker = () => path.join(config.runtimeDir, '.installed.json');
const staging = () => path.join(config.runtimeDir, '.staging');

describe('local AI preparation', () => {
  it('starts an available system runtime and an installed model without downloading', async () => {
    const system = path.join(tmp, EXE);
    fs.writeFileSync(system, 'bin');
    const { runtime, deps } = makeRuntime({ systemBinary: () => system });
    await runtime.init();
    const health = await runtime.health();
    expect(health).toMatchObject({
      status: 'ready',
      runtime: { source: 'system', ready: true, expectedVersion: '0.40.16', detectedVersion: '0.40.16', downloading: false, progress: null },
      model: { name: 'qwen2.5:1.5b', installed: true, loaded: true, downloading: false },
      canGenerate: true,
      canUseFallback: true,
      lastError: null,
      dataDir: 'local-ai/',
    });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(ollama.pull).not.toHaveBeenCalled();
    expect(deps.spawnImpl).toHaveBeenCalledTimes(1);
    const json = JSON.stringify(health);
    expect(json).not.toContain(tmp);
    expect(json).not.toMatch(/11435|http:|token|key/i);
  });

  it('reports a missing runtime and never downloads without being asked', async () => {
    const { runtime, deps } = makeRuntime();
    await runtime.init();
    expect(await runtime.health()).toMatchObject({ status: 'runtime_missing', runtime: { source: 'unavailable', ready: false }, canGenerate: false, canUseFallback: true });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('downloads, verifies and installs the runtime with real progress, then the model', async () => {
    let gated: ReturnType<typeof gatedResponse> | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      gated = gatedResponse(CONTENT, init?.signal);
      return gated.response;
    });
    modelInstalled = false;
    pullGate = deferred();
    const { runtime, deps } = makeRuntime({ fetchImpl });
    const done = runtime.prepare();

    await until(async () => (await runtime.health()).runtime.downloadedBytes === gated?.half);
    expect(await runtime.health()).toMatchObject({
      status: 'runtime_downloading',
      runtime: { downloading: true, totalBytes: CONTENT.length, progress: Math.floor((gated!.half / CONTENT.length) * 100) },
    });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://github.com/ollama/ollama/releases/download/v0.40.16/fake.zip');
    gated!.release();

    await until(() => runtime.state === 'model_downloading');
    expect(await runtime.health()).toMatchObject({ model: { downloading: true, downloadedBytes: 400, totalBytes: 1000, progress: 40 } });
    pullGate.resolve(undefined);
    await done;

    expect(runtime.state).toBe('ready');
    expect(fs.existsSync(marker())).toBe(true);
    expect(fs.existsSync(path.join(config.runtimeDir, EXE))).toBe(true);
    expect(fs.existsSync(staging())).toBe(false);
    expect((await runtime.health()).runtime.source).toBe('portable');
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });

  it('rejects a corrupted download, cleans up and can retry', async () => {
    const corrupted = Buffer.from(CONTENT);
    corrupted[0] ^= 1;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(corrupted))
      .mockImplementation(async () => new Response(CONTENT));
    const { runtime, deps } = makeRuntime({ fetchImpl });
    await runtime.prepare();
    expect(await runtime.health()).toMatchObject({ status: 'error', lastError: 'CHECKSUM_MISMATCH', canUseFallback: true });
    expect(deps.extract).not.toHaveBeenCalled();
    expect(fs.existsSync(marker())).toBe(false);
    expect(fs.existsSync(staging())).toBe(false);

    await runtime.prepare();
    expect(runtime.state).toBe('ready');
    expect(fs.existsSync(marker())).toBe(true);
  });

  it('never treats a partial download or an unmarked binary as installed', async () => {
    let gated: ReturnType<typeof gatedResponse> | null = null;
    const { runtime } = makeRuntime({
      fetchImpl: async (_url, init) => {
        gated = gatedResponse(CONTENT, init?.signal);
        return gated.response;
      },
    });
    // Leftover of an interrupted install: binary without marker
    fs.mkdirSync(config.runtimeDir, { recursive: true });
    fs.writeFileSync(path.join(config.runtimeDir, EXE), 'stale');
    expect(runtime.portableBinary()).toBeNull();

    const done = runtime.prepare();
    await until(() => gated !== null);
    gated!.fail(new Error('connection reset'));
    await done;
    expect(await runtime.health()).toMatchObject({ status: 'error', lastError: 'RUNTIME_DOWNLOAD_FAILED' });
    expect(fs.existsSync(marker())).toBe(false);
    expect(fs.existsSync(staging())).toBe(false);
  });

  it('cancels a runtime download, removes the partial file and keeps the previous state', async () => {
    let gated: ReturnType<typeof gatedResponse> | null = null;
    const { runtime } = makeRuntime({
      fetchImpl: async (_url, init) => {
        gated = gatedResponse(CONTENT, init?.signal);
        return gated.response;
      },
    });
    const done = runtime.prepare();
    await until(async () => (await runtime.health()).runtime.downloadedBytes === gated?.half);
    expect(fs.readdirSync(staging()).some((f) => f.endsWith('.part'))).toBe(true);
    runtime.cancel();
    await done;
    expect(await runtime.health()).toMatchObject({ status: 'runtime_missing', lastError: null, runtime: { downloading: false } });
    expect(fs.existsSync(staging())).toBe(false);
    expect(fs.existsSync(marker())).toBe(false);
  });

  it('reports a missing model, downloads it on request and can cancel it', async () => {
    const system = path.join(tmp, EXE);
    fs.writeFileSync(system, 'bin');
    modelInstalled = false;
    pullGate = deferred();
    const { runtime } = makeRuntime({ systemBinary: () => system });
    await runtime.init();
    expect(await runtime.health()).toMatchObject({ status: 'model_missing', model: { installed: false }, canGenerate: false });
    expect(ollama.pull).not.toHaveBeenCalled();

    const done = runtime.prepare();
    await until(() => runtime.state === 'model_downloading');
    runtime.cancel();
    await done;
    expect(await runtime.health()).toMatchObject({ status: 'model_missing', model: { downloading: false, installed: false } });

    pullGate = null;
    await runtime.prepare();
    expect(await runtime.health()).toMatchObject({ status: 'ready', model: { installed: true, loaded: true } });
  });

  it('reports a failed model download and retries it', async () => {
    const system = path.join(tmp, EXE);
    fs.writeFileSync(system, 'bin');
    modelInstalled = false;
    pullFails = true;
    const { runtime } = makeRuntime({ systemBinary: () => system });
    await runtime.prepare();
    expect(await runtime.health()).toMatchObject({ status: 'error', lastError: 'MODEL_DOWNLOAD_FAILED', canUseFallback: true });
    pullFails = false;
    await runtime.prepare();
    expect(runtime.state).toBe('ready');
  });

  it('runs a single preparation when asked twice at the same time', async () => {
    const { runtime, deps } = makeRuntime();
    await Promise.all([runtime.prepare(), runtime.prepare(), runtime.init()]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.spawnImpl).toHaveBeenCalledTimes(1);
    expect(runtime.state).toBe('ready');
  });
});

describe('private Ollama process', () => {
  const withSystem = () => {
    const system = path.join(tmp, EXE);
    fs.writeFileSync(system, 'bin');
    return () => system;
  };

  it('does not start a second Ollama when one is already ours and running', async () => {
    const { runtime, deps } = makeRuntime({ systemBinary: withSystem() });
    await runtime.init();
    await runtime.prepare();
    expect(deps.spawnImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a port used by an unknown Ollama or another program, without killing it', async () => {
    ollamaUp = true;
    const { runtime, deps } = makeRuntime({ systemBinary: withSystem() });
    await runtime.init();
    expect(await runtime.health()).toMatchObject({ status: 'error', lastError: 'PORT_IN_USE', canGenerate: false, canUseFallback: true });
    expect(deps.spawnImpl).not.toHaveBeenCalled();
    await runtime.stop();
    expect(deps.killPid).not.toHaveBeenCalled();

    ollamaUp = false;
    const other = makeRuntime({ systemBinary: withSystem(), probePort: async () => true });
    await other.runtime.init();
    expect(other.runtime.error).toBe('PORT_IN_USE');
    expect(other.deps.spawnImpl).not.toHaveBeenCalled();
  });

  it('reuses (and later stops) the Ollama it started in a previous run, using its pid file', async () => {
    ollamaUp = true;
    fs.mkdirSync(config.runtimeDir, { recursive: true });
    fs.writeFileSync(path.join(config.runtimeDir, 'ollama-11435.pid'), JSON.stringify({ pid: 999, port: 11435, source: 'system' }));
    const { runtime, deps } = makeRuntime({ isPidAlive: (pid) => pid === 999 });
    await runtime.init();
    expect(runtime.state).toBe('ready');
    expect(deps.spawnImpl).not.toHaveBeenCalled();
    await runtime.stop();
    expect(deps.killPid).toHaveBeenCalledWith(999);
    expect(fs.existsSync(path.join(config.runtimeDir, 'ollama-11435.pid'))).toBe(false);
  });

  it('stops only its own process and removes the pid file', async () => {
    const { runtime } = makeRuntime({ systemBinary: withSystem() });
    await runtime.init();
    expect(fs.existsSync(path.join(config.runtimeDir, 'ollama-11435.pid'))).toBe(true);
    await runtime.stop();
    expect(children[0].exitCode).toBe(0);
    expect(fs.existsSync(path.join(config.runtimeDir, 'ollama-11435.pid'))).toBe(false);
  });

  it('aborts and cleans up when the service stops during a download', async () => {
    let gated: ReturnType<typeof gatedResponse> | null = null;
    const { runtime, deps } = makeRuntime({
      fetchImpl: async (_url, init) => {
        gated = gatedResponse(CONTENT, init?.signal);
        return gated.response;
      },
    });
    const done = runtime.prepare();
    await until(() => gated !== null);
    await runtime.stop();
    await done;
    expect(fs.existsSync(staging())).toBe(false);
    expect(fs.existsSync(marker())).toBe(false);
    expect(deps.spawnImpl).not.toHaveBeenCalled();
    await runtime.prepare();
    expect(deps.spawnImpl).not.toHaveBeenCalled();
  });

  it('reports an error if Ollama dies or never answers', async () => {
    const { runtime } = makeRuntime({ systemBinary: withSystem() });
    await runtime.init();
    children[0].kill();
    expect(await runtime.health()).toMatchObject({ status: 'error', lastError: 'OLLAMA_UNAVAILABLE', canGenerate: false });

    const silent = makeRuntime({
      systemBinary: withSystem(),
      startTimeoutMs: 50,
      spawnImpl: vi.fn(() => new FakeChild(1, () => undefined) as unknown as ChildProcess),
    });
    await silent.runtime.init();
    expect(silent.runtime.error).toBe('OLLAMA_START_FAILED');
  });

  it('reports unsupported platforms without downloading', async () => {
    const { runtime, deps } = makeRuntime({ asset: null });
    await runtime.prepare();
    expect(runtime.error).toBe('UNSUPPORTED_PLATFORM');
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});
