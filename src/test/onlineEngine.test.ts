import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, DECK_SIZE, MAX_COPIES, SKILLS } from '@/constants';
import {
  CARD_RULES,
  ENERGY_PER_TURN,
  MAX_HAND_SIZE,
  MAX_ROUND_TURNS,
  SKILL_RULES,
  applyAction,
  initMatch,
  matchWinner,
  mulberry32,
  other,
  parseAction,
  redactFor,
  replay,
  type EngineCard,
  type MatchAction,
  type MatchState,
  type Side,
} from '@/game/onlineEngine';
import { botNextAction, randomBotDeck } from '@/game/botAI';

const deckA = ['senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'junior-dev', 'intern', 'pr-aprobado', 'hotfix', 'qa-tester']
  .map((card_id) => ({ card_id, quantity: 2 }));
const deckB = ['qa-lead', 'qa-tester', 'senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'cafe-maquina', 'junior-dev', 'intern']
  .map((card_id) => ({ card_id, quantity: 2 }));
const names = { p1: 'Ana', p2: 'Beto' };

const start = (seed = 42, starter: Side = 'p1') => initMatch(seed, { p1: deckA, p2: deckB }, names, starter);

const card = (id: string, instanceId: string, patch: Partial<EngineCard> = {}): EngineCard => {
  const definition = CARD_RULES.find((c) => c.id === id)!;
  return { instanceId, definition, cordura: definition.corduraMax ?? 0, efectosActivos: [], disponible: true, ...patch };
};

const withTables = (s: MatchState, p1: (EngineCard | null)[], p2: (EngineCard | null)[]): MatchState => ({
  ...s,
  sides: {
    p1: { ...s.sides.p1, table: [...p1, null, null, null, null].slice(0, 4), energy: 10 },
    p2: { ...s.sides.p2, table: [...p2, null, null, null, null].slice(0, 4), energy: 10 },
  },
});

function candidateActions(s: MatchState): MatchAction[] {
  const side = s.turn;
  if (s.gamePhase === 'round-end') return [{ type: 'NEXT_ROUND', side }];
  const me = s.sides[side];
  const them = s.sides[other(side)];
  const out: MatchAction[] = [];
  me.hand.forEach((c) => {
    const slot = me.table.findIndex((t) => t === null);
    if (c.definition.tipo !== 'consumible' && slot >= 0) out.push({ type: 'PLACE_CARD', side, cardId: c.instanceId, slot });
    if (c.definition.tipo === 'consumible') {
      [undefined, ...me.table.map((t) => t?.instanceId), ...them.table.map((t) => t?.instanceId)]
        .forEach((targetId) => out.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId, targetId }));
    }
  });
  me.table.forEach((c) => {
    if (!c) return;
    out.push({ type: 'ATTACK_BUG', side, cardId: c.instanceId });
    them.table.forEach((t) => t && out.push({ type: 'ATTACK_CARD', side, attackerId: c.instanceId, targetId: t.instanceId }));
    c.definition.habilidades.forEach((h, skillIndex) => {
      const skill = SKILLS[h[0]];
      const pool = skill?.objetivo === 'carta_enemiga' ? them.table : me.table;
      [undefined, ...pool.map((t) => t?.instanceId)].forEach((targetId) =>
        out.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex, targetId }));
    });
  });
  out.push({ type: 'END_TURN', side });
  return out;
}

function playRandomGame(seed: number) {
  const rnd = mulberry32(seed * 7 + 1);
  let s = start(seed);
  const log: MatchAction[] = [];
  for (let i = 0; i < 5000 && s.gamePhase !== 'game-over'; i++) {
    const options = candidateActions(s).filter((a) => !applyAction(s, a).error);
    const a = options[Math.floor(rnd() * options.length)];
    s = applyAction(s, a).state;
    log.push(a);
  }
  return { final: s, log };
}

