/**
 * Generation pipeline: model proposal → zod/domain validation → deterministic repair → fallback.
 * Pure (no React), so the hook stays thin and the pipeline is testable with a fake client.
 */
import type { DeckGenerateRequest, DeckGenerateResponse } from './contract';
import {
  generateFallbackDeck,
  poolCapacity,
  repairProposal,
  validateDeck,
  type CatalogInfo,
  type DeckEntry,
  type RepairAction,
} from './deckRules';

export type GenerationPhase = 'generating' | 'validating' | 'repairing' | 'fallback';
export type GenerationSource = 'ai' | 'ai_repaired' | 'fallback';

/** Normalised reason for using the fallback: a client/service error code, an unrepairable proposal, or the player's choice. */
export type FallbackReason = string;

/** Transient timings in ms (never persisted). */
export interface GenerationMetrics {
  modelMs?: number;
  validateMs?: number;
  repairMs?: number;
  fallbackMs?: number;
  totalMs: number;
}

export type GenerationOutcome =
  | {
      ok: true;
      cards: DeckEntry[];
      source: GenerationSource;
      seed: number;
      model?: string;
      repairs: RepairAction[];
      fallbackReason?: FallbackReason;
      metrics: GenerationMetrics;
    }
  | { ok: false; code: 'INSUFFICIENT_COLLECTION'; available: number; required: number }
  | { ok: false; code: 'CANCELLED' }
  | { ok: false; code: 'GENERATION_FAILED' };

export type DeckModelClient = (request: DeckGenerateRequest, signal: AbortSignal) => Promise<DeckGenerateResponse>;

const errorCode = (err: unknown) =>
  err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : 'NETWORK';

export async function runDeckGeneration(params: {
  request: DeckGenerateRequest;
  client: DeckModelClient;
  signal: AbortSignal;
  catalog?: CatalogInfo;
  /** false = the player chose the backup generator (or the AI is not ready): skip the model. */
  useModel?: boolean;
  onPhase?: (phase: GenerationPhase) => void;
  now?: () => number;
}): Promise<GenerationOutcome> {
  const { request, client, signal, catalog, useModel = true, onPhase, now = () => performance.now() } = params;
  const started = now();
  const metrics: Partial<GenerationMetrics> = {};
  const seed = request.seed;
  const available = poolCapacity(request);
  if (available < request.deckSize) {
    return { ok: false, code: 'INSUFFICIENT_COLLECTION', available, required: request.deckSize };
  }

  let fallbackReason: FallbackReason = 'USER_CHOSE_FALLBACK';
  if (useModel) {
    onPhase?.('generating');
    try {
      const t0 = now();
      const response = await client(request, signal);
      metrics.modelMs = now() - t0;
      if (signal.aborted) return { ok: false, code: 'CANCELLED' };
      const { result, meta } = response;

      onPhase?.('validating');
      const t1 = now();
      const proposal: DeckEntry[] = result.cards.map((c) => ({ id: c.id, quantity: c.quantity }));
      const valid = validateDeck(proposal, request, catalog).length === 0;
      metrics.validateMs = now() - t1;
      if (valid) {
        return { ok: true, cards: proposal, source: 'ai', seed, model: meta.model, repairs: [], metrics: { ...metrics, totalMs: now() - started } };
      }

      onPhase?.('repairing');
      const t2 = now();
      const repaired = repairProposal(result, request, seed);
      metrics.repairMs = now() - t2;
      if (repaired.ok) {
        return {
          ok: true,
          cards: repaired.cards,
          source: 'ai_repaired',
          seed,
          model: meta.model,
          repairs: repaired.actions,
          metrics: { ...metrics, totalMs: now() - started },
        };
      }
      fallbackReason = 'UNREPAIRABLE';
    } catch (err) {
      if (signal.aborted || errorCode(err) === 'CANCELLED') return { ok: false, code: 'CANCELLED' };
      fallbackReason = errorCode(err);
    }
  }

  onPhase?.('fallback');
  const t3 = now();
  const cards = generateFallbackDeck(request, seed);
  metrics.fallbackMs = now() - t3;
  if (!cards || validateDeck(cards, request, catalog).length > 0) return { ok: false, code: 'GENERATION_FAILED' };
  return { ok: true, cards, source: 'fallback', seed, repairs: [], fallbackReason, metrics: { ...metrics, totalMs: now() - started } };
}
