/**
 * Builds the banner chat DTO from data the player can already see in /gacha: only active banners (same rule for every
 * role), the player's collection and gold. Computes the deterministic facts (per-draw odds, affordable packs, strategy
 * ranking, missing cards, mentioned cards) so the model never calculates anything itself.
 */
import { MAX_COPIES, type CardTemplate } from '@/constants';
import { SKILL_RULES } from '@/game/onlineEngine';
import { cardStrategyScores } from '@/game/deckGenerator/deckRules';
import type { CardDto } from '@/game/deckGenerator/contract';
import { makeTranslator, type Language } from '@/i18n';
import { appearanceProbabilities } from '@/lib/bannerOdds';
import { isBannerActive, type Banner } from '@/lib/banners';
import {
  CHAT_LIMITS,
  CHAT_STRATEGIES,
  type BannerChatRequest,
  type ChatBanner,
  type ChatCard,
  type ChatHistoryEntry,
  type ChatStrategy,
} from './contract';
import { normalize } from './scope';

type Rarity = ChatCard['rarity'];

export interface BannerChatSource {
  message: string;
  language: Language;
  seed: number;
  history: ChatHistoryEntry[];
  /** Banners as returned by useBanners(); non-active ones are always dropped. */
  banners: Banner[];
  cards: CardTemplate[];
  collection: Record<string, number>;
  gold: number;
  rarityOf: (card: CardTemplate) => Rarity;
  /** Display name in the player's language. */
  nameOf: (card: CardTemplate) => string;
  now?: Date;
}

