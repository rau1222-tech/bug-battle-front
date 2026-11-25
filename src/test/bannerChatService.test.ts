import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS } from '@/constants';
import type { AiSetupStatus, LocalAiHealth } from '@/game/deckGenerator/contract';
import type { BannerChatRequest } from '@/game/bannerChat/contract';
import { buildBannerChatRequest } from '@/game/bannerChat/facts';
import type { Banner } from '@/lib/banners';
import { loadConfig } from '../../local-ai/config';
import { bannerChatWithModel, buildBannerChatPrompt } from '../../local-ai/bannerChat';
import { OllamaError, type ChatJsonOptions, type OllamaClient } from '../../local-ai/ollama';
import { createLocalAiServer } from '../../local-ai/server';

const banner = (id: string, titulo: string, cards: [string, number][]): Banner => ({
  id,
  titulo,
  fechaInicio: '2026-01-01T00:00:00Z',
  fechaFin: '2099-01-01T00:00:00Z',
  coste: 100,
  cartasPorSobre: 3,
  cards: cards.map(([cardId, pesoAparicion]) => ({ cardId, pesoAparicion })),
});
const build = (message: string, history: BannerChatRequest['history'] = []) =>
  buildBannerChatRequest({
    message,
    language: 'es',
    seed: 5,
    history,
    banners: [banner('b-back', 'Backend', [['senior-dev', 25], ['hotfix', 75]]), banner('b-qa', 'QA Team', [['qa-lead', 1]])],
    cards: CARD_DEFINITIONS,
    collection: { 'junior-dev': 1 },
    gold: 250,
    rarityOf: () => 'raro',
    nameOf: (c) => c.nombre,
  }).request;

function fakeOllama(reply: unknown | ((o: ChatJsonOptions) => unknown)): OllamaClient & { chatJson: ReturnType<typeof vi.fn> } {
  return {
    baseUrl: 'http://127.0.0.1:11435',
    model: 'qwen2.5:1.5b',
    version: async () => '0.40.16',
    hasModel: async () => true,
    pull: async () => undefined,
    warmup: async () => undefined,
    chatJson: vi.fn(async (o: ChatJsonOptions) => (typeof reply === 'function' ? (reply as (o: ChatJsonOptions) => unknown)(o) : reply)),
  };
}
const run = (req: BannerChatRequest, ollama: OllamaClient) => bannerChatWithModel(req, ollama, { temperature: 0.2, timeoutMs: 1000 });
/** Card-location answer in the fixtures: Hotfix is only in "Backend" (75 %). */
const answer = (patch: Record<string, unknown> = {}) => ({
  category: 'card_location',
  answer: 'Hotfix está en Backend con un 75% por extracción.',
  banners: ['b1'],
  cards: ['c2'],
  confidence: 'high',
  limitations: [],
  ...patch,
});
const HOTFIX_Q = '¿Dónde puedo conseguir Hotfix?';

