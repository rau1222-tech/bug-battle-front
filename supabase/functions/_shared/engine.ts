// Shared, dependency-free game engine for online matches.
// Runs on the server (Edge Function `match-engine`) and is imported by the web client for types/tests.
// Card/skill data must stay in sync with src/constants (guarded by src/test/onlineEngine.test.ts).

export type Side = 'p1' | 'p2';
export type MatchPhase = 'playing' | 'round-end' | 'game-over';
export type CardType = 'programador' | 'qa' | 'consumible';
export type EffectType = 'buff_ataque' | 'debuff_ataque' | 'escudo';
export type SkillTarget = 'bug' | 'carta_enemiga' | 'carta_aliada';
export type SkillActionType = 'APLICAR_ESTADO' | 'DEVOLVER_MANO' | 'DANIO_DIRECTO' | 'CURAR_CORDURA';

export interface CardRule {
  id: string;
  nombre: string;
  tipo: CardType;
  potencia?: number;
  coste: number;
  ataqueCoste?: number;
  corduraMax?: number;
  descripcion: string;
  habilidades: [number, number, number, number][];
}

export interface SkillRule {
  id: number;
  nombre: string;
  descripcion: string;
  objetivo: SkillTarget;
  accionTipo: SkillActionType;
  efectoTipo?: EffectType;
}

export interface Effect {
  tipo: EffectType;
  valor: number;
  turnosRestantes: number;
}

export interface EngineCard {
  instanceId: string;
  definition: CardRule;
  cordura: number;
  efectosActivos: Effect[];
  disponible: boolean;
}

export interface DeckEntry {
  card_id: string;
  quantity: number;
}

export const BUG_MAX_COMPLEXITY = 10;
export const INITIAL_DRAW = 4;
export const TABLE_MAX = 4;
export const MAX_HAND_SIZE = 6;
export const MAX_ENERGY_CAP = 10;
export const ENERGY_PER_TURN = 3;
export const ENERGY_BONUS_HIT = 1;
export const MAX_ROUNDS = 3;
/** Turns (both sides combined) before a round is decided by damage dealt. */
export const MAX_ROUND_TURNS = 30;
export const TURN_SECONDS = 90;
export const ROUND_END_SECONDS = 10;

export const CARD_RULES: CardRule[] = [
  { id: 'junior-dev', nombre: 'Junior Dev', tipo: 'programador', potencia: 1, coste: 1, ataqueCoste: 1, corduraMax: 2, descripcion: 'Resuelve bugs simples con entusiasmo.', habilidades: [] },
  { id: 'mid-dev', nombre: 'Mid Dev', tipo: 'programador', potencia: 2, coste: 2, ataqueCoste: 1, corduraMax: 3, descripcion: 'Experiencia sólida en debugging.', habilidades: [] },
  { id: 'senior-dev', nombre: 'Senior Dev', tipo: 'programador', potencia: 3, coste: 3, ataqueCoste: 1, corduraMax: 4, descripcion: 'Veterano cazador de bugs.', habilidades: [[3, 2, 2, 1]] },
  { id: 'fullstack', nombre: 'Fullstack', tipo: 'programador', potencia: 2, coste: 2, ataqueCoste: 1, corduraMax: 3, descripcion: 'Ataca bugs en frontend y backend.', habilidades: [[3, 1, 1, 1]] },
  { id: 'devops', nombre: 'DevOps', tipo: 'programador', potencia: 1, coste: 1, ataqueCoste: 1, corduraMax: 2, descripcion: 'Automatiza la destrucción de bugs.', habilidades: [[5, 2, 2, 0]] },
  { id: 'intern', nombre: 'Intern', tipo: 'programador', potencia: 1, coste: 1, ataqueCoste: 1, corduraMax: 2, descripcion: 'Novato con ganas de aprender.', habilidades: [] },
  { id: 'architect', nombre: 'Architect', tipo: 'programador', potencia: 2, coste: 3, ataqueCoste: 1, corduraMax: 5, descripcion: 'Diseña la solución desde la raíz.', habilidades: [[3, 3, 1, 1]] },
  { id: 'qa-tester', nombre: 'QA Tester', tipo: 'qa', potencia: 1, coste: 1, ataqueCoste: 1, corduraMax: 2, descripcion: 'Devuelve una carta rival a su mano.', habilidades: [[4, 0, 1, 0]] },
  { id: 'qa-lead', nombre: 'QA Lead', tipo: 'qa', potencia: 2, coste: 2, ataqueCoste: 1, corduraMax: 3, descripcion: 'Limpia la mesa del rival con autoridad.', habilidades: [[4, 0, 2, 0]] },
  { id: 'cafe-maquina', nombre: 'Café de Máquina', tipo: 'consumible', coste: 1, descripcion: 'Restaura 3 de cordura a un aliado.', habilidades: [[6, 3, 1, 0]] },
  { id: 'pr-aprobado', nombre: 'PR Aprobado', tipo: 'consumible', coste: 2, descripcion: '+2 potencia a un aliado por 1 turno.', habilidades: [[7, 2, 2, 1]] },
  { id: 'hotfix', nombre: 'Hotfix de Emergencia', tipo: 'consumible', coste: 2, descripcion: '2 de daño directo al Bug.', habilidades: [[8, 2, 2, 0]] },
];

