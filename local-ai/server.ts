/**
 * Local AI HTTP service. Knows nothing about Supabase or users: it receives a minimal DTO, asks the local model
 * and returns structured data. New AI operations are added as new entries in `routes`.
 */
import http from 'node:http';
import { DeckGenerateRequestSchema, LIMITS, type AiErrorCode, type AiSetupStatus, type LocalAiHealth } from '../src/game/deckGenerator/contract';
import type { LocalAiConfig } from './config';
import { generateDeckWithModel } from './decks';
import { OllamaError, type OllamaClient } from './ollama';

export interface RuntimeControl {
  readonly state: AiSetupStatus;
  health(): Promise<LocalAiHealth>;
  prepare(): Promise<void>;
  cancel(): void;
}

interface Deps {
  config: LocalAiConfig;
  ollama: OllamaClient;
  runtime: RuntimeControl;
  log?: Pick<Console, 'error' | 'info'>;
}

class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: AiErrorCode, message?: string) {
    super(message ?? code);
  }
}

const STATUS_BY_CODE: Partial<Record<AiErrorCode, number>> = {
  OLLAMA_UNAVAILABLE: 503,
  MODEL_NOT_INSTALLED: 503,
  TIMEOUT: 504,
  EMPTY_RESPONSE: 502,
  INVALID_MODEL_OUTPUT: 502,
  MODEL_ERROR: 502,
};

type Handler = (req: http.IncomingMessage, signal: AbortSignal) => Promise<unknown>;

function readJsonBody(req: http.IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Requiring JSON forces a CORS preflight, so other sites can't trigger actions with simple form posts
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      reject(new HttpError(415, 'INVALID_INPUT', 'Content-Type must be application/json'));
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > limit) {
      reject(new HttpError(413, 'PAYLOAD_TOO_LARGE'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'INVALID_INPUT', 'Body is not valid JSON'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'INVALID_INPUT')));
  });
}

export function createLocalAiServer({ config, ollama, runtime, log = console }: Deps): http.Server {
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]'].map((h) => `${h}:${config.port}`));

  const routes: Record<string, Handler> = {
    'GET /health': () => runtime.health(),

    /** Starts (or retries) the preparation, downloading the runtime and/or model if missing. Returns immediately. */
    'POST /api/setup': async (req) => {
      await readJsonBody(req, 1024);
      void runtime.prepare();
      return runtime.health();
    },

    'POST /api/setup/cancel': async (req) => {
      await readJsonBody(req, 1024);
      runtime.cancel();
      return runtime.health();
    },

    'POST /api/decks/generate': async (req, signal) => {
      const body = await readJsonBody(req, LIMITS.maxBodyBytes);
      const parsed = DeckGenerateRequestSchema.safeParse(body);
      if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT', 'Invalid deck generation request');
      const state = runtime.state;
      if (state !== 'ready') {
        const modelMissing = state === 'model_missing' || state === 'model_downloading' || state === 'model_loading';
        throw new HttpError(503, modelMissing ? 'MODEL_NOT_INSTALLED' : 'OLLAMA_UNAVAILABLE', 'The local AI is not ready');
      }
      const result = await generateDeckWithModel(parsed.data, ollama, {
        temperature: config.temperature,
        timeoutMs: config.ollamaTimeoutMs,
        signal,
      });
      if (config.debug) {
        log.info(`[local-ai] decks.generate ${parsed.data.strategy} model=${result.meta.model} seed=${result.meta.seed} ${result.meta.durationMs} ms`);
      }
      return result;
    },
  };

  return http.createServer(async (req, res) => {
    const send = (status: number, payload: unknown) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(payload));
    };
    const fail = (status: number, code: AiErrorCode, message?: string) => send(status, { error: { code, message } });

    // Host check blocks DNS-rebinding pages that would otherwise look same-origin
    if (!allowedHosts.has(req.headers.host ?? '')) return fail(403, 'FORBIDDEN_ORIGIN', 'Host not allowed');
    const origin = req.headers.origin;
    if (origin) {
      if (!config.allowedOrigins.includes(origin)) return fail(403, 'FORBIDDEN_ORIGIN', 'Origin not allowed');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }

    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    const handler = routes[`${req.method} ${pathname}`];
    if (!handler) return fail(404, 'NOT_FOUND');

    // Abort the model call if the browser cancels or disconnects
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      send(200, await handler(req, controller.signal));
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.code, err.message);
      if (err instanceof OllamaError) return fail(STATUS_BY_CODE[err.code] ?? 500, err.code, err.message);
      log.error('[local-ai] Unexpected error:', err instanceof Error ? err.message : 'unknown');
      fail(500, 'INTERNAL', 'Internal error');
    }
  });
}
