import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, SKILLS } from '@/constants';
import {
  CARD_RULES,
  SKILL_RULES,
  applyAction,
  initMatch,
  matchWinner,
  mulberry32,
  other,
  parseAction,
  redactFor,
  replay,
  type MatchAction,
  type MatchState,
  type Side,
} from '@/game/onlineEngine';

const deckA = ['senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'junior-dev', 'intern', 'pr-aprobado', 'hotfix', 'qa-tester']
  .map((card_id) => ({ card_id, quantity: 2 }));
const deckB = ['qa-lead', 'qa-tester', 'senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'cafe-maquina', 'junior-dev', 'intern']
  .map((card_id) => ({ card_id, quantity: 2 }));
const names = { p1: 'Ana', p2: 'Beto' };

const start = (seed = 42) => initMatch(seed, { p1: deckA, p2: deckB }, names);

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

  it('passes the turn with a draw and energy gain', () => {
    const s = start();
    const handBefore = s.sides.p2.hand.length;
    const { state } = applyAction(s, { type: 'END_TURN', side: 'p1' });
    expect(state.turn).toBe('p2');
    expect(state.sides.p2.hand.length).toBe(handBefore + 1);
    expect(state.sides.p2.energy).toBe(6);
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