export const SKILL_RULES: Record<number, SkillRule> = {
  3: { id: 3, nombre: 'Par Programming', descripcion: 'Aumenta la potencia de una carta aliada este turno.', objetivo: 'carta_aliada', accionTipo: 'APLICAR_ESTADO', efectoTipo: 'buff_ataque' },
  4: { id: 4, nombre: 'QA Testing', descripcion: 'Devuelve una carta enemiga a la mano del rival (se descarta si su mano está llena).', objetivo: 'carta_enemiga', accionTipo: 'DEVOLVER_MANO' },
  5: { id: 5, nombre: 'Automatización', descripcion: 'Inflige daño extra al bug igual a la potencia indicada.', objetivo: 'bug', accionTipo: 'DANIO_DIRECTO' },
  6: { id: 6, nombre: 'Cafeína', descripcion: 'Restaura cordura a un aliado.', objetivo: 'carta_aliada', accionTipo: 'CURAR_CORDURA' },
  7: { id: 7, nombre: 'Motivación', descripcion: 'Aumenta la potencia de una carta aliada.', objetivo: 'carta_aliada', accionTipo: 'APLICAR_ESTADO', efectoTipo: 'buff_ataque' },
  8: { id: 8, nombre: 'Parche Rápido', descripcion: 'Inflige daño directo al bug.', objetivo: 'bug', accionTipo: 'DANIO_DIRECTO' },
};

const RULES_BY_ID = new Map(CARD_RULES.map((c) => [c.id, c]));