describe('banner chat operation', () => {
  it('sends opaque refs and data separated from the question, with a closed schema', () => {
    const req = build('¿Qué banner me conviene?');
    const { system, user, schema } = buildBannerChatPrompt(req);
    expect(system).not.toContain('Backend');
    expect(system).not.toContain('¿Qué banner');
    const payload = JSON.parse(user);
    expect(payload.question).toBe('¿Qué banner me conviene?');
    expect(payload.data.banners[0]).toMatchObject({ ref: 'b1', title: 'Backend', costGold: 100, packsAffordable: 2 });
    expect(JSON.stringify(payload)).not.toContain('senior-dev');
    expect(schema).toMatchObject({ properties: { banners: { items: { enum: ['b1', 'b2'] }, maxItems: 2 }, category: { enum: expect.arrayContaining(['off_topic']) } } });
  });

  it('returns a valid grounded answer with real ids', async () => {
    const res = await run(build(HOTFIX_Q), fakeOllama(answer()));
    expect(res.result).toEqual({
      category: 'card_location',
      allowed: true,
      answer: 'Hotfix está en Backend con un 75% por extracción.',
      recommendedBannerIds: ['b-back'],
      mentionedCardIds: ['hotfix'],
      confidence: 'high',
      limitations: [],
    });
    expect(res.meta).toMatchObject({ model: 'qwen2.5:1.5b', seed: 5 });
  });
  it('repeats the scope filter and never calls the model for obvious rejections', async () => {
    const ollama = fakeOllama(answer());
    const res = await run(build('Dame una consulta SQL.'), ollama);
    expect(res.result).toMatchObject({ allowed: false, category: 'code_request', recommendedBannerIds: [] });
    expect(res.result.answer).toBeUndefined();
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });

  it('computes allowed from the closed category and hides the text of rejected ones', async () => {
    const res = await run(build('¿Y por qué esa carta?', [{ role: 'user', text: '¿Qué banner?' }]), fakeOllama(answer({ category: 'off_topic', answer: 'París.' })));
    expect(res.result).toMatchObject({ allowed: false, category: 'off_topic' });
    expect(res.result.answer).toBeUndefined();
  });

  it('drops invented refs and replaces leaked refs by real names', async () => {
    const res = await run(build(HOTFIX_Q), fakeOllama(answer({ banners: ['b9'], cards: ['c99'], answer: 'c2 está en b1 con un 75% por extracción.' })));
    expect(res.result.answer).toBe('Hotfix de Emergencia está en Backend con un 75% por extracción.');
    expect(res.result.recommendedBannerIds).toEqual(['b-back']);
    expect(res.result.mentionedCardIds).toEqual(['hotfix']);
  });

  it('removes unsafe or ungrounded text', async () => {
    const code = await run(build(HOTFIX_Q), fakeOllama(answer({ answer: 'Visita https://evil.example para más.' })));
    expect(code.result.allowed).toBe(true);
    expect(code.result.answer).toBeUndefined();
    const odds = await run(build(HOTFIX_Q), fakeOllama(answer({ answer: 'Hotfix está en Backend. Tienes un 90% de conseguir Hotfix. Está garantizado en 4 sobres.' })));
    expect(odds.result.answer).toBe('Hotfix está en Backend.');
    expect(odds.result.limitations).toEqual(expect.arrayContaining(['NO_PROBABILITY_DATA', 'NO_GUARANTEE_INFO']));
  });

  // Cases observed with the real model
  it('drops odds of another card, cards placed in the wrong banner and cumulative claims', async () => {
    const wrong = await run(build(HOTFIX_Q), fakeOllama(answer({ answer: 'Hotfix sale con un 25% en Backend. Hotfix está en QA Team. Con 2 sobres tienes un 75% de conseguirla.' })));
    expect(wrong.result.answer).toBeUndefined();
    expect(wrong.result.recommendedBannerIds).toEqual(['b-back']);
    expect(wrong.result.limitations).toContain('NO_PROBABILITY_DATA');
  });

  it('follows the deterministic ranking and the strategy asked for', async () => {
    const req = build('¿Qué banner me conviene para un mazo defensivo?');
    const top = req.banners.find((b) => b.rank.defensive === 1)!;
    const other = req.banners.find((b) => b.id !== top.id)!;
    const contradicts = await run(req, fakeOllama(answer({ category: 'banner_recommendation', answer: `Te conviene ${other.title}.`, banners: ['b1', 'b2'] })));
    expect(contradicts.result.answer).toBeUndefined();
    expect(contradicts.result.recommendedBannerIds).toEqual([top.id]);
    const otherStrategy = await run(req, fakeOllama(answer({ category: 'banner_recommendation', answer: `Para un mazo agresivo te conviene ${top.title}.` })));
    expect(otherStrategy.result.answer).toBeUndefined();
    const ok = await run(req, fakeOllama(answer({ category: 'banner_recommendation', answer: `Para un mazo defensivo te conviene ${top.title}.` })));
    expect(ok.result.answer).toBe(`Para un mazo defensivo te conviene ${top.title}.`);
  });

  it('drops invented numbers, cut-off sentences and a card placed in two banners', async () => {
    const res = await run(build(HOTFIX_Q), fakeOllama(answer({
      answer: 'Hotfix está en Backend. Sale 3 de cada 10 jugadas. Hotfix está en Backend y QA Team. Cuesta 100 de oro por sobre y',
    })));
    expect(res.result.answer).toBe('Hotfix está en Backend.');
  });

  it('keeps card questions on the banners that really contain the card, without internal field names', async () => {
    const res = await run(build('Where can I get Hotfix?'), fakeOllama(answer({
      category: 'other_allowed',
      answer: 'This card is in the QA Team banner. It has a perDrawPct of 75.',
      banners: ['b2'],
    })));
    expect(res.result.answer).toBeUndefined();
    expect(res.result.recommendedBannerIds).toEqual(['b-back']);
    expect(res.result.mentionedCardIds).toEqual(['hotfix']);
  });

  it('drops recommended cards that are not in the recommended banner', async () => {
    const req = build('¿Qué banner me conviene para un mazo agresivo?');
    const top = req.banners.find((b) => b.rank.aggressive === 1)!;
    const foreign = req.cards.find((c) => !top.cards.some((x) => x.id === c.id) && c.inBanners.length > 0)!;
    const res = await run(req, fakeOllama(answer({ category: 'banner_recommendation', answer: `Te conviene ${top.title}. ${foreign.name} es muy buena.` })));
    expect(res.result.answer).toBe(`Te conviene ${top.title}.`);
  });

  it('rejects answers that ignore banners (e.g. "poems") even if the model allowed them', async () => {
    const res = await run(build('¿Y por qué no lo explicas mejor?', [{ role: 'user', text: '¿Qué banner me conviene?' }]), fakeOllama(answer({
      category: 'other_allowed',
      answer: 'No puedo hacerlo ahora. Si me das más información sobre lo que quieres, te ayudo.',
    })));
    expect(res.result).toMatchObject({ allowed: false, category: 'off_topic' });
  });

  it('treats an allowed-looking answer with no banner or card content as out of scope', async () => {
    const res = await run(build('¿Y cuál es la capital de Francia?', [{ role: 'user', text: '¿Qué banner me conviene?' }]), fakeOllama(answer({ category: 'other_allowed', answer: 'La capital de Francia es París.' })));
    expect(res.result).toMatchObject({ allowed: false, category: 'off_topic' });
    expect(res.result.answer).toBeUndefined();
  });

  it('adds limitations from the question and the facts, not from the model', async () => {
    const res = await run(build('¿Cuántos sobres necesito para asegurar Hotfix?'), fakeOllama(answer({ category: 'banner_probability', answer: 'Hotfix sale con un 75% por extracción en Backend.', limitations: ['NO_FUTURE_BANNERS'] })));
    expect(res.result.limitations).toEqual(expect.arrayContaining(['NO_GUARANTEE_INFO', 'NO_PROBABILITY_DATA', 'RANDOM_RESULTS']));
    expect(res.result.limitations).not.toContain('NO_FUTURE_BANNERS');
    const claim = await run(build('¿Cuántos sobres tengo que comprar para asegurar Hotfix?'), fakeOllama(answer({ category: 'other_allowed', answer: 'No necesitas más sobres porque Hotfix ya está en Backend.' })));
    expect(claim.result.answer).toBeUndefined();
    expect(claim.result.limitations).toEqual(expect.arrayContaining(['NO_GUARANTEE_INFO', 'NO_PROBABILITY_DATA']));
    const nowhere = await run(build('¿Dónde consigo Architect?'), fakeOllama(answer({ answer: 'Architect no está en ningún banner activo.', cards: [] })));
    expect(nowhere.result.limitations).toContain('CARD_NOT_AVAILABLE');
    expect(nowhere.result.mentionedCardIds).toEqual(['architect']);
  });
  it('maps invalid JSON, empty answers and timeouts to normalised errors', async () => {
    const codeOf = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code);
    expect(await codeOf(run(build('¿Qué banner?'), fakeOllama({ nope: true })))).toBe('INVALID_MODEL_OUTPUT');
    const failing = (code: 'EMPTY_RESPONSE' | 'TIMEOUT') => fakeOllama(() => {
      throw new OllamaError(code);
    });
    expect(await codeOf(run(build('¿Qué banner?'), failing('EMPTY_RESPONSE')))).toBe('EMPTY_RESPONSE');
    expect(await codeOf(run(build('¿Qué banner?'), failing('TIMEOUT')))).toBe('TIMEOUT');
  });
});

