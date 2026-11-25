/**
 * Deterministic deck rules: builds the generator DTO from the real collection, scores cards per strategy,
 * validates any proposal against the hard rules, repairs simple model mistakes and builds the fallback deck.
 * Hard rules never depend on the model.
 */
import type { CardTemplate } from '@/constants';
import { SKILL_RULES, isPlayableCard, mulberry32, type CardRule } from '@/game/onlineEngine';
import { LIMITS, type CardDto, type DeckGenerateRequest, type ModelDeckProposal, type Strategy } from './contract';
import { STRATEGY_PROFILES, type CardKind, type StrategyProfile } from './strategies';

export interface DeckEntry {
  id: string;
  quantity: number;
}

export type ValidationIssueCode =
  | 'NOT_AN_INTEGER'
  | 'NON_POSITIVE'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_CARD'
  | 'NOT_PLAYABLE'
  | 'NOT_OWNED'
  | 'EXCEEDS_MAX_COPIES'
  | 'EXCEEDS_OWNED'
  | 'WRONG_TOTAL';

export interface ValidationIssue {
  code: ValidationIssueCode;
  id?: string;
}

/** Ids of the whole catalog, used to tell unknown cards from known-but-unusable ones. */
export interface CatalogInfo {
  known: ReadonlySet<string>;
  playable: ReadonlySet<string>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/* ── DTO ─────────────────────────────────────────────────────────────── */

export function catalogInfo(cards: CardTemplate[]): CatalogInfo {
  return {
    known: new Set(cards.map((c) => c.id)),
    playable: new Set(cards.filter((c) => isPlayableCard(c as CardRule)).map((c) => c.id)),
  };
}

/**
 * Minimal DTO for the generator: only owned, playable cards with the stats needed to score them.
 * Names, descriptions, images, audio and user data are never included.
 */
export function buildDeckRequest(
  cards: CardTemplate[],
  collection: Record<string, number>,
  options: { strategy: Strategy; seed: number; deckSize: number; maxCopies: number; language?: 'es' | 'en' | 'fr' },
): DeckGenerateRequest {
  const pool: CardDto[] = [];
  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id));
  for (const c of sorted) {
    const owned = Math.min(99, Math.floor(collection[c.id] ?? 0));
    if (owned < 1 || !isPlayableCard(c as CardRule)) continue;
    if (c.id.length > LIMITS.maxIdLength || !ID_PATTERN.test(c.id) || c.habilidades.length > LIMITS.maxSkillsPerCard) continue;
    pool.push({
      id: c.id,
      type: c.tipo,
      owned,
      cost: c.coste,
      ...(c.tipo !== 'consumible' ? { power: c.potencia, attackCost: c.ataqueCoste, sanityMax: c.corduraMax } : {}),
      skills: c.habilidades.map(([skillId, power, cost, duration]) => ({
        action: SKILL_RULES[skillId].accionTipo,
        target: SKILL_RULES[skillId].objetivo,
        power,
        cost,
        duration,
      })),
    });
    if (pool.length >= LIMITS.maxCards) break;
  }
  return { strategy: options.strategy, deckSize: options.deckSize, maxCopies: options.maxCopies, seed: options.seed, language: options.language, cards: pool };
}

/** Copies the request pool can contribute under the copy limit. */
export function poolCapacity(request: DeckGenerateRequest): number {
  return request.cards.reduce((acc, c) => acc + Math.min(c.owned, request.maxCopies), 0);
}

/* ── Scoring ─────────────────────────────────────────────────────────── */

interface CardFeatures {
  attack: number;
  burst: number;
  buff: number;
  control: number;
  heal: number;
  sanity: number;
  cheap: number;
  cost: number;
  type: CardKind;
  bucket: 0 | 1 | 2;
  damageSource: boolean;
  needsAllyTarget: boolean;
}

function rawFeatures(c: CardDto): CardFeatures {
  const sum = (action: string, fn: (s: CardDto['skills'][number]) => number) =>
    c.skills.filter((s) => s.action === action).reduce((acc, s) => acc + fn(s), 0);
  const basic = (c.power ?? 0) / Math.max(1, c.attackCost ?? 1);
  const burst = sum('DANIO_DIRECTO', (s) => s.power / (s.cost + 1));
  return {
    attack: c.type === 'programador' ? basic : 0,
    burst,
    buff: c.skills
      .filter((s) => s.action === 'APLICAR_ESTADO' && s.target === 'carta_aliada')
      .reduce((acc, s) => acc + (s.power * Math.max(1, s.duration)) / (s.cost + 1), 0),
    control: sum('DEVOLVER_MANO', (s) => 1 / (s.cost + 1)) + (c.type === 'qa' ? basic * 0.5 : 0),
    heal: sum('CURAR_CORDURA', (s) => s.power / (s.cost + 1)),
    sanity: c.sanityMax ?? 0,
    cheap: c.cost <= 1 ? 1 : c.cost === 2 ? 0.5 : 0,
    cost: c.cost,
    type: c.type,
    bucket: c.cost <= 1 ? 0 : c.cost === 2 ? 1 : 2,
    damageSource: (c.type === 'programador' && (c.power ?? 0) > 0) || burst > 0,
    needsAllyTarget: c.type === 'consumible' && c.skills.length > 0 && c.skills.every((s) => s.target === 'carta_aliada'),
  };
}

