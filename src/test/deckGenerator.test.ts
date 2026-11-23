import { describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS, DECK_SIZE, MAX_COPIES } from '@/constants';
import type { DeckGenerateRequest, DeckGenerateResponse, Strategy } from '@/game/deckGenerator/contract';
import {
  buildDeckRequest,
  catalogInfo,
  generateFallbackDeck,
  repairProposal,
  validateDeck,
  type DeckEntry,
} from '@/game/deckGenerator/deckRules';
import { runDeckGeneration, type DeckModelClient } from '@/game/deckGenerator/generation';
import { LocalAiError } from '@/lib/localAiClient';

const FULL = Object.fromEntries(CARD_DEFINITIONS.map((c) => [c.id, 2]));
const catalog = catalogInfo(CARD_DEFINITIONS);
const request = (strategy: Strategy = 'balanced', collection: Record<string, number> = FULL, seed = 7) =>
  buildDeckRequest(CARD_DEFINITIONS, collection, { strategy, seed, deckSize: DECK_SIZE, maxCopies: MAX_COPIES });
const total = (cards: DeckEntry[]) => cards.reduce((a, c) => a + c.quantity, 0);
const codes = (cards: DeckEntry[], req: DeckGenerateRequest) => validateDeck(cards, req, catalog).map((i) => i.code);
const typeCount = (cards: DeckEntry[], tipo: string) =>
  cards.filter((c) => CARD_DEFINITIONS.find((d) => d.id === c.id)!.tipo === tipo).reduce((a, c) => a + c.quantity, 0);
/** 10 distinct cards × 2 copies. */
const VALID: DeckEntry[] = CARD_DEFINITIONS.slice(0, 10).map((c) => ({ id: c.id, quantity: 2 }));

describe('buildDeckRequest', () => {
  it('only sends owned, playable cards with game stats (no names, descriptions or media)', () => {
    const req = request('balanced', { 'senior-dev': 1, 'hotfix': 3, 'ghost-card': 2 });
    expect(req.cards.map((c) => c.id)).toEqual(['hotfix', 'senior-dev']);
    expect(JSON.stringify(req)).not.toMatch(/nombre|descripcion|image|audio|Senior Dev/);
    expect(req.cards[1]).toMatchObject({ type: 'programador', owned: 1, cost: 3, power: 3, attackCost: 1, sanityMax: 4 });
    expect(req.cards[1].skills[0]).toEqual({ action: 'APLICAR_ESTADO', target: 'carta_aliada', power: 2, cost: 1, duration: 2 });
  });
});

describe('validateDeck', () => {
  const req = request();

  it('accepts exactly 20 owned cards within the copy limit', () => {
    expect(codes(VALID, req)).toEqual([]);
  });

  it('rejects a wrong total', () => {
    expect(codes(VALID.slice(1), req)).toContain('WRONG_TOTAL');
    expect(codes([...VALID, { id: 'hotfix', quantity: 1 }], req)).toContain('WRONG_TOTAL');
  });

  it('rejects more than 2 copies and more than owned', () => {
    const limited = request('balanced', { ...FULL, 'junior-dev': 1 });
    const deck = [{ id: 'junior-dev', quantity: 3 }, ...VALID.slice(1, 9), { id: 'hotfix', quantity: 1 }];
    expect(codes(deck, limited)).toEqual(expect.arrayContaining(['EXCEEDS_MAX_COPIES', 'EXCEEDS_OWNED']));
  });

  it('rejects unknown, unowned and duplicated cards', () => {
    const partial = request('balanced', { ...FULL, hotfix: 0 });
    const deck = [...VALID.slice(0, 9), { id: 'hotfix', quantity: 1 }, { id: 'nope', quantity: 1 }];
    expect(codes(deck, partial)).toEqual(expect.arrayContaining(['NOT_OWNED', 'UNKNOWN_CARD']));
    expect(codes([...VALID.slice(0, 9), { id: VALID[0].id, quantity: 2 }], req)).toContain('DUPLICATE_ID');
  });

  it('rejects non-integer and non-positive quantities', () => {
    expect(codes([{ id: 'intern', quantity: 1.5 }, { id: 'mid-dev', quantity: 0 }], req)).toEqual(
      expect.arrayContaining(['NOT_AN_INTEGER', 'NON_POSITIVE']),
    );
  });
});

