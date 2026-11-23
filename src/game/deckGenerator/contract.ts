/**
 * Contract between the deck builder and the local AI service (local-ai/).
 * Only depends on zod so the Node service can import it without path aliases or assets.
 */
import { z } from 'zod';

export const STRATEGIES = ['balanced', 'aggressive', 'defensive'] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const LIMITS = {
  maxCards: 200,
  maxSkillsPerCard: 4,
  maxIdLength: 64,
  maxExplanationLength: 280,
  maxBodyBytes: 64 * 1024,
} as const;

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const cardId = z.string().min(1).max(LIMITS.maxIdLength).regex(/^[A-Za-z0-9_-]+$/);

export const SkillDtoSchema = z.object({
  action: z.enum(['APLICAR_ESTADO', 'DEVOLVER_MANO', 'DANIO_DIRECTO', 'CURAR_CORDURA']),
  target: z.enum(['bug', 'carta_enemiga', 'carta_aliada']),
  power: int(0, 20),
  cost: int(0, 10),
  duration: int(0, 10),
}).strict();

export const CardDtoSchema = z.object({
  id: cardId,
  type: z.enum(['programador', 'qa', 'consumible']),
  owned: int(1, 99),
  cost: int(0, 10),
  power: int(0, 20).optional(),
  attackCost: int(0, 10).optional(),
  sanityMax: int(1, 50).optional(),
  skills: z.array(SkillDtoSchema).max(LIMITS.maxSkillsPerCard),
}).strict();

export const DeckGenerateRequestSchema = z.object({
  strategy: z.enum(STRATEGIES),
  deckSize: int(1, 60),
  maxCopies: int(1, 4),
  seed: int(0, 2 ** 31 - 1),
  /** Language for the optional explanation only. */
  language: z.enum(['es', 'en', 'fr']).optional(),
  cards: z.array(CardDtoSchema).min(1).max(LIMITS.maxCards)
    .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, 'duplicate card ids'),
}).strict();

export type SkillDto = z.infer<typeof SkillDtoSchema>;
export type CardDto = z.infer<typeof CardDtoSchema>;
export type DeckGenerateRequest = z.infer<typeof DeckGenerateRequestSchema>;

/**
 * Shape-only check of the model proposal. Quantities stay loose (any finite number) on purpose:
 * rule violations are fixed by the deterministic repair step, not rejected here.
 */
export const ModelDeckProposalSchema = z.object({
  strategy: z.enum(STRATEGIES).optional(),
  cards: z.array(z.object({
    id: z.string().min(1).max(LIMITS.maxIdLength),
    quantity: z.number().finite(),
  })).max(LIMITS.maxCards),
  explanation: z.string().max(LIMITS.maxExplanationLength).optional(),
});
export type ModelDeckProposal = z.infer<typeof ModelDeckProposalSchema>;

export const AI_ERROR_CODES = [
  'INVALID_INPUT',
  'PAYLOAD_TOO_LARGE',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  'OLLAMA_UNAVAILABLE',
  'MODEL_NOT_INSTALLED',
  'TIMEOUT',
  'EMPTY_RESPONSE',
  'INVALID_MODEL_OUTPUT',
  'MODEL_ERROR',
  'INTERNAL',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const DeckGenerateResponseSchema = z.object({
  result: ModelDeckProposalSchema,
  meta: z.object({
    model: z.string().max(200),
    seed: z.number().int(),
    temperature: z.number(),
    durationMs: z.number().nonnegative(),
  }),
});
export type DeckGenerateResponse = z.infer<typeof DeckGenerateResponseSchema>;

export const AiErrorResponseSchema = z.object({
  error: z.object({ code: z.enum(AI_ERROR_CODES), message: z.string().max(500).optional() }),
});

/* ── Local AI preparation (GET /health) ── */

export const AI_SETUP_STATUSES = [
  'service_starting',
  'runtime_missing',
  'runtime_downloading',
  'runtime_ready',
  'model_missing',
  'model_downloading',
  'model_loading',
  'ready',
  'error',
] as const;
export type AiSetupStatus = (typeof AI_SETUP_STATUSES)[number];

/** Normalised preparation errors: safe to show, never contain paths or stack traces. */
export const AI_SETUP_ERRORS = [
  'UNSUPPORTED_PLATFORM',
  'RUNTIME_DOWNLOAD_FAILED',
  'CHECKSUM_MISMATCH',
  'EXTRACT_FAILED',
  'PORT_IN_USE',
  'OLLAMA_START_FAILED',
  'OLLAMA_UNAVAILABLE',
  'MODEL_DOWNLOAD_FAILED',
  'MODEL_LOAD_FAILED',
] as const;
export type AiSetupError = (typeof AI_SETUP_ERRORS)[number];

const DownloadSchema = z.object({
  downloading: z.boolean(),
  downloadedBytes: z.number().nonnegative().nullable(),
  totalBytes: z.number().positive().nullable(),
  /** 0..100, only when the total size is really known. */
  progress: z.number().min(0).max(100).nullable(),
});
export type DownloadProgress = z.infer<typeof DownloadSchema>;

export const LocalAiHealthSchema = z.object({
  service: z.literal('ready'),
  status: z.enum(AI_SETUP_STATUSES),
  runtime: DownloadSchema.extend({
    source: z.enum(['portable', 'system', 'external', 'unavailable']),
    ready: z.boolean(),
    expectedVersion: z.string().max(40),
    detectedVersion: z.string().max(40).nullable(),
  }),
  ollama: z.object({ reachable: z.boolean() }),
  model: DownloadSchema.extend({
    name: z.string().max(200),
    installed: z.boolean(),
    loaded: z.boolean(),
  }),
  canGenerate: z.boolean(),
  canUseFallback: z.boolean(),
  lastError: z.enum(AI_SETUP_ERRORS).nullable(),
  /** Where runtime and model live, relative to the game folder. */
  dataDir: z.string().max(40),
});
export type LocalAiHealth = z.infer<typeof LocalAiHealthSchema>;