export function potenciaReal(card: EngineCard): number {
  const delta = card.efectosActivos.reduce((acc, e) => (
    e.tipo === 'buff_ataque' ? acc + e.valor : e.tipo === 'debuff_ataque' ? acc - e.valor : acc
  ), 0);
  return Math.max(0, (card.definition.potencia ?? 0) + delta);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeck(composition: DeckEntry[], random: () => number, prefix: string): EngineCard[] {
  const deck: EngineCard[] = [];
  let counter = 0;
  for (const entry of composition) {
    const def = RULES_BY_ID.get(entry.card_id);
    if (!def) continue;
    for (let i = 0; i < entry.quantity; i++) {
      deck.push({ instanceId: `${prefix}${def.id}-${counter++}`, definition: def, cordura: def.corduraMax ?? 0, efectosActivos: [], disponible: true });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface SideState {
  hand: EngineCard[];
  table: (EngineCard | null)[];
  deck: EngineCard[];
  score: number;
  energy: number;
  maxEnergy: number;
  turnCount: number;
  /** Damage dealt to the Bug this round (tie-breaker at the turn limit). */
  damage: number;
}

export interface LastAction {
  side: Side;
  type: MatchAction['type'];
  cardId: string | null;
  targetId: string | null;
  defId: string | null;
}

export interface MatchState {
  seed: number;
  decks: Record<Side, DeckEntry[]>;
  names: Record<Side, string>;
  sides: Record<Side, SideState>;
  bugComplexity: number;
  roundNumber: number;
  roundStarter: Side;
  roundTurns: number;
  gamePhase: MatchPhase;
  turn: Side;
  lastAttacker: Side | null;
  isFirstTurn: boolean;
  message: string;
  lastAction: LastAction | null;
  /** Epoch ms when the current turn (or round-end pause) began; set by the server. */
  turnStartedAt: number;
  /** Consecutive timed-out turns per side; maintained by the server. */
  afk?: Partial<Record<Side, number>>;
}

export type MatchAction =
  | { type: 'PLACE_CARD'; side: Side; cardId: string; slot: number }
  | { type: 'ATTACK_BUG'; side: Side; cardId: string }
  | { type: 'ATTACK_CARD'; side: Side; attackerId: string; targetId: string }
  | { type: 'USE_SKILL'; side: Side; cardId: string; skillIndex: number; targetId?: string }
  | { type: 'USE_CONSUMABLE'; side: Side; cardId: string; targetId?: string }
  | { type: 'END_TURN'; side: Side }
  | { type: 'NEXT_ROUND'; side: Side };

export interface ApplyResult {
  state: MatchState;
  /** Set when the action was rejected; state is unchanged. */
  error?: string;
}

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1');

const emptyTable = (): (EngineCard | null)[] => Array.from({ length: TABLE_MAX }, () => null);

function tickEfectos(table: (EngineCard | null)[]): (EngineCard | null)[] {
  return table.map((card) => {
    if (!card) return null;
    const efectosActivos = card.efectosActivos
      .map((e) => ({ ...e, turnosRestantes: e.turnosRestantes - 1 }))
      .filter((e) => e.turnosRestantes > 0);
    return { ...card, efectosActivos };
  });
}

const markUsed = (table: (EngineCard | null)[], cardId: string) =>
  table.map((c) => (c?.instanceId === cardId ? { ...c, disponible: false } : c));

function dealRound(seed: number, round: number, decks: Record<Side, DeckEntry[]>) {
  const random = mulberry32((seed ^ Math.imul(round, 0x9e3779b1)) >>> 0);
  const deal = (side: Side) => {
    const deck = buildDeck(decks[side], random, `${side}-`);
    return { hand: deck.slice(0, INITIAL_DRAW), deck: deck.slice(INITIAL_DRAW) };
  };
  return { p1: deal('p1'), p2: deal('p2') };
}

function freshSide(dealt: { hand: EngineCard[]; deck: EngineCard[] }, score: number, starts: boolean): SideState {
  // The second player starts at 0⚡ and gains the normal +3⚡ on its first turn, so both open with 3⚡
  return { hand: dealt.hand, deck: dealt.deck, table: emptyTable(), score, energy: starts ? ENERGY_PER_TURN : 0, maxEnergy: MAX_ENERGY_CAP, turnCount: starts ? 1 : 0, damage: 0 };
}

export function initMatch(seed: number, decks: Record<Side, DeckEntry[]>, names: Record<Side, string>, starter?: Side): MatchState {
  const first: Side = starter ?? (mulberry32(seed ^ 0x5bd1e995)() < 0.5 ? 'p1' : 'p2');
  const dealt = dealRound(seed, 1, decks);
  return {
    seed,
    decks,
    names,
    sides: { p1: freshSide(dealt.p1, 0, first === 'p1'), p2: freshSide(dealt.p2, 0, first === 'p2') },
    bugComplexity: BUG_MAX_COMPLEXITY,
    roundNumber: 1,
    roundStarter: first,
    roundTurns: 0,
    gamePhase: 'playing',
    turn: first,
    lastAttacker: null,
    isFirstTurn: true,
    message: `🎯 Empieza ${names[first]}`,
    lastAction: null,
    turnStartedAt: 0,
  };
}

function withSide(s: MatchState, side: Side, patch: Partial<SideState>): MatchState {
  return { ...s, sides: { ...s.sides, [side]: { ...s.sides[side], ...patch } } };
}

function endRound(s: MatchState, winner: Side, message: string): MatchState {
  const score = s.sides[winner].score + 1;
  const over = s.roundNumber >= MAX_ROUNDS || score > MAX_ROUNDS / 2;
  return {
    ...withSide(s, winner, { score }),
    lastAttacker: winner,
    gamePhase: over ? 'game-over' : 'round-end',
    message,
  };
}

function hitBug(s: MatchState, side: Side, damage: number, message: string, countsAsAttack: boolean): MatchState {
  const dealt = Math.min(damage, s.bugComplexity);
  const hp = s.bugComplexity - dealt;
  const next = withSide(s, side, { damage: s.sides[side].damage + dealt });
  if (hp > 0) {
    return { ...next, bugComplexity: hp, lastAttacker: countsAsAttack ? side : s.lastAttacker, message };
  }
  return endRound({ ...next, bugComplexity: 0 }, side, `🎉 ${s.names[side]} eliminó el Bug! +1 punto`);
}

const reject = (state: MatchState, error: string): ApplyResult => ({ state, error });

export function applyAction(s: MatchState, action: MatchAction): ApplyResult {
  const result = applyRules(s, action);
  if (result.error) return result;
  const cardId = 'cardId' in action ? action.cardId : 'attackerId' in action ? action.attackerId : null;
  const targetId = 'targetId' in action ? action.targetId ?? null : null;
  const own = s.sides[action.side];
  const defId = cardId ? [...own.hand, ...own.table].find((c) => c?.instanceId === cardId)?.definition.id ?? null : null;
  return { state: { ...result.state, lastAction: { side: action.side, type: action.type, cardId, targetId, defId } } };
}

function applyRules(s: MatchState, action: MatchAction): ApplyResult {
  const side = action.side;
  const foe = other(side);
  const me = s.sides[side];
  const them = s.sides[foe];
  const name = s.names[side];

  if (action.type === 'NEXT_ROUND') {
    // Either player (or a timeout) may open the next round, so an idle winner can't stall it
    if (s.gamePhase !== 'round-end') return reject(s, 'No puedes iniciar la ronda');
    const round = s.roundNumber + 1;
    const starter = other(s.lastAttacker ?? s.roundStarter);
    const dealt = dealRound(s.seed, round, s.decks);
    return {
      state: {
        ...s,
        sides: {
          p1: freshSide(dealt.p1, s.sides.p1.score, starter === 'p1'),
          p2: freshSide(dealt.p2, s.sides.p2.score, starter === 'p2'),
        },
        bugComplexity: BUG_MAX_COMPLEXITY,
        roundNumber: round,
        roundStarter: starter,
        roundTurns: 0,
        gamePhase: 'playing',
        turn: starter,
        lastAttacker: null,
        isFirstTurn: true,
        message: `🎯 Ronda ${round} — empieza ${s.names[starter]}`,
      },
    };
  }

  if (s.gamePhase !== 'playing') return reject(s, 'La ronda ha terminado');
  if (s.turn !== side) return reject(s, 'No es tu turno');

  switch (action.type) {
    case 'PLACE_CARD': {
      if (action.slot < 0 || action.slot >= TABLE_MAX) return reject(s, 'Hueco no válido');
      if (me.table[action.slot] !== null) return reject(s, '⚠️ Ese hueco ya está ocupado.');
      const card = me.hand.find((c) => c.instanceId === action.cardId);
      if (!card || card.definition.tipo === 'consumible') return reject(s, 'Carta no válida');
      if (me.energy < card.definition.coste) return reject(s, `⚠️ Necesitas ${card.definition.coste}⚡ (tienes ${me.energy})`);
      const table = [...me.table];
      table[action.slot] = card;
      return {
        state: {
          ...withSide(s, side, {
            hand: me.hand.filter((c) => c.instanceId !== card.instanceId),
            table,
            energy: me.energy - card.definition.coste,
          }),
          message: `📋 ${name} coloca ${card.definition.nombre} (-${card.definition.coste}⚡).`,
        },
      };
    }

    case 'ATTACK_BUG': {
      const card = me.table.find((c) => c?.instanceId === action.cardId);
      if (!card || card.definition.tipo !== 'programador') return reject(s, 'Carta no válida');
      if (!card.disponible) return reject(s, '⚠️ Esta carta ya actuó este turno.');
      const dmg = potenciaReal(card);
      if (dmg === 0) return reject(s, 'Esta carta no tiene potencia');
      const cost = card.definition.ataqueCoste ?? 0;
      if (me.energy < cost) return reject(s, `⚠️ Necesitas ${cost}⚡ para atacar.`);
      const next = withSide(s, side, { table: markUsed(me.table, card.instanceId), energy: me.energy - cost });
      const hp = Math.max(0, s.bugComplexity - dmg);
      return { state: hitBug(next, side, dmg, `⚔️ ${card.definition.nombre} (${name}) atacó con ${dmg}! Bug: ${hp}/${BUG_MAX_COMPLEXITY} (-${cost}⚡)`, true) };
    }

    case 'ATTACK_CARD': {
      const attacker = me.table.find((c) => c?.instanceId === action.attackerId);
      if (!attacker || attacker.definition.tipo !== 'qa') return reject(s, 'Carta no válida');
      if (!attacker.disponible) return reject(s, '⚠️ Esta carta ya actuó este turno.');
      const dmg = potenciaReal(attacker);
      if (dmg === 0) return reject(s, 'Esta carta no tiene potencia');
      const cost = attacker.definition.ataqueCoste ?? 0;
      if (me.energy < cost) return reject(s, `⚠️ Necesitas ${cost}⚡ para atacar.`);
      const idx = them.table.findIndex((c) => c?.instanceId === action.targetId);
      if (idx < 0) return reject(s, 'Objetivo no válido');
      const target = them.table[idx]!;
      const cordura = target.cordura - dmg;
      const foeTable = [...them.table];
      foeTable[idx] = cordura <= 0 ? null : { ...target, cordura };
      const next = withSide(
        withSide(s, side, { table: markUsed(me.table, attacker.instanceId), energy: me.energy - cost }),
        foe,
        { table: foeTable },
      );
      return {
        state: {
          ...next,
          message: cordura <= 0
            ? `💥 ${attacker.definition.nombre} (${name}) destruyó a ${target.definition.nombre}! (-${cost}⚡)`
            : `🎯 ${attacker.definition.nombre} (${name}) dañó a ${target.definition.nombre}. 🧠 ${cordura}/${target.definition.corduraMax} (-${cost}⚡)`,
        },
      };
    }

    case 'USE_SKILL':
    case 'USE_CONSUMABLE': {
      const fromHand = action.type === 'USE_CONSUMABLE';
      const card = fromHand
        ? me.hand.find((c) => c.instanceId === action.cardId)
        : me.table.find((c) => c?.instanceId === action.cardId) ?? undefined;
      if (!card) return reject(s, 'Carta no válida');
      if (fromHand && card.definition.tipo !== 'consumible') return reject(s, 'Carta no válida');
      if (!fromHand && !card.disponible) return reject(s, '⚠️ Esta carta ya actuó este turno.');
      const tuple = card.definition.habilidades[action.type === 'USE_SKILL' ? action.skillIndex : 0];
      if (!tuple) return reject(s, 'Habilidad no válida');
      const [skillId, potencia, coste, duracion] = tuple;
      const skill = SKILL_RULES[skillId];
      if (!skill) return reject(s, 'Habilidad no válida');
      if (me.energy < coste) return reject(s, `⚠️ Necesitas ${coste}⚡ para usar ${skill.nombre}.`);

      const paid = withSide(s, side, fromHand
        ? { hand: me.hand.filter((c) => c.instanceId !== card.instanceId), energy: me.energy - coste }
        : { table: markUsed(me.table, card.instanceId), energy: me.energy - coste });
      const icon = fromHand ? '💊' : '✨';
      const targetId = action.targetId;

      switch (skill.accionTipo) {
        case 'DANIO_DIRECTO': {
          if (skill.objetivo !== 'bug') return reject(s, 'Habilidad no válida');
          const hp = Math.max(0, s.bugComplexity - potencia);
          return { state: hitBug(paid, side, potencia, `${icon} ${skill.nombre} (${name}): ${potencia} de daño! Bug: ${hp}/${BUG_MAX_COMPLEXITY} (-${coste}⚡)`, false) };
        }
        case 'DEVOLVER_MANO': {
          if (skill.objetivo !== 'carta_enemiga' || !targetId) return reject(s, 'Objetivo no válido');
          const idx = them.table.findIndex((c) => c?.instanceId === targetId);
          if (idx < 0) return reject(s, 'Objetivo no válido');
          const target = them.table[idx]!;
          const foeTable = [...them.table];
          foeTable[idx] = null;
          const handFull = them.hand.length >= MAX_HAND_SIZE;
          const fresh: EngineCard = { ...target, cordura: target.definition.corduraMax ?? 0, efectosActivos: [], disponible: true };
          return {
            state: {
              ...withSide(paid, foe, { table: foeTable, hand: handFull ? them.hand : [...them.hand, fresh] }),
              message: handFull
                ? `🔍 ${skill.nombre} (${name}): ${target.definition.nombre} se descarta, la mano de ${s.names[foe]} está llena (-${coste}⚡)`
                : `🔍 ${skill.nombre} (${name}): ${target.definition.nombre} vuelve a la mano de ${s.names[foe]} (-${coste}⚡)`,
            },
          };
        }
        case 'APLICAR_ESTADO':
        case 'CURAR_CORDURA': {
          if (skill.objetivo !== 'carta_aliada' || !targetId) return reject(s, 'Objetivo no válido');
          if (!fromHand && targetId === card.instanceId) return reject(s, 'Elige otra carta aliada');
          const myTable = paid.sides[side].table;
          const idx = myTable.findIndex((c) => c?.instanceId === targetId);
          if (idx < 0) return reject(s, 'Objetivo no válido');
          const target = myTable[idx]!;
          let updated: EngineCard;
          let message: string;
          if (skill.accionTipo === 'APLICAR_ESTADO') {
            if (!skill.efectoTipo) return reject(s, 'Habilidad no válida');
            const efecto: Effect = { tipo: skill.efectoTipo, valor: potencia, turnosRestantes: duracion || 1 };
            updated = { ...target, efectosActivos: [...target.efectosActivos, efecto] };
            message = `🤝 ${skill.nombre} (${name}): ${target.definition.nombre} +${potencia} por ${duracion || 1} turno(s). (-${coste}⚡)`;
          } else {
            const cordura = Math.min(target.definition.corduraMax ?? 0, target.cordura + potencia);
            updated = { ...target, cordura };
            message = `☕ ${skill.nombre} (${name}): ${target.definition.nombre} recupera ${potencia} cordura (-${coste}⚡)`;
          }
          const table = [...myTable];
          table[idx] = updated;
          return { state: { ...withSide(paid, side, { table }), message } };
        }
        default:
          return reject(s, 'Habilidad no válida');
      }
    }

    case 'END_TURN': {
      const next = foe;
      const nextSide = s.sides[next];
      const roundTurns = s.roundTurns + 1;
      // Effects belong to the side that cast them and expire at the end of that side's turn
      let state = withSide(s, side, { table: tickEfectos(me.table).map((c) => (c ? { ...c, disponible: true } : null)) });

      if (roundTurns >= MAX_ROUND_TURNS) {
        const dmg = { [side]: me.damage, [foe]: them.damage } as Record<Side, number>;
        const winner: Side = dmg[side] === dmg[foe] ? other(s.roundStarter) : dmg[side] > dmg[foe] ? side : foe;
        return {
          state: endRound(
            { ...state, roundTurns, isFirstTurn: false },
            winner,
            `⏱️ Límite de turnos: ${s.names[winner]} gana la ronda por daño (${dmg.p1}-${dmg.p2})`,
          ),
        };
      }

      const bonus = s.lastAttacker === next ? ENERGY_BONUS_HIT : 0;
      const gain = ENERGY_PER_TURN + bonus;
      const energy = Math.min(MAX_ENERGY_CAP, nextSide.energy + gain);
      const handFull = nextSide.hand.length >= MAX_HAND_SIZE;
      const canDraw = nextSide.deck.length > 0 && !handFull;
      state = withSide(state, next, {
        table: nextSide.table.map((c) => (c ? { ...c, disponible: true } : null)),
        hand: canDraw ? [...nextSide.hand, nextSide.deck[0]] : nextSide.hand,
        deck: canDraw ? nextSide.deck.slice(1) : nextSide.deck,
        energy,
        turnCount: nextSide.turnCount + 1,
      });
      return {
        state: {
          ...state,
          turn: next,
          roundTurns,
          isFirstTurn: false,
          // The last-hit bonus is paid once
          lastAttacker: bonus ? null : s.lastAttacker,
          message: `⏭️ ${name} termina su turno — turno de ${s.names[next]} (+${gain}⚡${bonus ? ' con bonus' : ''})${handFull ? ' · mano llena, no roba' : ''}`,
        },
      };
    }
  }
  return reject(s, 'Acción no válida');
}

export function replay(initial: MatchState, actions: MatchAction[]): MatchState {
  return actions.reduce((st, a) => applyAction(st, a).state, initial);
}

export function matchWinner(s: MatchState): Side | null {
  if (s.gamePhase !== 'game-over') return null;
  return s.sides.p1.score > s.sides.p2.score ? 'p1' : 'p2';
}

// ── Redacted view: what one player is allowed to see ─────────────────

export interface SideView {
  /** Only present for the viewer's own side. */
  hand: EngineCard[] | null;
  handCount: number;
  table: (EngineCard | null)[];
  deckCount: number;
  score: number;
  energy: number;
  maxEnergy: number;
  turnCount: number;
  damage: number;
}

export interface MatchView {
  you: Side;
  names: Record<Side, string>;
  sides: Record<Side, SideView>;
  bugComplexity: number;
  roundNumber: number;
  roundTurns: number;
  gamePhase: MatchPhase;
  turn: Side;
  lastAttacker: Side | null;
  isFirstTurn: boolean;
  message: string;
  lastAction: LastAction | null;
  turnStartedAt: number;
}

export function redactFor(s: MatchState, viewer: Side): MatchView {
  const sideView = (side: Side): SideView => {
    const st = s.sides[side];
    return {
      hand: side === viewer ? st.hand : null,
      handCount: st.hand.length,
      table: st.table,
      deckCount: st.deck.length,
      score: st.score,
      energy: st.energy,
      maxEnergy: st.maxEnergy,
      turnCount: st.turnCount,
      damage: st.damage,
    };
  };
  return {
    you: viewer,
    names: s.names,
    sides: { p1: sideView('p1'), p2: sideView('p2') },
    bugComplexity: s.bugComplexity,
    roundNumber: s.roundNumber,
    roundTurns: s.roundTurns,
    gamePhase: s.gamePhase,
    turn: s.turn,
    lastAttacker: s.lastAttacker,
    isFirstTurn: s.isFirstTurn,
    message: s.message,
    lastAction: s.lastAction,
    turnStartedAt: s.turnStartedAt,
  };
}

const ACTION_TYPES = new Set<MatchAction['type']>(['PLACE_CARD', 'ATTACK_BUG', 'ATTACK_CARD', 'USE_SKILL', 'USE_CONSUMABLE', 'END_TURN', 'NEXT_ROUND']);

/** Builds a well-formed action from untrusted input; the side always comes from the authenticated user. */
export function parseAction(input: unknown, side: Side): MatchAction | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as MatchAction['type'];
  if (!ACTION_TYPES.has(type)) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 16 ? v : null);
  const optStr = (v: unknown) => (v === undefined || v === null ? undefined : str(v) ?? null);

  switch (type) {
    case 'PLACE_CARD': {
      const cardId = str(raw.cardId); const slot = int(raw.slot);
      return cardId !== null && slot !== null ? { type, side, cardId, slot } : null;
    }
    case 'ATTACK_BUG': {
      const cardId = str(raw.cardId);
      return cardId !== null ? { type, side, cardId } : null;
    }
    case 'ATTACK_CARD': {
      const attackerId = str(raw.attackerId); const targetId = str(raw.targetId);
      return attackerId !== null && targetId !== null ? { type, side, attackerId, targetId } : null;
    }
    case 'USE_SKILL': {
      const cardId = str(raw.cardId); const skillIndex = int(raw.skillIndex); const targetId = optStr(raw.targetId);
      return cardId !== null && skillIndex !== null && targetId !== null ? { type, side, cardId, skillIndex, targetId } : null;
    }
    case 'USE_CONSUMABLE': {
      const cardId = str(raw.cardId); const targetId = optStr(raw.targetId);
      return cardId !== null && targetId !== null ? { type, side, cardId, targetId } : null;
    }
    case 'END_TURN':
    case 'NEXT_ROUND':
      return { type, side };
  }
  return null;
}
