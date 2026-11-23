import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS } from '@/constants';
import { buildDeckRequest } from '@/game/deckGenerator/deckRules';
import { LocalAiError, callLocalAi, requestDeckGeneration } from '@/lib/localAiClient';
import { DeckGenerateResponseSchema, type AiSetupStatus, type LocalAiHealth } from '@/game/deckGenerator/contract';
import { loadConfig } from '../../local-ai/config';
import { buildDeckPrompt, generateDeckWithModel } from '../../local-ai/decks';
import { OllamaError, createOllamaClient, type FetchLike, type OllamaClient } from '../../local-ai/ollama';
import { createLocalAiServer } from '../../local-ai/server';

const FULL = Object.fromEntries(CARD_DEFINITIONS.map((c) => [c.id, 2]));
const request = buildDeckRequest(CARD_DEFINITIONS, FULL, { strategy: 'aggressive', seed: 3, deckSize: 20, maxCopies: 2, language: 'es' });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const chatReply = (content: string) => json({ message: { role: 'assistant', content } });
const ollamaWith = (fetchImpl: FetchLike) => createOllamaClient('http://127.0.0.1:11435', 'qwen2.5:1.5b', fetchImpl);
const chat = (client: OllamaClient, timeoutMs = 1000) =>
  client.chatJson({ system: 's', user: 'u', schema: {}, temperature: 0.3, seed: 1, timeoutMs });
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code);

describe('Ollama client', () => {
  it('returns the parsed structured answer and sends schema, seed and temperature', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => chatReply('{"picks":["c1"]}'));
    await expect(chat(ollamaWith(fetchImpl))).resolves.toEqual({ picks: ['c1'] });
    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: 'qwen2.5:1.5b', stream: false, format: {}, options: { temperature: 0.3, seed: 1 } });
  });

  it('maps invalid JSON, empty answers, missing models and unreachable Ollama', async () => {
    expect(await codeOf(chat(ollamaWith(async () => chatReply('not json at all'))))).toBe('INVALID_MODEL_OUTPUT');
    expect(await codeOf(chat(ollamaWith(async () => chatReply('   '))))).toBe('EMPTY_RESPONSE');
    expect(await codeOf(chat(ollamaWith(async () => json({ error: "model 'qwen2.5:1.5b' not found" }, 404))))).toBe('MODEL_NOT_INSTALLED');
    expect(await codeOf(chat(ollamaWith(async () => {
      throw new TypeError('fetch failed');
    })))).toBe('OLLAMA_UNAVAILABLE');
  });

  it('aggregates pull progress across layers and requires the final success event', async () => {
    const stream = (lines: object[]) => new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const progress: [number, number][] = [];
    await ollamaWith(async () => stream([
      { status: 'pulling manifest' },
      { status: 'pulling a', digest: 'a', total: 1000, completed: 500 },
      { status: 'pulling a', digest: 'a', total: 1000, completed: 1000 },
      { status: 'pulling b', digest: 'b', total: 10, completed: 10 },
      { status: 'success' },
    ])).pull((done, total) => progress.push([done, total]));
    expect(progress).toEqual([[500, 1000], [1000, 1000], [1010, 1010]]);
    // A stream cut before "success" means the model is not installed
    expect(await codeOf(ollamaWith(async () => stream([{ digest: 'a', total: 10, completed: 5 }])).pull())).toBe('MODEL_NOT_INSTALLED');
  });

  it('cancels a pull after the headers arrived by closing the stream', async () => {
    let streamCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ digest: 'a', total: 100, completed: 10 }) + '\n'));
      },
      cancel() {
        streamCancelled = true;
      },
    });
    const controller = new AbortController();
    const pulling = ollamaWith(async () => new Response(body)).pull(() => controller.abort(), controller.signal);
    await expect(pulling).rejects.toBeInstanceOf(OllamaError);
    expect(streamCancelled).toBe(true);
  });

  it('times out slow answers', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await codeOf(chat(ollamaWith(hanging), 20))).toBe('TIMEOUT');
  });
});

describe('deck operation', () => {
  it('sends opaque refs and stats only, with a fixed-size picks schema', () => {
    const { system, user, schema } = buildDeckPrompt(request);
    const prompt = system + user;
    for (const c of CARD_DEFINITIONS) {
      expect(prompt).not.toContain(c.id);
      expect(prompt).not.toContain(c.nombre);
    }
    expect(prompt).toContain('Aggressive');
    expect(schema).toMatchObject({ properties: { picks: { minItems: 20, maxItems: 20 } } });
  });

  it('maps picks back to card ids grouped by quantity', async () => {
    const { refs } = buildDeckPrompt(request);
    const picks = [...Array(10).fill(refs[0]), ...Array(10).fill(refs[1])];
    const ollama = ollamaWith(async () => chatReply(JSON.stringify({ explanation: 'Fast plan', picks })));
    const res = await generateDeckWithModel(request, ollama, { temperature: 0.3, timeoutMs: 1000 });
    expect(res.result.cards).toEqual([
      { id: request.cards[0].id, quantity: 10 },
      { id: request.cards[1].id, quantity: 10 },
    ]);
    expect(res.meta).toMatchObject({ model: 'qwen2.5:1.5b', seed: 3, temperature: 0.3 });
    expect(DeckGenerateResponseSchema.safeParse(res).success).toBe(true);
  });

  it('rejects answers with the wrong shape or no cards', async () => {
    const run = (content: string) => generateDeckWithModel(request, ollamaWith(async () => chatReply(content)), { temperature: 0.3, timeoutMs: 1000 });
    expect(await codeOf(run('{"cards":[{"id":"x"}]}'))).toBe('INVALID_MODEL_OUTPUT');
    expect(await codeOf(run('{"picks":[]}'))).toBe('EMPTY_RESPONSE');
  });
});

