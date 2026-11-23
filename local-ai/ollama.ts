/**
 * Minimal Ollama HTTP client, independent of any game feature so other AI operations can reuse it.
 * Every failure is normalised into an OllamaError with a contract error code.
 */
import type { AiErrorCode } from '../src/game/deckGenerator/contract';

export class OllamaError extends Error {
  constructor(public readonly code: AiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'OllamaError';
  }
}

export interface ChatJsonOptions {
  system: string;
  user: string;
  /** JSON Schema passed to Ollama's structured output (`format`). */
  schema: object;
  temperature: number;
  seed: number;
  timeoutMs: number;
  signal?: AbortSignal;
  numPredict?: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OllamaClient {
  readonly baseUrl: string;
  readonly model: string;
  version(timeoutMs?: number): Promise<string>;
  hasModel(timeoutMs?: number): Promise<boolean>;
  chatJson(options: ChatJsonOptions): Promise<unknown>;
  pull(onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<void>;
  warmup(signal?: AbortSignal): Promise<void>;
}

/** Parses the model text as JSON; as a last defensive resort, tries the outermost {...} block once. */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new OllamaError('INVALID_MODEL_OUTPUT', 'Model output is not valid JSON');
  }
}

export function createOllamaClient(baseUrl: string, model: string, fetchImpl: FetchLike = fetch): OllamaClient {
  async function call(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch {
      if (timedOut) throw new OllamaError('TIMEOUT', `Ollama did not answer within ${timeoutMs} ms`);
      if (signal?.aborted) throw new OllamaError('INTERNAL', 'Request aborted');
      throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is not reachable');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  const readError = async (res: Response) => {
    try {
      const body = (await res.json()) as { error?: unknown };
      return typeof body.error === 'string' ? body.error : '';
    } catch {
      return '';
    }
  };

  const isModelMissing = (status: number, message: string) => status === 404 || /model .*not found|pull/i.test(message);

  return {
    baseUrl,
    model,

    async version(timeoutMs = 2000) {
      const res = await call('/api/version', { method: 'GET' }, timeoutMs);
      if (!res.ok) throw new OllamaError('OLLAMA_UNAVAILABLE', `Ollama answered ${res.status}`);
      const body = (await res.json()) as { version?: string };
      return body.version ?? 'unknown';
    },

    async hasModel(timeoutMs = 3000) {
      const res = await call('/api/tags', { method: 'GET' }, timeoutMs);
      if (!res.ok) throw new OllamaError('OLLAMA_UNAVAILABLE', `Ollama answered ${res.status}`);
      const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
      const wanted = model.includes(':') ? model : `${model}:latest`;
      return (body.models ?? []).some((m) => m.name === wanted || m.model === wanted);
    },

    async chatJson({ system, user, schema, temperature, seed, timeoutMs, signal, numPredict = 400 }) {
      const res = await call(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: schema,
            keep_alive: '30m',
            options: { temperature, seed, num_ctx: 4096, num_predict: numPredict },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
        timeoutMs,
        signal,
      );
      if (!res.ok) {
        const message = await readError(res);
        if (isModelMissing(res.status, message)) throw new OllamaError('MODEL_NOT_INSTALLED', `Model ${model} is not installed`);
        throw new OllamaError('MODEL_ERROR', `Ollama error ${res.status}`);
      }
      let body: { message?: { content?: unknown } };
      try {
        body = (await res.json()) as typeof body;
      } catch {
        throw new OllamaError('INVALID_MODEL_OUTPUT', 'Ollama returned a non-JSON body');
      }
      const content = typeof body.message?.content === 'string' ? body.message.content.trim() : '';
      if (!content) throw new OllamaError('EMPTY_RESPONSE', 'The model returned an empty answer');
      return parseModelJson(content);
    },

    async pull(onProgress, signal) {
      const res = await call(
        '/api/pull',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }) },
        6 * 60 * 60 * 1000,
        signal,
      );
      if (!res.ok || !res.body) throw new OllamaError('MODEL_NOT_INSTALLED', `Could not download ${model} (${res.status})`);
      // Ollama streams one event per layer; the model is only installed once its manifest is written at the end
      const layers = new Map<string, { completed: number; total: number }>();
      const reader = res.body.getReader();
      // `call` only watches the signal until the headers arrive: closing the stream also stops Ollama's pull
      const onAbort = () => void reader.cancel().catch(() => undefined);
      signal?.addEventListener('abort', onAbort, { once: true });
      const decoder = new TextDecoder();
      let buffer = '';
      let success = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (signal?.aborted) throw new OllamaError('INTERNAL', 'Download cancelled');
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: { status?: string; digest?: string; completed?: number; total?: number; error?: string };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.error) throw new OllamaError('MODEL_NOT_INSTALLED', `Could not download ${model}`);
            if (evt.status === 'success') success = true;
            if (evt.digest && evt.total) {
              layers.set(evt.digest, { completed: evt.completed ?? 0, total: evt.total });
              let completed = 0;
              let total = 0;
              for (const l of layers.values()) {
                completed += l.completed;
                total += l.total;
              }
              onProgress?.(completed, total);
            }
          }
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
      if (!success) throw new OllamaError('MODEL_NOT_INSTALLED', `Download of ${model} did not finish`);
    },

    async warmup(signal) {
      // An empty prompt loads the model into memory so the first generation is faster
      const res = await call(
        '/api/generate',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, keep_alive: '30m' }) },
        180000,
        signal,
      );
      if (!res.ok) throw new OllamaError('MODEL_ERROR', `Could not load ${model} (${res.status})`);
      await res.text();
    },
  };
}