const NUMERIC: (keyof StrategyProfile['weights'])[] = ['attack', 'burst', 'buff', 'control', 'heal', 'sanity', 'cheap', 'cost'];

interface ScoringContext {
  request: DeckGenerateRequest;
  profile: StrategyProfile;
  byId: Map<string, CardDto>;
  features: Map<string, CardFeatures>;
  score: Map<string, number>;
  cap: Map<string, number>;
  /** Stable candidate order for deterministic tie-breaking. */
  order: string[];
}

function scoringContext(request: DeckGenerateRequest, seed: number): ScoringContext {
  const profile = STRATEGY_PROFILES[request.strategy];
  const order = request.cards.map((c) => c.id).sort();
  const byId = new Map(request.cards.map((c) => [c.id, c]));
  const raw = new Map(request.cards.map((c) => [c.id, rawFeatures(c)]));
  const max = Object.fromEntries(NUMERIC.map((k) => [k, Math.max(0, ...[...raw.values()].map((f) => f[k] as number))]));
  const features = new Map<string, CardFeatures>();
  for (const [id, f] of raw) {
    const norm = { ...f };
    for (const k of NUMERIC) (norm[k] as number) = max[k] > 0 ? (f[k] as number) / max[k] : 0;
    features.set(id, norm);
  }
  const random = mulberry32(seed);
  const score = new Map<string, number>();
  for (const id of order) {
    const f = features.get(id)!;
    const w = profile.weights;
    const base = w.attack * f.attack + w.burst * f.burst + w.buff * f.buff + w.control * f.control +
      w.heal * f.heal + w.sanity * f.sanity + w.cheap * f.cheap - w.cost * f.cost;
    score.set(id, base + profile.jitter * (2 * random() - 1));
  }
  const cap = new Map(request.cards.map((c) => [c.id, Math.min(c.owned, request.maxCopies)]));
  return { request, profile, byId, features, score, cap, order };
}

/**
 * Per-card usefulness for each strategy (same weights and normalisation as the deck generator, without seed noise).
 * Higher is better; a heuristic, not a guarantee.
 */
export function cardStrategyScores(cards: CardDto[]): Record<string, Record<Strategy, number>> {
  const out: Record<string, Record<Strategy, number>> = {};
  if (cards.length === 0) return out;
  const strategies = Object.keys(STRATEGY_PROFILES) as Strategy[];
  const base: Omit<DeckGenerateRequest, 'strategy'> = { deckSize: 1, maxCopies: 1, seed: 0, cards };
  for (const strategy of strategies) {
    const ctx = scoringContext({ ...base, strategy }, 0);
    const jitterFree = (id: string) => {
      const f = ctx.features.get(id)!;
      const w = ctx.profile.weights;
      return w.attack * f.attack + w.burst * f.burst + w.buff * f.buff + w.control * f.control +
        w.heal * f.heal + w.sanity * f.sanity + w.cheap * f.cheap - w.cost * f.cost;
    };
    for (const c of cards) (out[c.id] ??= {} as Record<Strategy, number>)[strategy] = jitterFree(c.id);
  }
  return out;
}

/** Probability that an opening hand of `hand` cards has no card costing ≤2 (hypergeometric). */
function deadHandProbability(total: number, early: number, hand = 4): number {
  if (total < hand) return 0;
  let p = 1;
  for (let i = 0; i < hand; i++) p *= Math.max(0, total - early - i) / (total - i);
  return p;
}

