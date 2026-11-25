/**
 * Deterministic scope checks for the banner chat, shared by the browser (before sending) and the local AI service
 * (defence in depth): rejects obvious code/SQL/injection/game-modification requests and messages with no banner,
 * card or collection signal, and sanitises model answers. Context-aware: technical words only block when they are
 * clearly about technology, and domain words like "coste" never block.
 */
import { CHAT_LIMITS, type BannerChatRequest, type ChatCategory, type ChatLimitation, type ChatStrategy } from './contract';

export type ScopeRejection = 'EMPTY' | 'TOO_LONG' | 'CODE' | 'SQL' | 'INJECTION' | 'MODIFY_GAME' | 'TECH' | 'OFF_TOPIC';

export type ScopeResult = { ok: true } | { ok: false; reason: ScopeRejection; category: ChatCategory };

/** Lowercase without accents, for matching in ES/EN/FR. */
export const normalize = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const CODE = [
  /```|`/,
  /=>|\bfunction\s*\w*\s*\(|\b(const|let|var)\s+\w+\s*=|\bimport\s+[\w{*]|\bexport\s+(default|const|function)\b|console\.log|<\/?[a-z][^>]*>/,
  /\b(escrib|genera|hazme|programa|implementa|crea|write|generate|implement|code|ecri|genere|cree|code)\w*\b.{0,40}\b(codigo|code|componente?|component|funcion|function|script|clase|class|programa|program|hook|endpoint|query|consulta)\b/,
];
const SQL = /\bselect\b[\s\S]{0,200}\bfrom\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\b(drop|create|alter)\s+table\b|\bconsulta\s+sql\b|\bsql\s+query\b|\brequete\s+sql\b/;
const INJECTION = [
  /\b(ignora|ignore|ignorez|ignorar|olvida|forget|oublie|desobedece|disregard)\w*\b.{0,40}\b(instruc\w*|regla\w*|rules?|regles|consignes?|prompt|anterior\w*|previous|precedent\w*|above)\b/,
  /(^|[.!?¡¿,:;]\s*)(actua|act|agis|comportate|behave|pretend|finge|fais semblant)\s+(como|as|comme|like|de|que|d)\b/,
  /\b(ahora eres|a partir de ahora|desde ahora|you are now|from now on|tu es maintenant|maintenant tu es|desormais)\b/,
  /\b(revela|muestra|muestrame|ensena|ensename|dime|repite|reveal|show|print|tell me|repeat|output|montre|revele|affiche|repete|donne)\w*\b.{0,30}\b(prompt|instrucciones|instructions|reglas internas|internal rules|consignes?|configuration|configuracion)\b/,
  /\b(system prompt|prompt del sistema|prompt systeme|jailbreak|developer mode|modo desarrollador|dan mode)\b/,
];
const MODIFY_GAME =
  /\b(modific|cambi|edit|alter|hack|truc|manipul|change|modify|tamper|modifi|chang|truqu)\w*\b.{0,40}\b(probabilidad\w*|probabilit\w*|odds|peso\w*|weights?|poids|codigo|code|juego|game|jeu|base de datos|database|bdd|servidor|server|serveur|tabla|table|rls)\b/;
/** Technology names never needed to talk about banners. */
const TECH_HARD =
  /\b(react|typescript|javascript|python|java|php|sql|supabase|postgres\w*|ollama|qwen|llm|html|css|json|npm|node\.?js|git|github|docker|vite|api|endpoint|prompt)\b/;
/** Generic programming words: only block without a domain signal. */
const TECH_SOFT = /\b(codigo|code|programa\w*|programming|programmation|software|compil\w*|debug\w*|depura\w*|script|servidor|server|serveur|base de datos|database)\b/;

const DOMAIN = new RegExp(
  '\\b(' +
    [
      'banner', 'bannier', 'sobre', 'pack', 'paquete', 'carta', 'card', 'carte', 'coleccion', 'collection', 'mazo', 'deck',
      'oro', 'gold', 'moneda', 'coin', 'piece', 'cost', 'cuest', 'coute', 'prix', 'precio', 'price', 'probab', 'chance',
      'posibilidad', 'odds', 'rareza', 'rarity', 'rarete', 'legendari', 'epic', 'rar', 'comun', 'conseg', 'consig', 'obten',
      'obtien', 'obtenir', 'get', 'falta', 'missing', 'manqu', 'gast', 'spend', 'depens', 'compr', 'buy', 'achet', 'estrateg',
      'strateg', 'agresiv', 'aggressive', 'agressi', 'defensiv', 'defensi', 'equilibr', 'balanced', 'complement', 'sinergi',
      'synerg', 'tirada', 'pull', 'tirage', 'gacha', 'reclut', 'recruit', 'recrut', 'copia', 'cop', 'duplicad', 'duplicate',
      'doublon', 'conviene', 'convien', 'interesa', 'interess', 'merece', 'worth', 'vaut', 'recomien', 'recommend', 'recommand',
      'compar', 'programador', 'qa', 'consumible', 'consumable', 'sobres',
    ].join('|') +
    ')',
);

/** Words that only make sense as a follow-up in an ongoing banner conversation. */
const FOLLOW_UP = /\b(y si|y uno|y una|and if|and what|what about|et si|et pour|otro|otra|another|autre|mas|more|plus|menos|less|moins|ese|esa|este|esta|that one|this one|celui|celle|por que|why|pourquoi|cual|which|quel)\b/;

/** Writing requests unrelated to banners, blocked even inside a conversation. */
const CREATIVE = /\b(poema|poem|poeme|cuento|story|histoire|chiste|joke|blague|cancion|song|chanson|correo|email|e-mail|mail|redaccion|essay|ensayo|carta de amor|love letter)\b/;

const CATEGORY_OF: Record<Exclude<ScopeRejection, 'EMPTY' | 'TOO_LONG'>, ChatCategory> = {
  CODE: 'code_request',
  SQL: 'code_request',
  TECH: 'code_request',
  INJECTION: 'prompt_injection',
  MODIFY_GAME: 'unsupported',
  OFF_TOPIC: 'off_topic',
};

const reject = (reason: ScopeRejection): ScopeResult => ({
  ok: false,
  reason,
  category: reason === 'EMPTY' || reason === 'TOO_LONG' ? 'unsupported' : CATEGORY_OF[reason],
});

/**
 * @param knownNames normalised card names and banner titles the player can see; mentioning one is a domain signal.
 * @param hasHistory there is at least one accepted exchange, so short follow-ups may go to the model.
 */
export function checkScope(message: string, options: { hasHistory?: boolean; knownNames?: string[] } = {}): ScopeResult {
  const raw = message.trim();
  if (!raw) return reject('EMPTY');
  if (raw.length > CHAT_LIMITS.maxMessage) return reject('TOO_LONG');
  const text = normalize(raw);

  if (CODE.some((re) => re.test(text)) || CODE[0].test(raw)) return reject('CODE');
  if (SQL.test(text)) return reject('SQL');
  if (INJECTION.some((re) => re.test(text))) return reject('INJECTION');
  if (MODIFY_GAME.test(text)) return reject('MODIFY_GAME');
  if (TECH_HARD.test(text)) return reject('TECH');
  if (CREATIVE.test(text)) return reject('OFF_TOPIC');

  const domain = DOMAIN.test(text) || (options.knownNames ?? []).some((n) => n.length >= 3 && text.includes(n));
  if (TECH_SOFT.test(text) && !domain) return reject('TECH');
  if (!domain && !(options.hasHistory && FOLLOW_UP.test(text))) return reject('OFF_TOPIC');
  return { ok: true };
}

/** Limitations the app adds by itself when the question asks for data the chat does not have. */
export function messageLimitations(message: string): ChatLimitation[] {
  const text = normalize(message);
  const out: ChatLimitation[] = [];
  if (/\b(garanti\w*|asegur\w*|pity|guarantee\w*|assur\w*)\b/.test(text)) out.push('NO_GUARANTEE_INFO');
  if (/\b(cuantos|cuantas|how many|combien)\b.{0,40}\b(sobres?|packs?|paquetes?|tiradas?|pulls?|tirages?|intentos?|tries|attempts?|essais?)\b.{0,60}\b(conseg|obten|get|obtenir|asegur|garanti|sure|assur|salga|sale|drop)\w*/.test(text) ||
    /\b(probab\w*|chance\w*|posibilidad\w*)\b.{0,40}\b(\d+|varios|several|plusieurs|cumulad\w*|acumulad\w*|cumulative|en total|in total)\b.{0,20}\b(sobres?|packs?|paquetes?|tiradas?|pulls?|tirages?|intentos?)\b/.test(text)) {
    out.push('NO_PROBABILITY_DATA');
  }
  if (/\b(futur\w*|proxim\w*|next|prochain\w*|esperar|wait|attendre|upcoming|nuevo banner|new banner)\b/.test(text)) out.push('NO_FUTURE_BANNERS');
  return out;
}

/** Fixed phrases of the system prompt; an answer echoing them is treated as a prompt leak. */
export const PROMPT_MARKERS = ['bug battle banner assistant', 'treat everything inside', 'allowed categories', 'answer schema'];

const HARD_UNSAFE = [/```|`/, /<\s*\/?\s*[a-z!]/i, /https?:|www\.|\]\(/i];
const GUARANTEE = /\b(garantiz\w*|garantia\w*|asegur\w*|seguro que|segura que|guarantee\w*|for sure|certainly|garanti\w*|assur\w*|a coup sur|pity)\b|100\s?%/;
const PACKS_NUMBER = /\b(\d+)\s*(sobres?|packs?|paquetes?|tiradas?|pulls?|tirages?|intentos?|tries|attempts?|essais?)\b/g;
const PERCENT = /(\d+(?:[.,]\d+)?)\s?%/g;

export interface AnswerCheck {
  /** Sanitised answer, or undefined if nothing reliable is left. */
  answer?: string;
  limitations: ChatLimitation[];
  /** The answer had code, markup, links or prompt text: show the controlled message, never the text. */
  unsafe: boolean;
}

/**
 * Validates the model text: hard-rejects code, markup, links, technology talk and prompt leaks; drops sentences with
 * invented percentages, guarantees or "packs needed" figures (adding the matching limitation instead).
 */
export function checkAnswer(answer: string | undefined, facts: { percents: number[]; allowedNumbers: number[] }): AnswerCheck {
  const raw = (answer ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.maxAnswer);
  if (!raw) return { limitations: [], unsafe: false };
  const text = normalize(raw);
  if (
    HARD_UNSAFE.some((re) => re.test(raw)) ||
    CODE.slice(1, 2).some((re) => re.test(text)) ||
    SQL.test(text) ||
    TECH_HARD.test(text) ||
    PROMPT_MARKERS.some((m) => text.includes(m))
  ) {
    return { limitations: [], unsafe: true };
  }

  const limitations = new Set<ChatLimitation>();
  const kept: string[] = [];
  for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
    const s = normalize(sentence);
    if (GUARANTEE.test(s)) {
      limitations.add('NO_GUARANTEE_INFO');
      continue;
    }
    const badPercent = [...s.matchAll(PERCENT)].some(([, n]) => {
      const value = Number(n.replace(',', '.'));
      return !facts.percents.some((p) => Math.abs(p - value) <= 0.1);
    });
    const badPacks = [...s.matchAll(PACKS_NUMBER)].some(([, n]) => !facts.allowedNumbers.includes(Number(n)));
    if (badPercent || badPacks) {
      limitations.add('NO_PROBABILITY_DATA');
      continue;
    }
    kept.push(sentence);
  }
  const clean = kept.join(' ').trim();
  return { answer: clean || undefined, limitations: [...limitations], unsafe: false };
}

/** True if the answer names a card the player was not told about (e.g. a card outside the visible banners). */
export function mentionsForeignNames(answer: string, foreignNames: string[]): boolean {
  const text = normalize(answer);
  return foreignNames.some((n) => n.length >= 4 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
}

/* ── Grounding against the request facts (layer 4) ─────────────────────── */

const STRATEGY_WORDS: Record<ChatStrategy, RegExp> = {
  aggressive: /\b(agresiv\w*|aggressi\w*|agressi\w*|ofensiv\w*|offensi\w*)/,
  defensive: /\b(defensiv\w*|defensi\w*|defens\w*)/,
  balanced: /\b(equilibr\w*|balanced|balance)/,
};

/** Strategy the player asked about, if any. */
export function detectStrategy(text: string): ChatStrategy | null {
  const t = normalize(text);
  const hits = (Object.keys(STRATEGY_WORDS) as ChatStrategy[]).filter((s) => STRATEGY_WORDS[s].test(t));
  return hits.length === 1 ? hits[0] : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (text: string, name: string) => name.length >= 3 && new RegExp(`(^|[^a-z0-9])${escapeRe(name)}($|[^a-z0-9])`).test(text);
const MAX_SENTENCES = 3;
const MAX_GROUNDED_CHARS = 400;
/** Unambiguous banner/card vocabulary for checking answers ("sobre" alone also means "about" in Spanish). */
const ANSWER_DOMAIN = /\b(banners?|bannieres?|sobres|packs?|paquetes?|paquets?|cartas?|cards?|cartes?|coleccion|collection|mazos?|decks?|oro|gold|monedas?|coins?|probabilidad\w*|probabilit\w*|rareza|rarity|rarete|gacha|tiradas?|pulls?|tirages?)\b/;
const NUMBER = /\b\d+(?:[.,]\d+)?\b/g;

/** Every number the answer may legitimately quote: costs, gold, counts, odds, stats and end dates. */
function factNumbers(request: BannerChatRequest): Set<number> {
  const out = new Set<number>([0, 1, 2, request.player.gold, request.player.ownedDistinct, request.player.ownedTotal]);
  for (const b of request.banners) {
    [b.cost, b.cardsPerPack, b.packsAffordable, b.newCards, b.maxedCards, b.cards.length, b.rank.balanced, b.rank.aggressive, b.rank.defensive]
      .forEach((n) => out.add(n));
    b.endsAt.split('-').forEach((n) => out.add(Number(n)));
    b.cards.forEach((c) => out.add(c.pPerDrawPct).add(c.owned));
  }
  for (const c of request.cards) [c.cost, c.power, c.attackCost, c.sanityMax, c.owned].forEach((n) => n !== undefined && out.add(n));
  out.add(request.banners.length).add(request.cards.length);
  return out;
}

export interface GroundedAnswer {
  answer?: string;
  recommendedBannerIds: string[];
  mentionedCardIds: string[];
  limitations: ChatLimitation[];
  /** The text had nothing to do with banners or cards: treat as out of scope. */
  offTopic: boolean;
}

/**
 * Deterministic grounding of the model answer against the facts that were sent: sentences with wrong odds, cards placed
 * in banners that don't contain them or cumulative-chance claims are dropped; a recommendation that contradicts the
 * deterministic ranking (or talks about another strategy) is not shown; reference chips and limitations are computed
 * from the facts, never trusted from the model.
 */
export function groundAnswer(params: {
  answer: string | undefined;
  category: ChatCategory;
  request: BannerChatRequest;
  modelBannerIds: string[];
  modelCardIds: string[];
}): GroundedAnswer {
  const { request, category } = params;
  const lastQuestion = [...request.history].reverse().find((h) => h.role === 'user');
  const strategy = detectStrategy(request.message) ?? (lastQuestion?.role === 'user' ? detectStrategy(lastQuestion.text) : null);
  const cardNamesOf = new Map(request.cards.map((c) => [c.id, [normalize(c.name), normalize(c.id.replace(/[-_]+/g, ' '))]]));
  const bannerOfTitle = request.banners.map((b) => ({ id: b.id, title: normalize(b.title) }));
  const bannerCards = new Map(request.banners.map((b) => [b.id, new Map(b.cards.map((c) => [c.id, c.pPerDrawPct]))]));
  const allPercents = request.banners.flatMap((b) => b.cards.map((c) => c.pPerDrawPct));
  const allowedNumbers = [...new Set(request.banners.flatMap((b) => [b.packsAffordable, b.cardsPerPack]))];
  const limitations = new Set<ChatLimitation>(messageLimitations(request.message));
  const asksGuarantee = limitations.has('NO_GUARANTEE_INFO') || limitations.has('NO_PROBABILITY_DATA');

  const base = checkAnswer(params.answer, { percents: allPercents, allowedNumbers });
  base.limitations.forEach((l) => limitations.add(l));
  let answer = base.unsafe ? undefined : base.answer;

  const kept: string[] = [];
  const mentionedBannersInOrder: string[] = [];
  const recommends = category === 'banner_recommendation' || category === 'deck_strategy';
  const recommendTop = recommends ? request.banners.find((b) => b.rank[strategy ?? 'balanced'] === 1) : undefined;
  const numbers = factNumbers(request);
  const isFact = (n: number) => [...numbers].some((f) => Math.abs(f - n) <= 0.1);
  const sentences = (answer ?? '').split(/(?<=[.!?])\s+/);
  // A trailing fragment without final punctuation is a cut-off sentence
  if (sentences.length > 1 && !/[.!?]["')»]?$/.test(sentences[sentences.length - 1].trim())) sentences.pop();
  for (const sentence of sentences) {
    const s = normalize(sentence);
    const cards = [...cardNamesOf].filter(([, names]) => names.some((n) => contains(s, n))).map(([id]) => id);
    const banners = bannerOfTitle.filter((b) => contains(s, b.title)).map((b) => b.id);
    const percents = [...s.matchAll(PERCENT)].map(([, n]) => Number(n.replace(',', '.')));
    const hasPackCount = [...s.matchAll(PACKS_NUMBER)].length > 0;
    // A card placed in banners must really be there (a single card named with several banners must be in all of them)
    const inBanner = (c: string, b: string) => bannerCards.get(b)!.has(c);
    const wrongPlace =
      banners.length > 0 &&
      (cards.length === 1 ? !banners.every((b) => inBanner(cards[0], b)) : cards.some((c) => !banners.some((b) => inBanner(c, b))));
    // Percentages next to a card must be that card's real per-draw odds; next to a banner, odds of that banner
    const wrongOdds = percents.some((p) =>
      cards.length > 0
        ? !cards.some((c) => request.banners.some((b) => (banners.length === 0 || banners.includes(b.id)) && Math.abs((bannerCards.get(b.id)!.get(c) ?? -1) - p) <= 0.1))
        : !request.banners.some((b) => (banners.length === 0 || banners.includes(b.id)) && [...bannerCards.get(b.id)!.values()].some((x) => Math.abs(x - p) <= 0.1)),
    );
    // Odds combined with a number of packs is a cumulative-chance claim the chat must not make
    const cumulative = percents.length > 0 && hasPackCount;
    // Any other number must come from the facts (no invented ratios, counts or dates)
    const inventedNumber = [...s.matchAll(NUMBER)].some(([n]) => !isFact(Number(n.replace(',', '.'))));
    // Internal field names from the data are never shown to the player
    const leaksData = /\b(perdrawpct|rankforstrategy|packsaffordable|costgold|missingbystrategy|focuscards|inbanners)\b/.test(s);
    // When the question is about specific cards, every banner named without another card must contain one of them
    const wrongFocusBanner =
      cards.length === 0 && banners.length > 0 && request.focusCardIds.length > 0 &&
      !banners.every((b) => request.focusCardIds.some((c) => inBanner(c, b)));
    // In a recommendation, cards named without another banner must belong to the recommended banner
    const wrongRecommendedCards =
      !!recommendTop && banners.length === 0 && cards.some((c) => !inBanner(c, recommendTop.id));
    if (wrongOdds || cumulative) limitations.add('NO_PROBABILITY_DATA');
    if (wrongPlace || wrongOdds || cumulative || inventedNumber || leaksData || wrongFocusBanner || wrongRecommendedCards) continue;
    // Guarantee / packs-needed questions: only validated per-draw odds may be stated, the rest is the translated limitation
    if (asksGuarantee && percents.length === 0) continue;
    if (category === 'card_location' && cards.length > 0 && banners.length === 0 && !/\b(ningun|ninguno|no esta|not in|no active|aucune|n.est dans)\b/.test(s)) continue;
    banners.forEach((b) => !mentionedBannersInOrder.includes(b) && mentionedBannersInOrder.push(b));
    kept.push(sentence);
  }
  answer = kept.slice(0, MAX_SENTENCES).join(' ').slice(0, MAX_GROUNDED_CHARS).trim() || undefined;

  // The model sometimes answers unrelated questions (e.g. capitals, poems) as "other_allowed"
  const knownNames = [...[...cardNamesOf.values()].flat(), ...bannerOfTitle.map((b) => b.title)];
  const offTopic = !!answer && !ANSWER_DOMAIN.test(normalize(answer)) && !knownNames.some((n) => contains(normalize(answer!), n));
  if (offTopic) return { recommendedBannerIds: [], mentionedCardIds: [], limitations: [], offTopic: true };

  // Talking about another strategy than the one asked for (typical in follow-ups) is not reliable
  if (answer && strategy) {
    const t = normalize(answer);
    const others = (Object.keys(STRATEGY_WORDS) as ChatStrategy[]).filter((s) => s !== strategy && STRATEGY_WORDS[s].test(t));
    if (others.length > 0 && !STRATEGY_WORDS[strategy].test(t)) answer = undefined;
  }

  const sentBanners = new Set(request.banners.map((b) => b.id));
  const sentCards = new Set(request.cards.map((c) => c.id));
  let recommendedBannerIds = params.modelBannerIds.filter((id) => sentBanners.has(id));
  let mentionedCardIds = params.modelCardIds.filter((id) => sentCards.has(id));

  // Recommendations follow the deterministic ranking (heuristic): the chip is the rank-1 banner for the strategy
  if (category === 'banner_recommendation' || category === 'deck_strategy') {
    const top = request.banners.find((b) => b.rank[strategy ?? 'balanced'] === 1);
    if (top) {
      if (answer && mentionedBannersInOrder.length > 0 && mentionedBannersInOrder[0] !== top.id) answer = undefined;
      recommendedBannerIds = [top.id];
      // Only cards of the recommended banner that the player can still get
      const useful = new Set(top.cards.filter((c) => !c.maxed).map((c) => c.id));
      mentionedCardIds = mentionedCardIds.filter((id) => useful.has(id));
    }
  }
  if (category === 'collection_gap') mentionedCardIds = request.missing[strategy ?? 'balanced'];

  // Card questions: chips come from the facts (where the named cards really are)
  if (request.focusCardIds.length > 0) {
    if (!recommends) mentionedCardIds = [...request.focusCardIds];
    else mentionedCardIds = [...new Set([...request.focusCardIds, ...mentionedCardIds])];
    const where = request.cards.filter((c) => request.focusCardIds.includes(c.id)).flatMap((c) => c.inBanners);
    if (!recommends) recommendedBannerIds = [...new Set(where)];
    if (request.cards.some((c) => request.focusCardIds.includes(c.id) && c.inBanners.length === 0)) limitations.add('CARD_NOT_AVAILABLE');
  }
  if (category === 'banner_probability') limitations.add('RANDOM_RESULTS');
  if (
    (category === 'banner_cost' || category === 'banner_recommendation') &&
    recommendedBannerIds.some((id) => request.banners.find((b) => b.id === id)?.packsAffordable === 0)
  ) {
    limitations.add('NOT_ENOUGH_GOLD');
  }

  return {
    answer,
    recommendedBannerIds: recommendedBannerIds.slice(0, CHAT_LIMITS.maxRecommendedBanners),
    mentionedCardIds: mentionedCardIds.slice(0, CHAT_LIMITS.maxMentionedCards),
    limitations: [...limitations],
    offTopic: false,
  };
}