describe('local AI HTTP service', () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const config = { ...loadConfig({}), port };
  const fakeOllama: OllamaClient = {
    baseUrl: config.ollamaBaseUrl,
    model: 'qwen2.5:1.5b',
    version: async () => '0.40.16',
    hasModel: async () => true,
    chatJson: vi.fn(async () => ({ explanation: 'ok', picks: Array(20).fill('c1') })),
    pull: async () => undefined,
    warmup: async () => undefined,
  };
  const health = { service: 'ready', status: 'ready', canGenerate: true } as unknown as LocalAiHealth;
  const runtime = {
    state: 'ready' as AiSetupStatus,
    health: vi.fn(async () => health),
    prepare: vi.fn(async () => undefined),
    cancel: vi.fn(),
  };
  const server = createLocalAiServer({ config, ollama: fakeOllama, runtime, log: { error: () => undefined, info: () => undefined } });
  const url = (p: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${p}`;
  const postTo = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url(p), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const post = (body: unknown, headers: Record<string, string> = {}) => postTo('/api/decks/generate', body, headers);

  beforeAll(() => new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve)));
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('listens on loopback only and refuses non-loopback Ollama URLs', () => {
    expect(loadConfig({ LOCAL_AI_HOST: '0.0.0.0' }).host).toBe('127.0.0.1');
    expect(() => loadConfig({ OLLAMA_BASE_URL: 'http://evil.example:11434' })).toThrow();
  });

  it('serves the runtime health and starts / cancels the preparation on request', async () => {
    expect(await (await fetch(url('/health'))).json()).toEqual(health);
    expect((await postTo('/api/setup', {})).status).toBe(200);
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    expect((await postTo('/api/setup/cancel', {})).status).toBe(200);
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    // Setup actions need JSON (CORS preflight) and an allowed origin
    expect((await postTo('/api/setup', 'x', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await postTo('/api/setup', {}, { Origin: 'http://evil.example' })).status).toBe(403);
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
  });

  it('generates a deck with CORS for the allowed origin', async () => {
    const res = await post(request);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    const body = await res.json();
    expect(body.result.cards).toEqual([{ id: request.cards[0].id, quantity: 20 }]);
  });

  it('answers 503 right away while the AI is not ready', async () => {
    const calls = vi.mocked(fakeOllama.chatJson).mock.calls.length;
    runtime.state = 'model_downloading';
    const res = await post(request);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('MODEL_NOT_INSTALLED');
    runtime.state = 'runtime_missing';
    expect((await (await post(request)).json()).error.code).toBe('OLLAMA_UNAVAILABLE');
    runtime.state = 'ready';
    expect(vi.mocked(fakeOllama.chatJson).mock.calls.length).toBe(calls);
  });

  it('rejects other origins, foreign Host headers, invalid input and large bodies', async () => {
    expect((await post(request, { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await post({ ...request, cards: [{ id: 'x' }] })).status).toBe(400);
    expect((await post('{oops')).status).toBe(400);
    const big = { ...request, cards: request.cards.map((c) => ({ ...c, padding: 'x'.repeat(10000) })) };
    const tooLarge = await post(big);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'PAYLOAD_TOO_LARGE' } });
    const { status } = await new Promise<{ status: number }>((resolve) => {
      import('node:http').then(({ request: req }) => {
        const r = req({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: '/health', headers: { Host: 'evil.example' } }, (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0 });
        });
        r.end();
      });
    });
    expect(status).toBe(403);
  });

  it('returns normalised errors without stack traces', async () => {
    vi.mocked(fakeOllama.chatJson).mockRejectedValueOnce(new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is not reachable'));
    const res = await post(request);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: 'OLLAMA_UNAVAILABLE', message: 'Ollama is not reachable' } });
    vi.mocked(fakeOllama.chatJson).mockRejectedValueOnce(new Error('secret internals'));
    const crash = await post(request);
    expect(crash.status).toBe(500);
    expect(JSON.stringify(await crash.json())).not.toContain('secret internals');
  });
});

describe('browser client', () => {
  it('maps HTTP errors, network failures, timeouts and cancellation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(json({ error: { code: 'MODEL_NOT_INSTALLED' } }, 503));
    expect(await codeOf(requestDeckGeneration(request))).toBe('MODEL_NOT_INSTALLED');
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await codeOf(requestDeckGeneration(request))).toBe('NETWORK');
    fetchSpy.mockResolvedValueOnce(json({ result: { cards: 'nope' } }));
    expect(await codeOf(requestDeckGeneration(request))).toBe('INVALID_MODEL_OUTPUT');

    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    fetchSpy.mockImplementationOnce(hang);
    expect(await codeOf(requestDeckGeneration(request, { timeoutMs: 20 }))).toBe('TIMEOUT');
    fetchSpy.mockImplementationOnce(hang);
    const controller = new AbortController();
    const pending = callLocalAi('/x', {}, DeckGenerateResponseSchema, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toEqual(new LocalAiError('CANCELLED'));
    fetchSpy.mockRestore();
  });
});