export interface BuiltBannerChat {
  request: BannerChatRequest;
  /** Normalised names of every card / banner sent, for the scope check (domain signal). */
  knownNames: string[];
  /** Normalised names of catalog cards NOT sent: an answer naming one of them is not grounded. */
  foreignNames: string[];
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TRANSLATORS = (['es', 'en', 'fr'] as const).map((l) => makeTranslator(l));

/** Single-line display text with no control characters or markup, as the contract requires. */
export function sanitizeText(text: string, max: number, fallback: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are matched on purpose, to strip them
  const clean = text.replace(/[\u0000-\u001f\u007f<>`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return clean || fallback.slice(0, max);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function roles(c: CardTemplate): string[] {
  const actions = c.habilidades.map(([id]) => SKILL_RULES[id]?.accionTipo);
  const out: string[] = [];
  if (c.tipo === 'programador' && (c.potencia ?? 0) > 0) out.push('attacker');
  if (actions.includes('DANIO_DIRECTO')) out.push('burst');
  if (actions.includes('APLICAR_ESTADO')) out.push('buff');
  if (c.tipo === 'qa' || actions.includes('DEVOLVER_MANO')) out.push('control');
  if (actions.includes('CURAR_CORDURA')) out.push('heal');
  if ((c.corduraMax ?? 0) >= 4) out.push('tank');
  if (c.coste <= 1) out.push('cheap');
  if (c.coste >= 3) out.push('expensive');
  return out;
}

const skillsOf = (c: CardTemplate) =>
  c.habilidades
    .filter(([id]) => SKILL_RULES[id])
    .slice(0, 4)
    .map(([id, power, cost, duration]) => ({ action: SKILL_RULES[id].accionTipo, power, cost, duration }));

/** Every name a player may use for a card (ES/EN/FR, the stored one and its readable id), normalised. */
export function cardNames(card: CardTemplate): string[] {
  const names = new Set<string>([normalize(card.nombre), normalize(card.id.replace(/[-_]+/g, ' '))]);
  for (const tr of TRANSLATORS) names.add(normalize(tr.cardName(card)));
  return [...names].filter((n) => n.length >= 3);
}

/** Cards named in the message, longest names first (so "Senior Dev" wins over "Dev"). */
export function findMentionedCards(message: string, cards: CardTemplate[], max: number = CHAT_LIMITS.maxFocusCards): string[] {
  const text = normalize(message);
  const hits: { id: string; len: number; pos: number }[] = [];
  for (const c of cards) {
    let best: { len: number; pos: number } | null = null;
    for (const name of cardNames(c)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).exec(text);
      if (m && (!best || name.length > best.len)) best = { len: name.length, pos: m.index };
    }
    if (best) hits.push({ id: c.id, ...best });
  }
  return hits.sort((a, b) => b.len - a.len || a.pos - b.pos).slice(0, max).map((h) => h.id);
}

export function buildBannerChatRequest(src: BannerChatSource): BuiltBannerChat {
  const now = src.now ?? new Date();
  const byId = new Map(src.cards.filter((c) => ID.test(c.id)).map((c) => [c.id, c]));
  const ownedOf = (id: string) => Math.max(0, Math.min(99, Math.floor(src.collection[id] ?? 0)));

  const active = src.banners.filter((b) => ID.test(b.id) && isBannerActive(b, now)).slice(0, CHAT_LIMITS.maxBanners);

  // Cards sent: banner cards first, then owned cards, then cards named in the question (even if unavailable)
  const ordered: string[] = [];
  const add = (id: string) => {
    if (byId.has(id) && !ordered.includes(id) && ordered.length < CHAT_LIMITS.maxCards) ordered.push(id);
  };
  active.forEach((b) => b.cards.forEach((bc) => add(bc.cardId)));
  [...byId.keys()].filter((id) => ownedOf(id) > 0).sort().forEach(add);
  const focusCardIds = findMentionedCards(src.message, [...byId.values()]);
  focusCardIds.forEach(add);
  const cardIds = new Set(ordered);

  const scoringPool: CardDto[] = ordered.map((id) => {
    const c = byId.get(id)!;
    return {
      id,
      type: c.tipo,
      owned: Math.max(1, ownedOf(id)),
      cost: c.coste,
      ...(c.tipo !== 'consumible' ? { power: c.potencia, attackCost: c.ataqueCoste, sanityMax: c.corduraMax } : {}),
      skills: c.habilidades.filter(([s]) => SKILL_RULES[s]).map(([s, power, cost, duration]) => ({
        action: SKILL_RULES[s].accionTipo,
        target: SKILL_RULES[s].objetivo,
        power,
        cost,
        duration,
      })),
    };
  });
  const scores = cardStrategyScores(scoringPool);
  const minScore = Object.fromEntries(
    CHAT_STRATEGIES.map((s) => [s, Math.min(0, ...Object.values(scores).map((v) => v[s]))]),
  ) as Record<ChatStrategy, number>;
  const usefulness = (id: string, s: ChatStrategy) => (scores[id]?.[s] ?? 0) - minScore[s];

  const banners: ChatBanner[] = active.map((b) => {
    const odds = appearanceProbabilities(b.cards);
    const cards = b.cards
      .filter((bc) => cardIds.has(bc.cardId))
      .map((bc) => ({
        id: bc.cardId,
        pPerDrawPct: round1((odds[bc.cardId] ?? 0) * 100),
        owned: ownedOf(bc.cardId),
        maxed: ownedOf(bc.cardId) >= MAX_COPIES,
      }));
    return {
      id: b.id,
      title: sanitizeText(b.titulo, CHAT_LIMITS.maxTitle, b.id),
      endsAt: new Date(b.fechaFin).toISOString().slice(0, 10),
      cost: b.coste,
      cardsPerPack: b.cartasPorSobre,
      packsAffordable: b.coste > 0 ? Math.floor(Math.max(0, src.gold) / b.coste) : 0,
      cards,
      rank: { balanced: 1, aggressive: 1, defensive: 1 },
      newCards: cards.filter((c) => c.owned === 0).length,
      maxedCards: cards.filter((c) => c.maxed).length,
    };
  });

  // Heuristic ranking: expected usefulness of a draw (odds × usefulness of cards not yet at the copy limit)
  for (const s of CHAT_STRATEGIES) {
    const value = (b: ChatBanner) => b.cards.reduce((acc, c) => acc + (c.maxed ? 0 : (c.pPerDrawPct / 100) * usefulness(c.id, s)), 0);
    [...banners]
      .sort((a, b) => value(b) - value(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
      .forEach((b, i) => {
        b.rank[s] = i + 1;
      });
  }

  const bannersOf = new Map<string, string[]>();
  for (const b of banners) for (const c of b.cards) bannersOf.set(c.id, [...(bannersOf.get(c.id) ?? []), b.id]);

  const cards: ChatCard[] = ordered.map((id) => {
    const c = byId.get(id)!;
    return {
      id,
      name: sanitizeText(src.nameOf(c), CHAT_LIMITS.maxName, id),
      type: c.tipo,
      rarity: src.rarityOf(c),
      cost: c.coste,
      ...(c.tipo !== 'consumible'
        ? { power: c.potencia, attackCost: c.ataqueCoste, sanityMax: c.corduraMax }
        : {}),
      skills: skillsOf(c),
      roles: roles(c),
      owned: ownedOf(id),
      maxed: ownedOf(id) >= MAX_COPIES,
      inBanners: bannersOf.get(id) ?? [],
    };
  });

  const missing = Object.fromEntries(
    CHAT_STRATEGIES.map((s) => [
      s,
      ordered
        .filter((id) => ownedOf(id) === 0 && bannersOf.has(id))
        .sort((a, b) => usefulness(b, s) - usefulness(a, s) || a.localeCompare(b))
        .slice(0, CHAT_LIMITS.maxMissing),
    ]),
  ) as BannerChatRequest['missing'];

  const ownedIds = [...byId.keys()].filter((id) => ownedOf(id) > 0);
  const request: BannerChatRequest = {
    message: src.message.trim().slice(0, CHAT_LIMITS.maxMessage),
    language: src.language,
    seed: src.seed,
    history: src.history.slice(-CHAT_LIMITS.maxHistory),
    player: {
      gold: Math.max(0, Math.floor(src.gold)),
      ownedDistinct: ownedIds.length,
      ownedTotal: ownedIds.reduce((acc, id) => acc + ownedOf(id), 0),
    },
    banners,
    cards,
    missing,
    focusCardIds: focusCardIds.filter((id) => cardIds.has(id)),
  };

  const knownNames = [
    ...ordered.flatMap((id) => cardNames(byId.get(id)!)),
    ...banners.map((b) => normalize(b.title)).filter((n) => n.length >= 3),
  ];
  const known = new Set(knownNames);
  const foreignNames = [...byId.values()].filter((c) => !cardIds.has(c.id)).flatMap(cardNames).filter((n) => !known.has(n));
  return { request, knownNames, foreignNames };
}

/** Keeps the last accepted exchanges within the entry and character limits (oldest dropped first). */
export function trimHistory(history: ChatHistoryEntry[]): ChatHistoryEntry[] {
  let out = history.slice(-CHAT_LIMITS.maxHistory);
  const size = (h: ChatHistoryEntry[]) => h.reduce((acc, e) => acc + (e.role === 'user' ? e.text.length : 40), 0);
  while (out.length > 0 && (size(out) > CHAT_LIMITS.maxHistoryChars || out[0].role !== 'user')) out = out.slice(1);
  return out;
}