describe('POST /api/banners/chat', () => {
  const port = 19000 + Math.floor(Math.random() * 900);
  const config = { ...loadConfig({}), port, debug: true };
  const logs: string[] = [];
  const ollama = fakeOllama(answer());
  const runtime = {
    state: 'ready' as AiSetupStatus,
    health: vi.fn(async () => ({ status: 'ready' }) as unknown as LocalAiHealth),
    prepare: vi.fn(async () => undefined),
    cancel: vi.fn(),
  };
  const server = createLocalAiServer({ config, ollama, runtime, log: { info: (m: string) => logs.push(m), error: () => undefined } });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/banners/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeAll(() => new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve)));
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('answers with CORS and logs only metrics', async () => {
    const res = await post(build(HOTFIX_Q));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    expect((await res.json()).result.recommendedBannerIds).toEqual(['b-back']);
    const line = logs.at(-1)!;
    expect(line).toMatch(/banners\.chat category=card_location allowed=true model=qwen2\.5:1\.5b seed=5 banners=2 cards=\d+ \d+ ms/);
    expect(line).not.toMatch(/Hotfix|conseguir|Backend|75%/);
  });

  it('answers 503 while the shared AI is not ready, without calling the model', async () => {
    const calls = ollama.chatJson.mock.calls.length;
    runtime.state = 'model_downloading';
    const res = await post(build('¿Qué banner?'));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('MODEL_NOT_INSTALLED');
    runtime.state = 'ready';
    expect(ollama.chatJson.mock.calls.length).toBe(calls);
  });

  it('rejects other origins, invalid input, oversized bodies and extra fields', async () => {
    expect((await post(build('¿Qué banner?'), { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await post({ message: 'hola' })).status).toBe(400);
    expect((await post({ ...build('¿Qué banner?'), userId: 'u1' })).status).toBe(400);
    expect((await post({ ...build('¿Qué banner?'), message: 'x'.repeat(70000) })).status).toBe(413);
  });

  it('maps model failures and cancellation to normalised errors', async () => {
    ollama.chatJson.mockRejectedValueOnce(new OllamaError('TIMEOUT', 'slow'));
    const res = await post(build('¿Qué banner?'));
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 'TIMEOUT', message: 'slow' } });
    expect(logs.at(-1)).toMatch(/error=TIMEOUT/);

    let aborted = false;
    let called!: () => void;
    const modelCalled = new Promise<void>((r) => (called = r));
    ollama.chatJson.mockImplementationOnce((o: ChatJsonOptions) => new Promise((_r, reject) => {
      called();
      o.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new OllamaError('INTERNAL', 'aborted'));
      });
    }));
    // The browser cancelling (connection closed) must abort the model call
    const { request: httpRequest } = await import('node:http');
    const body = JSON.stringify(build('¿Qué banner?'));
    const req = httpRequest({
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      path: '/api/banners/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => undefined);
    req.end(body);
    await modelCalled;
    req.destroy();
    for (let i = 0; i < 40 && !aborted; i++) await new Promise((r) => setTimeout(r, 25));
    expect(aborted).toBe(true);
  });
});