describe('onlineEngine', () => {
  it('deals identically for the same seed and differently for another', () => {
    expect(JSON.stringify(start(7))).toBe(JSON.stringify(start(7)));
    expect(JSON.stringify(start(7).sides)).not.toBe(JSON.stringify(start(8).sides));
  });

  it('gives every card instance a unique id across both sides', () => {
    const s = start();
    const ids = (['p1', 'p2'] as Side[]).flatMap((k) => [...s.sides[k].hand, ...s.sides[k].deck].map((c) => c.instanceId));
    expect(new Set(ids).size).toBe(40);
  });

  it('rejects actions out of turn without changing state', () => {
    const s = start();
    const r = applyAction(s, { type: 'END_TURN', side: 'p2' });
    expect(r.error).toBeTruthy();
    expect(r.state).toBe(s);
  });

  it('picks the first player from the seed', () => {
    const starters = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => initMatch(seed, { p1: deckA, p2: deckB }, names).turn));
    expect(starters).toEqual(new Set(['p1', 'p2']));
  });

  it('opens both first turns with the same energy; only the second player draws', () => {
    const s = start();
    expect(s.sides.p1.energy).toBe(ENERGY_PER_TURN);
    const handBefore = s.sides.p2.hand.length;
    const { state } = applyAction(s, { type: 'END_TURN', side: 'p1' });
    expect(state.turn).toBe('p2');
    expect(state.sides.p2.hand.length).toBe(handBefore + 1);
    expect(state.sides.p2.energy).toBe(ENERGY_PER_TURN);
  });

  it('caps energy and pays the hit bonus only once', () => {
    let s = withTables(start(), [card('mid-dev', 'a')], []);
    s = applyAction(s, { type: 'ATTACK_BUG', side: 'p1', cardId: 'a' }).state;
    s = { ...s, sides: { ...s.sides, p1: { ...s.sides.p1, energy: 0 } } };
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    expect(s.sides.p2.energy).toBe(10);
    s = applyAction(s, { type: 'END_TURN', side: 'p2' }).state;
    expect(s.sides.p1.energy).toBe(ENERGY_PER_TURN + 1);
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    s = applyAction(s, { type: 'END_TURN', side: 'p2' }).state;
    expect(s.sides.p1.energy).toBe(2 * ENERGY_PER_TURN + 1);
  });

  it('keeps the hit bonus even if the rival hits the Bug afterwards, and counts skill damage', () => {
    let s = withTables(start(), [card('devops', 'd')], [card('mid-dev', 'm')]);
    s = applyAction(s, { type: 'USE_SKILL', side: 'p1', cardId: 'd', skillIndex: 0 }).state;
    s = { ...s, sides: { ...s.sides, p1: { ...s.sides.p1, energy: 0 } } };
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    s = applyAction(s, { type: 'ATTACK_BUG', side: 'p2', cardId: 'm' }).state;
    s = applyAction(s, { type: 'END_TURN', side: 'p2' }).state;
    expect(s.sides.p1.energy).toBe(ENERGY_PER_TURN + 1);
    expect(s.sides.p2.hitBonus).toBe(1);
  });

  it('the Bug strikes back at the strongest card of whoever hit it that turn', () => {
    let s = withTables(start(), [card('junior-dev', 'j'), card('senior-dev', 'sr')], [card('mid-dev', 'm')]);
    s = applyAction(s, { type: 'ATTACK_BUG', side: 'p1', cardId: 'j' }).state;
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    expect(s.sides.p1.table[1]!.cordura).toBe(4 - s.bug.potencia);
    expect(s.sides.p1.table[0]!.cordura).toBe(2);
    expect(s.message).toMatch(/^🐛 .* · ⏭️ /);
    s = applyAction(s, { type: 'END_TURN', side: 'p2' }).state;
    expect(s.sides.p2.table[0]!.cordura).toBe(3);
  });

  it('the Bug counterattack can destroy a card', () => {
    let s = withTables(start(), [card('junior-dev', 'j', { cordura: 1 })], []);
    s = applyAction(s, { type: 'ATTACK_BUG', side: 'p1', cardId: 'j' }).state;
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    expect(s.sides.p1.table.every((c) => c === null)).toBe(true);
    expect(s.msg?.key).toBe('bugCounterKill');
  });

  it('expires a 1-turn buff at the end of its owner\'s turn, not the rival\'s', () => {
    let s = withTables(start(), [card('senior-dev', 'sr'), card('mid-dev', 'mid')], []);
    s = applyAction(s, { type: 'USE_SKILL', side: 'p1', cardId: 'sr', skillIndex: 0, targetId: 'mid' }).state;
    expect(s.sides.p1.table[1]!.efectosActivos).toHaveLength(1);
    s = applyAction(s, { type: 'END_TURN', side: 'p1' }).state;
    expect(s.sides.p1.table[1]!.efectosActivos).toHaveLength(0);
  });

  it('rejects a skill targeting its own card', () => {
    const s = withTables(start(), [card('senior-dev', 'sr'), card('mid-dev', 'mid')], []);
    expect(applyAction(s, { type: 'USE_SKILL', side: 'p1', cardId: 'sr', skillIndex: 0, targetId: 'sr' }).error).toBeTruthy();
  });

  it('returns bounced cards fresh, or discards them when the hand is full', () => {
    const hurt = card('mid-dev', 'm', { cordura: 1, efectosActivos: [{ tipo: 'buff_ataque', valor: 2, turnosRestantes: 1 }] });
    const s = withTables(start(), [card('qa-tester', 'qa')], [hurt]);
    const bounced = applyAction(s, { type: 'USE_SKILL', side: 'p1', cardId: 'qa', skillIndex: 0, targetId: 'm' }).state;
    const back = bounced.sides.p2.hand.find((c) => c.instanceId === 'm')!;
    expect(back.cordura).toBe(3);
    expect(back.efectosActivos).toEqual([]);

    const full = { ...s, sides: { ...s.sides, p2: { ...s.sides.p2, hand: Array.from({ length: MAX_HAND_SIZE }, (_, i) => card('intern', `h${i}`)) } } };
    const discarded = applyAction(full, { type: 'USE_SKILL', side: 'p1', cardId: 'qa', skillIndex: 0, targetId: 'm' }).state;
    expect(discarded.sides.p2.hand).toHaveLength(MAX_HAND_SIZE);
    expect(discarded.sides.p2.table.every((c) => c === null)).toBe(true);
  });

  it('decides a stalled round by damage at the turn limit', () => {
    let s = withTables(start(), [card('junior-dev', 'j')], []);
    s = applyAction(s, { type: 'ATTACK_BUG', side: 'p1', cardId: 'j' }).state;
    for (let i = 0; i < MAX_ROUND_TURNS && s.gamePhase === 'playing'; i++) {
      s = applyAction(s, { type: 'END_TURN', side: s.turn }).state;
    }
    expect(s.gamePhase).toBe('round-end');
    expect(s.sides.p1.score).toBe(1);
    expect(s.lastAttacker).toBe('p1');
  });

  it('lets either player open the next round, started by the round loser', () => {
    const s: MatchState = { ...start(), gamePhase: 'round-end', lastAttacker: 'p1', turn: 'p1' };
    const r = applyAction(s, { type: 'NEXT_ROUND', side: 'p2' });
    expect(r.error).toBeUndefined();
    expect(r.state.turn).toBe('p2');
    expect(r.state.sides.p1.energy).toBe(0);
    expect(r.state.sides.p2.energy).toBe(ENERGY_PER_TURN);
  });

  it('records the acting card and target of the last action', () => {
    const s = withTables(start(), [card('qa-tester', 'qa')], [card('mid-dev', 'm')]);
    const { state } = applyAction(s, { type: 'ATTACK_CARD', side: 'p1', attackerId: 'qa', targetId: 'm' });
    expect(state.lastAction).toEqual({ side: 'p1', type: 'ATTACK_CARD', cardId: 'qa', targetId: 'm', defId: 'qa-tester' });
  });

  it('builds legal bot decks', () => {
    for (let seed = 1; seed < 20; seed++) {
      const deck = randomBotDeck(mulberry32(seed));
      expect(deck.reduce((n, e) => n + e.quantity, 0)).toBe(DECK_SIZE);
      expect(Math.max(...deck.map((e) => e.quantity))).toBeLessThanOrEqual(MAX_COPIES);
    }
  });

  it.each([1, 2, 3])('bot vs bot game %i only plays legal actions and finishes', (seed) => {
    let s = initMatch(seed, { p1: randomBotDeck(mulberry32(seed)), p2: randomBotDeck(mulberry32(seed + 100)) }, names);
    for (let i = 0; i < 3000 && s.gamePhase !== 'game-over'; i++) {
      const r = applyAction(s, botNextAction(s, s.turn));
      expect(r.error).toBeUndefined();
      s = r.state;
    }
    expect(s.gamePhase).toBe('game-over');
  });

  it('the bot never places consumables and plays more than one action per turn when it can', () => {
    const s = withTables(start(), [card('mid-dev', 'a'), card('fullstack', 'b')], []);
    const withHand = { ...s, sides: { ...s.sides, p1: { ...s.sides.p1, hand: [card('hotfix', 'hf')] } } };
    let st = withHand;
    const types: string[] = [];
    for (let i = 0; i < 10 && st.turn === 'p1' && st.gamePhase === 'playing'; i++) {
      const a = botNextAction(st, 'p1');
      types.push(a.type);
      st = applyAction(st, a).state;
    }
    expect(types).not.toContain('PLACE_CARD');
    expect(types.filter((t) => t === 'ATTACK_BUG').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects placing a card without enough energy', () => {
    const s = start();
    const card = s.sides.p1.hand[0];
    const poor = { ...s, sides: { ...s.sides, p1: { ...s.sides.p1, energy: 0 } } };
    const r = applyAction(poor, { type: 'PLACE_CARD', side: 'p1', cardId: card.instanceId, slot: 0 });
    expect(r.error).toMatch(/Necesitas/);
  });

  it.each([1, 2, 3, 99, 12345])('random game %i ends and replays to the same state', (seed) => {
    const { final, log } = playRandomGame(seed);
    expect(final.gamePhase).toBe('game-over');
    expect(matchWinner(final)).not.toBeNull();
    expect(Math.max(final.sides.p1.score, final.sides.p2.score)).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(replay(start(seed), log))).toBe(JSON.stringify(final));
  });

  it('server card/skill rules match the client definitions', () => {
    const rulesOnly = CARD_DEFINITIONS.map(({ image: _i, audio: _a, gachaPeso: _g, ...rest }) => rest);
    expect(CARD_RULES).toEqual(rulesOnly);
    expect(SKILL_RULES).toEqual(SKILLS);
  });

  it('redacted view hides the rival hand and both deck orders', () => {
    const s = start();
    const v = redactFor(s, 'p1');
    expect(v.sides.p1.hand).toEqual(s.sides.p1.hand);
    expect(v.sides.p2.hand).toBeNull();
    expect(v.sides.p2.handCount).toBe(s.sides.p2.hand.length);
    const json = JSON.stringify(v);
    for (const card of [...s.sides.p2.hand, ...s.sides.p2.deck, ...s.sides.p1.deck]) {
      expect(json).not.toContain(`"${card.instanceId}"`);
    }
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('"deck"');
  });

  it('parseAction forces the authenticated side and rejects malformed input', () => {
    expect(parseAction({ type: 'END_TURN', side: 'p1' }, 'p2')).toEqual({ type: 'END_TURN', side: 'p2' });
    expect(parseAction({ type: 'PLACE_CARD', cardId: 'x', slot: 1 }, 'p1')).toEqual({ type: 'PLACE_CARD', side: 'p1', cardId: 'x', slot: 1 });
    expect(parseAction({ type: 'PLACE_CARD', cardId: 'x', slot: -1 }, 'p1')).toBeNull();
    expect(parseAction({ type: 'USE_SKILL', cardId: 'x', skillIndex: 0, targetId: 5 }, 'p1')).toBeNull();
    expect(parseAction({ type: 'DROP_TABLE' }, 'p1')).toBeNull();
    expect(parseAction('END_TURN', 'p1')).toBeNull();
  });
});
