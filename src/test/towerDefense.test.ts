import { describe, expect, it } from 'vitest';
import { CARD_DEFINITIONS, SKILLS, type CardTemplate } from '@/constants';
import {
  TD_FIELD_LENGTH,
  TD_INCOME_SECONDS,
  TD_KILL_POINTS_MAX,
  TD_KILL_POINTS_MIN,
  TD_LANES,
  TD_MAX_TOWERS,
  TD_STARTING_POINTS,
  cardPointCost,
  coinsFor,
  createTowerDefense,
  fireConsumable,
  isTowerDefenseCard,
  placeCard,
  spawnBug,
  spawnInterval,
  tick,
  type TDState,
} from '@/game/towerDefense';

const card = (id: string): CardTemplate => CARD_DEFINITIONS.find((c) => c.id === id)!;
/** No spawns: lets each test control the Bugs on the board. */
const quiet = (s: TDState): TDState => ({ ...s, spawnIn: 1e9 });

describe('tower defense', () => {
  it('only allows cards that damage Bugs', () => {
    expect(isTowerDefenseCard(card('senior-dev'), SKILLS)).toBe(true);
    expect(isTowerDefenseCard(card('qa-tester'), SKILLS)).toBe(true);
    expect(isTowerDefenseCard(card('hotfix'), SKILLS)).toBe(true);
    expect(isTowerDefenseCard(card('cafe-maquina'), SKILLS)).toBe(false);
    expect(isTowerDefenseCard(card('pr-aprobado'), SKILLS)).toBe(false);
    expect(placeCard(createTowerDefense(), card('cafe-maquina'), 0, 0, SKILLS).error).toBe('notUsable');
  });

  it('charges points to place a card and refuses taken slots or unaffordable cards', () => {
    const s = createTowerDefense();
    const r = placeCard(s, card('junior-dev'), 1, 2, SKILLS);
    expect(r.error).toBeUndefined();
    expect(r.state.points).toBe(TD_STARTING_POINTS - cardPointCost(card('junior-dev')));
    expect(placeCard(r.state, card('intern'), 1, 2, SKILLS).error).toBe('slotTaken');
    expect(placeCard({ ...s, points: 0 }, card('intern'), 0, 0, SKILLS).error).toBe('notEnoughPoints');
  });

  it('cards shoot Bugs in their lane and each kill gives 1-5 points', () => {
    let s = quiet(placeCard(createTowerDefense(), card('senior-dev'), 0, 0, SKILLS).state);
    const bug = { ...spawnBug('nullpointer', 0, 0, 999), x: 5, hp: 1, maxHp: 1, speed: 0 };
    const other = { ...spawnBug('nullpointer', 1, 0, 998), x: 5, speed: 0 };
    s = { ...s, bugs: [bug, other] };
    const before = s.points;
    s = tick(s, 0.5, () => 0.99);
    expect(s.kills).toBe(1);
    expect(s.bugs.map((b) => b.id)).toEqual([998]);
    expect(s.points - before).toBe(TD_KILL_POINTS_MAX);

    const low = tick({ ...s, bugs: [{ ...bug, id: 997 }] }, 2, () => 0);
    expect(low.points - s.points).toBe(TD_KILL_POINTS_MIN);
  });

  it('earns a coin every 5 destroyed Bugs', () => {
    expect([0, 4, 5, 9, 10, 23].map(coinsFor)).toEqual([0, 0, 1, 1, 2, 4]);
  });

  it('caps the cards on the board', () => {
    let s = { ...createTowerDefense(), points: 1000 };
    for (let i = 0; i < TD_MAX_TOWERS; i++) s = placeCard(s, card('intern'), i % TD_LANES, Math.floor(i / TD_LANES), SKILLS).state;
    expect(s.towers).toHaveLength(TD_MAX_TOWERS);
    expect(placeCard(s, card('intern'), 2, 4, SKILLS).error).toBe('boardFull');
  });

  it('gives passive points over time even without kills', () => {
    const s = tick(quiet(createTowerDefense()), TD_INCOME_SECONDS * 2 + 0.01);
    expect(s.points).toBe(TD_STARTING_POINTS + 2);
  });

  it('damages the PC when a Bug gets through and ends the game at 0', () => {
    const bug = { ...spawnBug('legacy-code', 2, 0, 1), x: 0.05 };
    let s = tick(quiet({ ...createTowerDefense(), bugs: [bug] }), 0.5);
    expect(s.pcHp).toBe(10 - bug.pcDamage);
    expect(s.bugs).toHaveLength(0);
    s = tick({ ...s, pcHp: 1, bugs: [bug] }, 0.5);
    expect(s.over).toBe(true);
  });

  it('Bugs chew the card blocking their way', () => {
    let s = quiet(placeCard(createTowerDefense(), card('intern'), 0, 4, SKILLS).state);
    const tower = s.towers[0];
    s = { ...s, towers: [{ ...tower, damage: 0 }], bugs: [{ ...spawnBug('legacy-code', 0, 0, 50), x: tower.x + 0.1 }] };
    s = tick(s, 0.1);
    expect(s.bugs[0].x).toBeCloseTo(tower.x + 0.1);
    expect(s.towers).toHaveLength(0);
  });

  it('consumables hit every Bug in a lane and then recharge', () => {
    const hotfix = card('hotfix');
    const s = { ...createTowerDefense(), points: 50, bugs: [spawnBug('nullpointer', 1, 0, 1), spawnBug('nullpointer', 1, 0, 2), spawnBug('nullpointer', 0, 0, 3)] };
    const r = fireConsumable(s, hotfix, 1, SKILLS);
    expect(r.state.bugs.filter((b) => b.lane === 1).every((b) => b.hp === b.maxHp - 2)).toBe(true);
    expect(r.state.bugs.find((b) => b.lane === 0)!.hp).toBe(r.state.bugs.find((b) => b.lane === 0)!.maxHp);
    expect(fireConsumable(r.state, hotfix, 1, SKILLS).error).toBe('cooldown');
  });

  it('gets harder over time', () => {
    expect(spawnInterval(5)).toBeLessThan(spawnInterval(0));
    const early = spawnBug('nullpointer', 0, 0, 1);
    const late = spawnBug('nullpointer', 0, 6, 2);
    expect(late.maxHp).toBeGreaterThan(early.maxHp);
    expect(late.speed).toBeGreaterThan(early.speed);
    expect(late.x).toBe(TD_FIELD_LENGTH);

    let s = createTowerDefense();
    for (let i = 0; i < 450; i++) s = { ...tick(s, 0.1, () => 0.5), pcHp: 10 };
    expect(s.level).toBe(2);
  });
});
