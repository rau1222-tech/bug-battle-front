/**
 * "Generate deck" AI operation: builds the prompt and JSON schema, asks the model and maps its answer back
 * to card ids. Only basic shape checks happen here; the browser applies the hard rules, repair and fallback.
 */
import { z } from 'zod';
import {
  LIMITS,
  type DeckGenerateRequest,
  type DeckGenerateResponse,
} from '../src/game/deckGenerator/contract';
import { STRATEGY_PROFILES } from '../src/game/deckGenerator/strategies';
import { OllamaError, type OllamaClient } from './ollama';

const LANGUAGE_NAMES = { es: 'Spanish (español)', en: 'English', fr: 'French (français)' } as const;

const RawModelOutputSchema = z.object({
  picks: z.array(z.string().max(LIMITS.maxIdLength)).max(LIMITS.maxCards),
  explanation: z.string().optional(),
});

export function buildDeckPrompt(request: DeckGenerateRequest) {
  const profile = STRATEGY_PROFILES[request.strategy];
  const n = request.deckSize;
  const range = (t: keyof typeof profile.typeShare) =>
    `${Math.ceil(profile.typeShare[t][0] * n)}-${Math.floor(profile.typeShare[t][1] * n)}`;
  // Opaque refs: card ids come from the database and never reach the model as free text
  const refs = request.cards.map((_, i) => `c${i + 1}`);
  // Seeded order avoids the model copying the list top-down and adds controlled variety
  const order = shuffled(request.cards.map((_, i) => i), request.seed);
  const cards = order.map((i) => {
    const c = request.cards[i];
    return {
      ref: refs[i],
      type: c.type,
      max: Math.min(c.owned, request.maxCopies),
      cost: c.cost,
      ...(c.power !== undefined ? { power: c.power } : {}),
      ...(c.attackCost !== undefined ? { attackCost: c.attackCost } : {}),
      ...(c.sanityMax !== undefined ? { sanity: c.sanityMax } : {}),
      roles: roles(c),
      ...(c.skills.length ? { skills: c.skills.map((s) => ({ action: s.action, target: s.target, power: s.power, cost: s.cost, duration: s.duration })) } : {}),
    };
  });
  const minDistinct = Math.ceil(n / request.maxCopies);

  const system = [
    'You build decks for Bug Battle, a turn-based card game. Players get 3 energy per turn (max 10).',
    'Programmers ("programador") attack the Bug: they deal `power` damage for `attackCost` energy.',
    'QA cards attack enemy cards (reduce their sanity) or return them to hand. Consumables ("consumible") are used once from the hand.',
    'The Bug counterattacks the strongest attacker, so sanity keeps cards alive.',
    'Skill actions: DANIO_DIRECTO = direct damage to the Bug, APLICAR_ESTADO = power buff on an ally for `duration` turns, DEVOLVER_MANO = return an enemy card to hand, CURAR_CORDURA = heal ally sanity. Skill `cost` is energy.',
    'Roles: attacker = damages the Bug, burst = direct damage skill, buff = boosts an ally, control = removes enemy cards, heal = restores sanity, tank = high sanity, cheap = cost 0-1, expensive = cost 3+.',
    '',
    `Strategy: ${profile.guidance}`,
    `Aim for: programmers ${range('programador')} copies, QA ${range('qa')} copies, consumables ${range('consumible')} copies; ` +
      `about ${Math.round(profile.curve[0] * n)} copies costing 0-1, ${Math.round(profile.curve[1] * n)} costing 2 and ` +
      `${Math.round(profile.curve[2] * n)} costing 3 or more; at least ${Math.ceil(profile.minDamageShare * n)} copies that can damage the Bug.`,
    '',
    'Hard rules:',
    `- "picks" has exactly ${n} entries; each entry is the "ref" of one copy you put in the deck.`,
    '- A ref may appear at most as many times as its "max".',
    `- With max ${request.maxCopies} copies you need at least ${minDistinct} different cards.`,
    '- Do not simply list every card: leave out the cards that fit the strategy worst and repeat the best ones.',
    'Answer only with JSON that matches the schema: no markdown, no code fences, no extra text.',
    `The "explanation" must be ONE short sentence (max 15 words) written in ${LANGUAGE_NAMES[request.language ?? 'en']}.`,
  ].join('\n');

  const language = LANGUAGE_NAMES[request.language ?? 'en'];
  const user = `${JSON.stringify({ deckSize: n, cards })}\nRemember: "explanation" in ${language}, max 15 words.`;

  // One entry per copy with a fixed length: the grammar guarantees the deck size, so the
  // small model only has to choose cards, not add numbers
  const schema = {
    type: 'object',
    properties: {
      explanation: { type: 'string', maxLength: 200 },
      picks: { type: 'array', items: { type: 'string', enum: refs }, minItems: n, maxItems: n },
    },
    required: ['explanation', 'picks'],
  };

  return { system, user, schema, refs };
}

/** Deterministic role tags so a small model can match cards to the strategy. */
function roles(c: DeckGenerateRequest['cards'][number]): string[] {
  const out: string[] = [];
  const has = (action: string) => c.skills.some((s) => s.action === action);
  if (c.type === 'programador' && (c.power ?? 0) > 0) out.push('attacker');
  if (has('DANIO_DIRECTO')) out.push('burst');
  if (has('APLICAR_ESTADO')) out.push('buff');
  if (c.type === 'qa' || has('DEVOLVER_MANO')) out.push('control');
  if (has('CURAR_CORDURA')) out.push('heal');
  if ((c.sanityMax ?? 0) >= 4) out.push('tank');
  if (c.cost <= 1) out.push('cheap');
  if (c.cost >= 3) out.push('expensive');
  return out;
}

function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function generateDeckWithModel(
  request: DeckGenerateRequest,
  ollama: OllamaClient,
  options: { temperature: number; timeoutMs: number; signal?: AbortSignal },
): Promise<DeckGenerateResponse> {
  const started = Date.now();
  const { system, user, schema, refs } = buildDeckPrompt(request);
  const raw = await ollama.chatJson({
    system,
    user,
    schema,
    temperature: options.temperature,
    seed: request.seed,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    numPredict: 700,
  });
  const parsed = RawModelOutputSchema.safeParse(raw);
  if (!parsed.success) throw new OllamaError('INVALID_MODEL_OUTPUT', 'Model output does not match the deck schema');
  if (parsed.data.picks.length === 0) throw new OllamaError('EMPTY_RESPONSE', 'The model selected no cards');

  const idOf = new Map(refs.map((ref, i) => [ref, request.cards[i].id]));
  // Group one-entry-per-copy picks into {id, quantity}; unknown refs pass through so the browser's repair drops them
  const quantities = new Map<string, number>();
  for (const ref of parsed.data.picks) {
    const id = idOf.get(ref) ?? ref;
    quantities.set(id, (quantities.get(id) ?? 0) + 1);
  }
  const explanation = parsed.data.explanation?.replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxExplanationLength) || undefined;
  return {
    result: {
      strategy: request.strategy,
      cards: [...quantities].map(([id, quantity]) => ({ id, quantity })),
      explanation,
    },
    meta: { model: ollama.model, seed: request.seed, temperature: options.temperature, durationMs: Date.now() - started },
  };
}
