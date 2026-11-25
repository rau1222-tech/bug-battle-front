/**
 * Contract between the gacha banner chat and the local AI service (local-ai/).
 * Only depends on zod so the Node service can import it without path aliases.
 */
import { z } from 'zod';

export const CHAT_STRATEGIES = ['balanced', 'aggressive', 'defensive'] as const;
export type ChatStrategy = (typeof CHAT_STRATEGIES)[number];

export const CHAT_LIMITS = {
  maxMessage: 300,
  maxHistory: 6,
  maxHistoryChars: 2000,
  maxBanners: 20,
  maxCards: 200,
  maxBannerCards: 200,
  maxTitle: 80,
  maxName: 40,
  maxIdLength: 64,
  maxAnswer: 500,
  maxRecommendedBanners: 2,
  maxMentionedCards: 6,
  maxMissing: 5,
  maxFocusCards: 3,
} as const;

export const ALLOWED_CATEGORIES = [
  'banner_recommendation',
  'banner_comparison',
  'card_location',
  'collection_gap',
  'deck_strategy',
  'banner_probability',
  'banner_cost',
  'banner_rules',
  'other_allowed',
] as const;
export const REJECTED_CATEGORIES = ['off_topic', 'code_request', 'prompt_injection', 'unsupported'] as const;
export const CHAT_CATEGORIES = [...ALLOWED_CATEGORIES, ...REJECTED_CATEGORIES] as const;
export type ChatCategory = (typeof CHAT_CATEGORIES)[number];

/** `allowed` is always decided by code from the closed category, never by a model boolean. */
export const isAllowedCategory = (c: ChatCategory) => (ALLOWED_CATEGORIES as readonly string[]).includes(c);

/** Translated by the frontend; the model never writes these texts. */
export const CHAT_LIMITATIONS = [
  'NO_PROBABILITY_DATA',
  'NO_GUARANTEE_INFO',
  'NO_FUTURE_BANNERS',
  'NOT_ENOUGH_GOLD',
  'CARD_NOT_AVAILABLE',
  'RANDOM_RESULTS',
] as const;
export type ChatLimitation = (typeof CHAT_LIMITATIONS)[number];

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const id = z.string().min(1).max(CHAT_LIMITS.maxIdLength).regex(/^[A-Za-z0-9_-]+$/);
// Display text from the database: data only, single line, no control characters
// eslint-disable-next-line no-control-regex -- control characters are matched on purpose, to reject them
const safeText = (max: number) => z.string().min(1).max(max).regex(/^[^\u0000-\u001f\u007f<>`]*$/);
const strategyRecord = <T extends z.ZodTypeAny>(schema: T) => z.object({ balanced: schema, aggressive: schema, defensive: schema }).strict();

const HistoryEntrySchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string().min(1).max(CHAT_LIMITS.maxMessage) }).strict(),
  z.object({
    role: z.literal('assistant'),
    category: z.enum(ALLOWED_CATEGORIES),
    bannerIds: z.array(id).max(CHAT_LIMITS.maxRecommendedBanners),
    cardIds: z.array(id).max(CHAT_LIMITS.maxMentionedCards),
  }).strict(),
]);
export type ChatHistoryEntry = z.infer<typeof HistoryEntrySchema>;

const SkillSchema = z.object({
  action: z.enum(['APLICAR_ESTADO', 'DEVOLVER_MANO', 'DANIO_DIRECTO', 'CURAR_CORDURA']),
  power: int(0, 20),
  cost: int(0, 10),
  duration: int(0, 10),
}).strict();

export const ChatCardSchema = z.object({
  id,
  name: safeText(CHAT_LIMITS.maxName),
  type: z.enum(['programador', 'qa', 'consumible']),
  rarity: z.enum(['comun', 'raro', 'epico', 'legendario']),
  cost: int(0, 10),
  power: int(0, 20).optional(),
  attackCost: int(0, 10).optional(),
  sanityMax: int(1, 50).optional(),
  skills: z.array(SkillSchema).max(4),
  roles: z.array(z.string().max(20)).max(8),
  owned: int(0, 99),
  maxed: z.boolean(),
  inBanners: z.array(id).max(CHAT_LIMITS.maxBanners),
}).strict();
export type ChatCard = z.infer<typeof ChatCardSchema>;

export const ChatBannerSchema = z.object({
  id,
  title: safeText(CHAT_LIMITS.maxTitle),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost: int(1, 1_000_000),
  cardsPerPack: int(1, 10),
  packsAffordable: int(0, 1_000_000),
  cards: z.array(z.object({
    id,
    /** Per-draw probability in %, one decimal, from appearanceProbabilities(). */
    pPerDrawPct: z.number().min(0).max(100),
    owned: int(0, 99),
    maxed: z.boolean(),
  }).strict()).max(CHAT_LIMITS.maxBannerCards),
  /** 1 = best for that strategy among the sent banners (deterministic heuristic). */
  rank: strategyRecord(int(1, CHAT_LIMITS.maxBanners)),
  newCards: int(0, CHAT_LIMITS.maxBannerCards),
  maxedCards: int(0, CHAT_LIMITS.maxBannerCards),
}).strict();
export type ChatBanner = z.infer<typeof ChatBannerSchema>;

export const BannerChatRequestSchema = z.object({
  message: z.string().min(1).max(CHAT_LIMITS.maxMessage),
  language: z.enum(['es', 'en', 'fr']),
  seed: int(0, 2 ** 31 - 1),
  history: z.array(HistoryEntrySchema).max(CHAT_LIMITS.maxHistory),
  player: z.object({ gold: int(0, 100_000_000), ownedDistinct: int(0, 10_000), ownedTotal: int(0, 100_000) }).strict(),
  banners: z.array(ChatBannerSchema).max(CHAT_LIMITS.maxBanners),
  cards: z.array(ChatCardSchema).max(CHAT_LIMITS.maxCards),
  missing: strategyRecord(z.array(id).max(CHAT_LIMITS.maxMissing)),
  focusCardIds: z.array(id).max(CHAT_LIMITS.maxFocusCards),
}).strict();
export type BannerChatRequest = z.infer<typeof BannerChatRequestSchema>;

export const BannerChatResultSchema = z.object({
  category: z.enum(CHAT_CATEGORIES),
  allowed: z.boolean(),
  answer: z.string().max(CHAT_LIMITS.maxAnswer).optional(),
  recommendedBannerIds: z.array(id).max(CHAT_LIMITS.maxRecommendedBanners),
  mentionedCardIds: z.array(id).max(CHAT_LIMITS.maxMentionedCards),
  confidence: z.enum(['high', 'medium', 'low']),
  limitations: z.array(z.enum(CHAT_LIMITATIONS)).max(CHAT_LIMITATIONS.length),
});
export type BannerChatResult = z.infer<typeof BannerChatResultSchema>;

export const BannerChatResponseSchema = z.object({
  result: BannerChatResultSchema,
  meta: z.object({ model: z.string().max(200), seed: z.number().int(), durationMs: z.number().nonnegative() }),
});
export type BannerChatResponse = z.infer<typeof BannerChatResponseSchema>;
