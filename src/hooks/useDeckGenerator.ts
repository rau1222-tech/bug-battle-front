import { useCallback, useEffect, useRef, useState } from 'react';
import { DECK_SIZE, MAX_COPIES, type CardTemplate } from '@/constants';
import type { Strategy } from '@/game/deckGenerator/contract';
import { buildDeckRequest, catalogInfo } from '@/game/deckGenerator/deckRules';
import { runDeckGeneration, type DeckModelClient, type GenerationOutcome } from '@/game/deckGenerator/generation';
import { fetchCollection, type Collection } from '@/hooks/useCollection';
import { requestDeckGeneration } from '@/lib/localAiClient';

export type DeckGeneratorStatus =
  | 'idle'
  | 'selecting'
  | 'generating'
  | 'validating'
  | 'repairing'
  | 'fallback'
  | 'success'
  | 'error'
  | 'cancelled';

export type DeckGeneratorError =
  | { code: 'INSUFFICIENT_COLLECTION'; available: number; required: number }
  | { code: 'COLLECTION_ERROR' }
  | { code: 'GENERATION_FAILED' };

export type DeckGeneratorSuccess = Extract<GenerationOutcome, { ok: true }>;

const BUSY: DeckGeneratorStatus[] = ['generating', 'validating', 'repairing', 'fallback'];
export const isGeneratorBusy = (s: DeckGeneratorStatus) => BUSY.includes(s);

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;

interface Options {
  userId: string;
  cards: CardTemplate[];
  language?: 'es' | 'en' | 'fr';
  /** Overridable for tests. */
  client?: DeckModelClient;
  loadCollection?: (userId: string) => Promise<Collection>;
}

const defaultClient: DeckModelClient = (request, signal) => requestDeckGeneration(request, { signal });

/**
 * Orchestrates one generation at a time: reads the real collection, runs model → validation → repair → fallback,
 * and ignores results that became stale (cancel, regenerate or unmount). It never touches the editor itself.
 */
export function useDeckGenerator({ userId, cards, language, client = defaultClient, loadCollection = fetchCollection }: Options) {
  const [status, setStatus] = useState<DeckGeneratorStatus>('idle');
  const [error, setError] = useState<DeckGeneratorError | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    if (!busyRef.current) return;
    requestRef.current++;
    busyRef.current = false;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus('cancelled');
  }, []);

  const select = useCallback(() => {
    if (busyRef.current) return;
    setError(null);
    setStatus('selecting');
  }, []);

  const reset = useCallback(() => {
    cancel();
    setError(null);
    setStatus('idle');
  }, [cancel]);

  const generate = useCallback(
    async (strategy: Strategy, options: { seed?: number; useModel?: boolean } = {}): Promise<DeckGeneratorSuccess | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      const id = ++requestRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      const stale = () => id !== requestRef.current || !mountedRef.current;
      const finish = (next: DeckGeneratorStatus, err: DeckGeneratorError | null = null) => {
        busyRef.current = false;
        controllerRef.current = null;
        setError(err);
        setStatus(next);
      };

      setError(null);
      setStatus('generating');
      let collection: Collection;
      try {
        collection = await loadCollection(userId);
      } catch {
        if (!stale()) finish('error', { code: 'COLLECTION_ERROR' });
        return null;
      }
      if (stale()) return null;

      const request = buildDeckRequest(cards, collection, {
        strategy,
        seed: options.seed ?? randomSeed(),
        deckSize: DECK_SIZE,
        maxCopies: MAX_COPIES,
        language,
      });
      const outcome = await runDeckGeneration({
        request,
        client,
        signal: controller.signal,
        catalog: catalogInfo(cards),
        useModel: options.useModel ?? true,
        onPhase: (phase) => {
          if (!stale()) setStatus(phase);
        },
      });
      if (stale()) return null;

      if ('code' in outcome) {
        if (outcome.code === 'CANCELLED') finish('cancelled');
        else finish('error', outcome);
        return null;
      }
      if (import.meta.env.DEV) {
        // Development-only timings; no collection, prompt or user data
        console.debug('[local-ai] deck generation', {
          source: outcome.source,
          model: outcome.model ?? null,
          seed: outcome.seed,
          repairs: outcome.repairs,
          fallbackReason: outcome.fallbackReason ?? null,
          ...outcome.metrics,
        });
      }
      finish('success');
      return outcome;
    },
    [userId, cards, language, client, loadCollection],
  );

  return { status, error, busy: isGeneratorBusy(status), select, generate, cancel, reset };
}