describe('repairProposal', () => {
  const req = request('aggressive');
  const repair = (cards: DeckEntry[], r: DeckGenerateRequest = req) => repairProposal({ cards }, r, 1);

  it('merges duplicated ids and caps copies', () => {
    const r = repair([{ id: 'senior-dev', quantity: 1 }, { id: 'senior-dev', quantity: 2 }, ...VALID.slice(1)]);
    expect(r.ok && r.actions).toEqual(expect.arrayContaining(['MERGED_DUPLICATES', 'CAPPED_COPIES']));
    expect(r.ok && codes(r.cards, req)).toEqual([]);
  });

  it('caps quantities to the owned copies', () => {
    const limited = request('aggressive', { ...FULL, 'senior-dev': 1 });
    const r = repair([{ id: 'senior-dev', quantity: 2 }, ...VALID.slice(1)], limited);
    expect(r.ok && r.cards.find((c) => c.id === 'senior-dev')?.quantity).toBe(1);
    expect(r.ok && codes(r.cards, limited)).toEqual([]);
  });

  it('drops unknown, unowned and invalid entries, then fills', () => {
    const partial = request('aggressive', { ...FULL, hotfix: 0 });
    const r = repair([...VALID.slice(0, 5), { id: 'nope', quantity: 2 }, { id: 'hotfix', quantity: 2 }, { id: 'intern', quantity: -1 }, { id: 'architect', quantity: 1.7 }], partial);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actions).toEqual(expect.arrayContaining(['DROPPED_UNKNOWN_OR_UNOWNED', 'DROPPED_INVALID_QUANTITY', 'NORMALIZED_QUANTITY', 'FILLED_MISSING']));
    expect(r.cards.some((c) => c.id === 'hotfix' || c.id === 'nope')).toBe(false);
    expect(codes(r.cards, partial)).toEqual([]);
  });

  it('completes an incomplete deck and trims an oversized one', () => {
    const short = repair(VALID.slice(0, 6));
    expect(short.ok && short.actions).toContain('FILLED_MISSING');
    expect(short.ok && total(short.cards)).toBe(20);
    const big = repair(CARD_DEFINITIONS.map((c) => ({ id: c.id, quantity: 2 })));
    expect(big.ok && big.actions).toContain('TRIMMED_EXTRA');
    expect(big.ok && codes(big.cards, req)).toEqual([]);
  });

  it('cannot repair when the collection has fewer than 20 usable copies', () => {
    const small = request('balanced', Object.fromEntries(CARD_DEFINITIONS.slice(0, 9).map((c) => [c.id, 2])));
    expect(repair(VALID, small)).toEqual({ ok: false, code: 'INSUFFICIENT_COLLECTION' });
  });
});

describe('generateFallbackDeck', () => {
  it.each(['balanced', 'aggressive', 'defensive'] as const)('builds a valid %s deck', (strategy) => {
    for (const seed of [1, 2, 3, 42]) {
      const req = request(strategy, FULL, seed);
      const deck = generateFallbackDeck(req, seed)!;
      expect(codes(deck, req)).toEqual([]);
    }
  });

  it('reflects the strategy in the deck shape', () => {
    const seed = 5;
    const aggressive = generateFallbackDeck(request('aggressive', FULL, seed), seed)!;
    const defensive = generateFallbackDeck(request('defensive', FULL, seed), seed)!;
    expect(typeCount(defensive, 'qa')).toBeGreaterThan(typeCount(aggressive, 'qa'));
    expect(typeCount(aggressive, 'programador')).toBeGreaterThanOrEqual(typeCount(defensive, 'programador'));
  });

  it('is deterministic for a fixed seed and varies across seeds', () => {
    expect(generateFallbackDeck(request('balanced', FULL, 9), 9)).toEqual(generateFallbackDeck(request('balanced', FULL, 9), 9));
    const decks = new Set([1, 2, 3, 4, 5, 6, 7, 8, 99, 1234].map((s) => JSON.stringify(generateFallbackDeck(request('balanced', FULL, s), s))));
    expect(decks.size).toBeGreaterThan(1);
  });

  it('respects owned copies and returns null for an insufficient collection', () => {
    const col = { ...FULL, 'senior-dev': 1, architect: 1 };
    const req = request('aggressive', col);
    const deck = generateFallbackDeck(req, 1)!;
    expect(deck.find((c) => c.id === 'senior-dev')?.quantity ?? 0).toBeLessThanOrEqual(1);
    expect(generateFallbackDeck(request('balanced', { 'senior-dev': 2 }), 1)).toBeNull();
  });
});

