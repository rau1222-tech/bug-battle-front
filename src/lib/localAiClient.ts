/**
 * Browser client for the local AI service (local-ai/). Reusable for future AI operations:
 * each operation is a POST path plus a zod schema for its response.
 */
import type { z } from 'zod';
import {
  AiErrorResponseSchema,
  DeckGenerateResponseSchema,
  LocalAiHealthSchema,
  type AiErrorCode,
  type DeckGenerateRequest,
  type DeckGenerateResponse,
  type LocalAiHealth,
} from '@/game/deckGenerator/contract';
import { BannerChatResponseSchema, type BannerChatRequest, type BannerChatResponse } from '@/game/bannerChat/contract';

export const LOCAL_AI_URL = (import.meta.env.VITE_LOCAL_AI_SERVICE_URL as string | undefined) || 'http://127.0.0.1:8787';
export const LOCAL_AI_TIMEOUT_MS = Number(import.meta.env.VITE_LOCAL_AI_TIMEOUT_MS) || 35000;

export type LocalAiErrorCode = AiErrorCode | 'NETWORK' | 'CANCELLED';

export class LocalAiError extends Error {
  constructor(public readonly code: LocalAiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'LocalAiError';
  }
}

interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

export async function callLocalAi<T>(path: string, body: unknown, schema: z.ZodType<T>, options: CallOptions = {}): Promise<T> {
  const { signal, timeoutMs = LOCAL_AI_TIMEOUT_MS, baseUrl = LOCAL_AI_URL } = options;
  if (signal?.aborted) throw new LocalAiError('CANCELLED');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await fetch(
        `${baseUrl}${path}`,
        body === undefined
          ? { method: 'GET', signal: controller.signal }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
      );
    } catch {
      if (signal?.aborted) throw new LocalAiError('CANCELLED');
      if (timedOut) throw new LocalAiError('TIMEOUT');
      throw new LocalAiError('NETWORK');
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      if (signal?.aborted) throw new LocalAiError('CANCELLED');
      if (timedOut) throw new LocalAiError('TIMEOUT');
      throw new LocalAiError(res.ok ? 'INVALID_MODEL_OUTPUT' : 'INTERNAL');
    }

    if (!res.ok) {
      const parsed = AiErrorResponseSchema.safeParse(json);
      throw new LocalAiError(parsed.success ? parsed.data.error.code : 'INTERNAL');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new LocalAiError('INVALID_MODEL_OUTPUT');
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function requestDeckGeneration(request: DeckGenerateRequest, options?: CallOptions): Promise<DeckGenerateResponse> {
  return callLocalAi('/api/decks/generate', request, DeckGenerateResponseSchema, options);
}

export function requestBannerChat(request: BannerChatRequest, options?: CallOptions): Promise<BannerChatResponse> {
  return callLocalAi('/api/banners/chat', request, BannerChatResponseSchema, options);
}

const STATUS_TIMEOUT_MS = 5000;

export function getLocalAiHealth(options: CallOptions = {}): Promise<LocalAiHealth> {
  return callLocalAi('/health', undefined, LocalAiHealthSchema, { timeoutMs: STATUS_TIMEOUT_MS, ...options });
}

/** Asks the service to prepare the local AI (may download the runtime and the model). */
export function startLocalAiSetup(options: CallOptions = {}): Promise<LocalAiHealth> {
  return callLocalAi('/api/setup', {}, LocalAiHealthSchema, { timeoutMs: STATUS_TIMEOUT_MS, ...options });
}

export function cancelLocalAiSetup(options: CallOptions = {}): Promise<LocalAiHealth> {
  return callLocalAi('/api/setup/cancel', {}, LocalAiHealthSchema, { timeoutMs: STATUS_TIMEOUT_MS, ...options });
}
