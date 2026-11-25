import { useCallback, useEffect, useRef, useState } from 'react';
import type { BannerChatRequest, BannerChatResponse, ChatCategory, ChatHistoryEntry, ChatLimitation } from '@/game/bannerChat/contract';
import { trimHistory } from '@/game/bannerChat/facts';
import { checkScope, mentionsForeignNames } from '@/game/bannerChat/scope';
import { requestBannerChat } from '@/lib/localAiClient';

export type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | {
      id: number;
      role: 'assistant';
      kind: 'answer';
      category: ChatCategory;
      /** Undefined when the model text was not reliable: only the deterministic cards/limitations are shown. */
      answer?: string;
      bannerIds: string[];
      cardIds: string[];
      limitations: ChatLimitation[];
    }
  /** Fixed, translated out-of-scope message (never model text). */
  | { id: number; role: 'assistant'; kind: 'rejected' };

type NewMessage = ChatMessage extends infer M ? (M extends unknown ? Omit<M, 'id'> : never) : never;

export type BannerChatStatus = 'idle' | 'sending' | 'error';
export type BannerChatError = 'TIMEOUT' | 'UNAVAILABLE' | 'FAILED';
/** What happened to the text: the input is cleared on 'sent' / 'rejected' and kept otherwise. */
export type SendOutcome = 'sent' | 'rejected' | 'error' | 'cancelled' | 'ignored';

export interface BuiltChat {
  request: BannerChatRequest;
  knownNames: string[];
  foreignNames: string[];
}

interface Options {
  /** Builds the DTO from what the player can see right now. */
  build: (message: string, history: ChatHistoryEntry[], seed: number) => BuiltChat;
  /** Overridable for tests. */
  client?: (request: BannerChatRequest, signal: AbortSignal) => Promise<BannerChatResponse>;
}

const defaultClient = (request: BannerChatRequest, signal: AbortSignal) => requestBannerChat(request, { signal });
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
const errorCode = (err: unknown) =>
  err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'NETWORK';

/**
 * In-memory banner chat: scope check before sending, one request at a time, stale answers ignored, aborted on
 * cancel / clear / unmount. Only accepted questions (plus category and ids, never model text) enter the history.
 */
export function useBannerChat({ build, client = defaultClient }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<BannerChatStatus>('idle');
  const [error, setError] = useState<BannerChatError | null>(null);
  const historyRef = useRef<ChatHistoryEntry[]>([]);
  const nextId = useRef(1);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => () => {
    requestRef.current++;
    controllerRef.current?.abort();
  }, []);

  const push = (...items: NewMessage[]) =>
    setMessages((prev) => [...prev, ...items.map((m) => ({ ...m, id: nextId.current++ }) as ChatMessage)]);

  const send = useCallback(
    async (text: string): Promise<SendOutcome> => {
      if (busyRef.current) return 'ignored';
      const message = text.trim();
      const seed = randomSeed();
      const history = historyRef.current;
      const built = build(message, history, seed);
      const scope = checkScope(message, { hasHistory: history.length > 0, knownNames: built.knownNames });
      setError(null);
      if ('reason' in scope) {
        if (scope.reason === 'EMPTY') return 'ignored';
        push({ role: 'user', text: message.slice(0, 300) }, { role: 'assistant', kind: 'rejected' });
        if (import.meta.env.DEV) console.debug('[local-ai] banner chat', { allowed: false, reason: scope.reason });
        return 'rejected';
      }

      busyRef.current = true;
      const id = ++requestRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setPending(message);
      setStatus('sending');
      const started = performance.now();
      const stale = () => id !== requestRef.current;
      const finish = () => {
        busyRef.current = false;
        controllerRef.current = null;
        setPending(null);
      };

      try {
        const { result, meta } = await client(built.request, controller.signal);
        if (stale()) return 'cancelled';
        finish();
        setStatus('idle');
        if (!result.allowed) {
          push({ role: 'user', text: message }, { role: 'assistant', kind: 'rejected' });
        } else {
          // An answer naming a card the player was not told about is not grounded: keep only the deterministic parts
          const answer = result.answer && !mentionsForeignNames(result.answer, built.foreignNames) ? result.answer : undefined;
          push(
            { role: 'user', text: message },
            {
              role: 'assistant',
              kind: 'answer',
              category: result.category,
              answer,
              bannerIds: result.recommendedBannerIds,
              cardIds: result.mentionedCardIds,
              limitations: result.limitations,
            },
          );
          historyRef.current = trimHistory([
            ...history,
            { role: 'user', text: message },
            {
              role: 'assistant',
              category: result.category as Extract<ChatHistoryEntry, { role: 'assistant' }>['category'],
              bannerIds: result.recommendedBannerIds,
              cardIds: result.mentionedCardIds,
            },
          ]);
        }
        if (import.meta.env.DEV) {
          console.debug('[local-ai] banner chat', {
            category: result.category,
            allowed: result.allowed,
            model: meta.model,
            seed: meta.seed,
            banners: built.request.banners.length,
            cards: built.request.cards.length,
            durationMs: Math.round(performance.now() - started),
          });
        }
        return result.allowed ? 'sent' : 'rejected';
      } catch (err) {
        if (stale()) return 'cancelled';
        finish();
        const code = errorCode(err);
        if (code === 'CANCELLED') {
          setStatus('idle');
          return 'cancelled';
        }
        setStatus('error');
        setError(code === 'TIMEOUT' ? 'TIMEOUT' : code === 'OLLAMA_UNAVAILABLE' || code === 'MODEL_NOT_INSTALLED' || code === 'NETWORK' ? 'UNAVAILABLE' : 'FAILED');
        if (import.meta.env.DEV) console.debug('[local-ai] banner chat', { error: code, durationMs: Math.round(performance.now() - started) });
        return 'error';
      }
    },
    [build, client],
  );

  const cancel = useCallback(() => {
    if (!busyRef.current) return;
    requestRef.current++;
    controllerRef.current?.abort();
    busyRef.current = false;
    controllerRef.current = null;
    setPending(null);
    setStatus('idle');
  }, []);

  const clear = useCallback(() => {
    cancel();
    historyRef.current = [];
    setMessages([]);
    setError(null);
    setStatus('idle');
  }, [cancel]);

  return { messages, pending, status, error, sending: status === 'sending', send, cancel, clear, historySize: () => historyRef.current.length };
}