describe('runDeckGeneration', () => {
  const req = request('balanced');
  const modelResponse = (cards: DeckEntry[]): DeckGenerateResponse => ({
    result: { strategy: 'balanced', cards, explanation: 'Plan' },
    meta: { model: 'qwen2.5:1.5b', seed: 7, temperature: 0.3, durationMs: 10 },
  });
  const run = (client: DeckModelClient, r = req, signal = new AbortController().signal) =>
    runDeckGeneration({ request: r, client, signal, catalog });

  it('uses a valid model answer as is', async () => {
    const out = await run(async () => modelResponse(VALID));
    expect(out).toMatchObject({ ok: true, source: 'ai', model: 'qwen2.5:1.5b', cards: VALID });
  });

  it('repairs a fixable model answer', async () => {
    const out = await run(async () => modelResponse([...VALID.slice(0, 9), { id: 'nope', quantity: 2 }]));
    expect(out).toMatchObject({ ok: true, source: 'ai_repaired' });
    expect(out.ok && codes(out.cards, req)).toEqual([]);
  });

  it.each(['OLLAMA_UNAVAILABLE', 'MODEL_NOT_INSTALLED', 'TIMEOUT', 'INVALID_MODEL_OUTPUT', 'EMPTY_RESPONSE', 'NETWORK'] as const)(
    'falls back to the deterministic generator on %s',
    async (code) => {
      const out = await run(async () => {
        throw new LocalAiError(code);
      });
      expect(out).toMatchObject({ ok: true, source: 'fallback', fallbackReason: code });
      expect(out.ok && codes(out.cards, req)).toEqual([]);
      expect(out.ok && out.model).toBeUndefined();
    },
  );

  it('falls back when the model answer has an unrepairable shape', async () => {
    // The service turns any answer that doesn't match the deck schema into INVALID_MODEL_OUTPUT
    const out = await run(async () => {
      throw new LocalAiError('INVALID_MODEL_OUTPUT');
    });
    expect(out).toMatchObject({ ok: true, source: 'fallback', fallbackReason: 'INVALID_MODEL_OUTPUT' });
  });

  it('falls back when the model answer cannot be repaired', async () => {
    const out = await run(async () => modelResponse([{ id: 'nope', quantity: 2 }, { id: 'intern', quantity: 2 }]));
    expect(out).toMatchObject({ ok: true, source: 'fallback', fallbackReason: 'UNREPAIRABLE' });
    expect(out.ok && out.model).toBeUndefined();
    expect(out.ok && codes(out.cards, req)).toEqual([]);
  });

  it('skips the model when the player chooses the backup generator, and reports timings', async () => {
    const client = vi.fn();
    const out = await runDeckGeneration({ request: req, client, signal: new AbortController().signal, catalog, useModel: false });
    expect(client).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: true, source: 'fallback', fallbackReason: 'USER_CHOSE_FALLBACK' });
    expect(out.ok && out.metrics.totalMs).toBeGreaterThanOrEqual(0);
    expect(out.ok && codes(out.cards, req)).toEqual([]);
  });

  it('records model, validation and repair timings for AI results', async () => {
    const out = await run(async () => modelResponse([...VALID.slice(0, 9), { id: 'nope', quantity: 2 }]));
    expect(out.ok && out.metrics).toEqual(expect.objectContaining({ modelMs: expect.any(Number), validateMs: expect.any(Number), repairMs: expect.any(Number) }));
    expect(out.ok && out.repairs).toContain('FILLED_MISSING');
  });

  it('reports an insufficient collection without calling the model', async () => {
    const client = vi.fn();
    const out = await run(client, request('balanced', { 'senior-dev': 2, hotfix: 2 }));
    expect(out).toEqual({ ok: false, code: 'INSUFFICIENT_COLLECTION', available: 4, required: 20 });
    expect(client).not.toHaveBeenCalled();
  });

  it('returns CANCELLED when aborted', async () => {
    const controller = new AbortController();
    const out = await run(async () => {
      controller.abort();
      throw new LocalAiError('CANCELLED');
    }, req, controller.signal);
    expect(out).toEqual({ ok: false, code: 'CANCELLED' });
  });
});