/** Strategy fitness of a (partial) deck: card scores minus deck-shape penalties, all in "copies" units. */
function deckScore(counts: Map<string, number>, ctx: ScoringContext): number {
  const { profile } = ctx;
  const size = ctx.request.deckSize;
  let total = 0;
  let sum = 0;
  let damage = 0;
  let allyOnly = 0;
  let early = 0;
  const types: Record<CardKind, number> = { programador: 0, qa: 0, consumible: 0 };
  const curve = [0, 0, 0];
  for (const [id, q] of counts) {
    if (q <= 0) continue;
    const f = ctx.features.get(id)!;
    total += q;
    sum += q * ctx.score.get(id)!;
    types[f.type] += q;
    curve[f.bucket] += q;
    if (f.bucket < 2) early += q;
    if (f.damageSource) damage += q;
    if (f.needsAllyTarget) allyOnly += q;
  }
  let typePenalty = 0;
  for (const t of Object.keys(types) as CardKind[]) {
    const [min, max] = profile.typeShare[t];
    typePenalty += Math.max(0, min * size - types[t]) + Math.max(0, types[t] - max * size);
  }
  const curvePenalty = total > 0 ? curve.reduce((acc, n, i) => acc + Math.abs(n - profile.curve[i] * total), 0) : 0;
  const damagePenalty = Math.max(0, profile.minDamageShare * size - damage);
  const bodies = types.programador + types.qa;
  const noTargetPenalty = Math.max(0, allyOnly - 0.3 * bodies);
  return sum
    - 0.5 * profile.penalty.typeShare * typePenalty
    - 0.25 * profile.penalty.curve * curvePenalty
    - 0.5 * profile.penalty.damage * damagePenalty
    - 0.5 * profile.penalty.noTargets * noTargetPenalty
    - 5 * profile.penalty.deadHand * deadHandProbability(total, early);
}

function sumCounts(counts: Map<string, number>) {
  let n = 0;
  for (const q of counts.values()) n += q;
  return n;
}

function withDelta(counts: Map<string, number>, id: string, delta: number, ctx: ScoringContext) {
  counts.set(id, (counts.get(id) ?? 0) + delta);
  const s = deckScore(counts, ctx);
  counts.set(id, counts.get(id)! - delta);
  return s;
}

/** Adds the best copy (by marginal deck score) until the deck is full. Returns false if the pool runs out. */
function fill(counts: Map<string, number>, ctx: ScoringContext): boolean {
  while (sumCounts(counts) < ctx.request.deckSize) {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of ctx.order) {
      if ((counts.get(id) ?? 0) >= ctx.cap.get(id)!) continue;
      const s = withDelta(counts, id, 1, ctx);
      if (s > bestScore + 1e-9) {
        best = id;
        bestScore = s;
      }
    }
    if (!best) return false;
    counts.set(best, (counts.get(best) ?? 0) + 1);
  }
  return true;
}

/** Removes the least suitable copy until the deck has the target size. */
function trim(counts: Map<string, number>, ctx: ScoringContext) {
  while (sumCounts(counts) > ctx.request.deckSize) {
    let worst: string | null = null;
    let bestScore = -Infinity;
    for (const id of ctx.order) {
      if ((counts.get(id) ?? 0) <= 0) continue;
      const s = withDelta(counts, id, -1, ctx);
      if (s > bestScore + 1e-9) {
        worst = id;
        bestScore = s;
      }
    }
    if (!worst) return;
    counts.set(worst, counts.get(worst)! - 1);
  }
}

/** 1-for-1 swaps while they improve the deck; bounded so large pools stay fast. */
function improve(counts: Map<string, number>, ctx: ScoringContext, maxIterations = 40) {
  if (ctx.order.length > 60) return;
  for (let it = 0; it < maxIterations; it++) {
    const current = deckScore(counts, ctx);
    let bestGain = 1e-6;
    let move: [string, string] | null = null;
    for (const out of ctx.order) {
      if ((counts.get(out) ?? 0) <= 0) continue;
      counts.set(out, counts.get(out)! - 1);
      for (const inc of ctx.order) {
        if (inc === out || (counts.get(inc) ?? 0) >= ctx.cap.get(inc)!) continue;
        const gain = withDelta(counts, inc, 1, ctx) - current;
        if (gain > bestGain) {
          bestGain = gain;
          move = [out, inc];
        }
      }
      counts.set(out, counts.get(out)! + 1);
    }
    if (!move) return;
    counts.set(move[0], counts.get(move[0])! - 1);
    counts.set(move[1], (counts.get(move[1]) ?? 0) + 1);
  }
}

function toEntries(counts: Map<string, number>, order: string[]): DeckEntry[] {
  return order.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({ id, quantity: counts.get(id)! }));
}

/* ── Validation ──────────────────────────────────────────────────────── */

/** Checks every hard rule; an empty list means the deck can be shown in the builder. */
export function validateDeck(entries: DeckEntry[], request: DeckGenerateRequest, catalog?: CatalogInfo): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pool = new Map(request.cards.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let total = 0;
  for (const { id, quantity } of entries) {
    if (seen.has(id)) issues.push({ code: 'DUPLICATE_ID', id });
    seen.add(id);
    if (!Number.isInteger(quantity)) issues.push({ code: 'NOT_AN_INTEGER', id });
    else if (quantity <= 0) issues.push({ code: 'NON_POSITIVE', id });
    total += Number.isFinite(quantity) ? quantity : 0;
    const card = pool.get(id);
    if (!card) {
      if (catalog && !catalog.known.has(id)) issues.push({ code: 'UNKNOWN_CARD', id });
      else if (catalog && !catalog.playable.has(id)) issues.push({ code: 'NOT_PLAYABLE', id });
      else if (catalog) issues.push({ code: 'NOT_OWNED', id });
      else issues.push({ code: 'UNKNOWN_CARD', id });
      continue;
    }
    if (quantity > request.maxCopies) issues.push({ code: 'EXCEEDS_MAX_COPIES', id });
    if (quantity > card.owned) issues.push({ code: 'EXCEEDS_OWNED', id });
  }
  if (total !== request.deckSize) issues.push({ code: 'WRONG_TOTAL' });
  return issues;
}

/* ── Repair & fallback ───────────────────────────────────────────────── */

export type RepairAction =
  | 'MERGED_DUPLICATES'
  | 'DROPPED_INVALID_QUANTITY'
  | 'NORMALIZED_QUANTITY'
  | 'DROPPED_UNKNOWN_OR_UNOWNED'
  | 'CAPPED_COPIES'
  | 'TRIMMED_EXTRA'
  | 'FILLED_MISSING';

export type RepairResult =
  | { ok: true; cards: DeckEntry[]; actions: RepairAction[] }
  | { ok: false; code: 'INSUFFICIENT_COLLECTION' | 'UNREPAIRABLE' };

/**
 * Fixes simple model mistakes using the strategy profile, then re-validates everything.
 * Never adds unowned cards, never exceeds the copy limit or owned copies, never returns a deck of the wrong size.
 */
export function repairProposal(proposal: ModelDeckProposal, request: DeckGenerateRequest, seed: number): RepairResult {
  if (poolCapacity(request) < request.deckSize) return { ok: false, code: 'INSUFFICIENT_COLLECTION' };
  const ctx = scoringContext(request, seed);
  const actions = new Set<RepairAction>();
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const { id, quantity } of proposal.cards) {
    if (seen.has(id)) actions.add('MERGED_DUPLICATES');
    seen.add(id);
    const q = Math.floor(quantity);
    if (!Number.isFinite(q) || q < 1) {
      actions.add('DROPPED_INVALID_QUANTITY');
      continue;
    }
    if (q !== quantity) actions.add('NORMALIZED_QUANTITY');
    if (!ctx.byId.has(id)) {
      actions.add('DROPPED_UNKNOWN_OR_UNOWNED');
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + q);
  }
  for (const [id, q] of counts) {
    const cap = ctx.cap.get(id)!;
    if (q > cap) {
      counts.set(id, cap);
      actions.add('CAPPED_COPIES');
    }
  }
  const total = sumCounts(counts);
  // Mostly rebuilt decks would no longer be the model's proposal: treat them as unrepairable
  if (total < request.deckSize / 2) return { ok: false, code: 'UNREPAIRABLE' };
  if (total > request.deckSize) {
    trim(counts, ctx);
    actions.add('TRIMMED_EXTRA');
  } else if (total < request.deckSize) {
    if (!fill(counts, ctx)) return { ok: false, code: 'UNREPAIRABLE' };
    actions.add('FILLED_MISSING');
  }
  const cards = toEntries(counts, ctx.order);
  if (validateDeck(cards, request).length > 0) return { ok: false, code: 'UNREPAIRABLE' };
  return { ok: true, cards, actions: [...actions] };
}

/** Strategy-aware deterministic deck; `seed` only breaks near-ties. Returns null if the pool can't fill a deck. */
export function generateFallbackDeck(request: DeckGenerateRequest, seed: number): DeckEntry[] | null {
  if (poolCapacity(request) < request.deckSize) return null;
  const ctx = scoringContext(request, seed);
  const counts = new Map<string, number>();
  if (!fill(counts, ctx)) return null;
  improve(counts, ctx);
  const cards = toEntries(counts, ctx.order);
  return validateDeck(cards, request).length === 0 ? cards : null;
}

export function toCounts(entries: DeckEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((e) => [e.id, e.quantity]));
}
