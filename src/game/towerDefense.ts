// Tower Defense mode: Bugs walk down lanes towards the player's PC and the cards placed on the board hit them.
// Pure and framework-free: the page calls `tick` on every animation frame. Rewards (gold) are granted
// server-side by public.claim_tower_defense_coins(), which must keep BUGS_PER_COIN in sync.

import type { CardTemplate, Skill } from '@/constants';

export const TD_LANES = 3;
export const TD_SLOTS_PER_LANE = 5;
/** Lane length in board units; the PC sits at x = 0 and Bugs spawn at x = TD_FIELD_LENGTH. */
export const TD_FIELD_LENGTH = 10;
export const TD_PC_MAX_HP = 10;
export const TD_STARTING_POINTS = 10;
/** Maximum cards on the board at once, so points can't buy an unbreakable wall. */
export const TD_MAX_TOWERS = 6;
export const TD_KILL_POINTS_MIN = 1;
export const TD_KILL_POINTS_MAX = 5;
/** Passive income: +1 point every this many seconds, so a bad streak of kill rolls can't lock the run. */
export const TD_INCOME_SECONDS = 3;
/** Every this many destroyed Bugs the player earns one coin (1 gold). */
export const BUGS_PER_COIN = 5;
/** Seconds between difficulty levels. */
export const TD_LEVEL_SECONDS = 20;
export const TD_CONSUMABLE_COOLDOWN = 8;
/** Distance at which a Bug reaches a card and starts chewing on it. */
const BITE_REACH = 0.45;
const BITE_INTERVAL = 1;
const SHOT_TTL = 0.18;
const POPUP_TTL = 0.9;

export type TDBugKind = 'nullpointer' | 'heisenbug' | 'legacy-code';

interface BugKindRule {
  hp: number;
  speed: number;
  bite: number;
  pcDamage: number;
  /** First difficulty level at which this Bug can appear. */
  minLevel: number;
  weight: number;
}

export const TD_BUG_KINDS: Record<TDBugKind, BugKindRule> = {
  nullpointer: { hp: 6, speed: 0.55, bite: 1, pcDamage: 1, minLevel: 0, weight: 6 },
  heisenbug: { hp: 4, speed: 0.95, bite: 1, pcDamage: 1, minLevel: 1, weight: 3 },
  'legacy-code': { hp: 16, speed: 0.32, bite: 2, pcDamage: 2, minLevel: 2, weight: 2 },
};

export interface TDTower {
  id: number;
  cardId: string;
  lane: number;
  slot: number;
  x: number;
  hp: number;
  maxHp: number;
  damage: number;
  /** Extra damage dealt every SPECIAL_EVERY shots by cards with a direct-damage skill. */
  special: number;
  interval: number;
  cooldown: number;
  shots: number;
}

export interface TDBug {
  id: number;
  kind: TDBugKind;
  lane: number;
  x: number;
  hp: number;
  maxHp: number;
  speed: number;
  bite: number;
  pcDamage: number;
  biteCooldown: number;
}

export interface TDShot {
  id: number;
  lane: number;
  fromX: number;
  toX: number;
  ttl: number;
  special: boolean;
}

export interface TDPopup {
  id: number;
  lane: number;
  x: number;
  text: string;
  ttl: number;
}

export interface TDState {
  time: number;
  level: number;
  pcHp: number;
  points: number;
  kills: number;
  spawnIn: number;
  towers: TDTower[];
  bugs: TDBug[];
  shots: TDShot[];
  popups: TDPopup[];
  /** cardId → seconds until a consumable can be used again. */
  cooldowns: Record<string, number>;
  nextId: number;
  over: boolean;
}

export type SkillLookup = Record<number, Pick<Skill, 'accionTipo'>>;

const SPECIAL_EVERY = 3;

/** Total direct-damage potency of a card's skills. */
function skillDamage(card: CardTemplate, skills: SkillLookup): number {
  return card.habilidades.reduce((acc, [id, potencia]) => (skills[id]?.accionTipo === 'DANIO_DIRECTO' ? acc + potencia : acc), 0);
}

/** Only cards that can damage Bugs are usable: attackers with potency, or consumables with a direct-damage skill. */
export function isTowerDefenseCard(card: CardTemplate, skills: SkillLookup): boolean {
  if (card.tipo === 'consumible') return skillDamage(card, skills) > 0;
  return (card.potencia ?? 0) > 0 && (card.corduraMax ?? 0) > 0;
}

/** Cost in points of placing/using a card. */
export function cardPointCost(card: CardTemplate): number {
  return 2 + card.coste * 2;
}

export function towerStats(card: CardTemplate, skills: SkillLookup) {
  return {
    damage: card.potencia ?? 0,
    special: skillDamage(card, skills),
    interval: 1.2 + 0.4 * (card.ataqueCoste ?? 1),
    hp: card.corduraMax ?? 1,
  };
}

export function consumableDamage(card: CardTemplate, skills: SkillLookup): number {
  return skillDamage(card, skills);
}

export const slotX = (slot: number) => slot + 0.5;

export function levelAt(time: number): number {
  return Math.floor(time / TD_LEVEL_SECONDS);
}

/** Seconds between spawns at a given level; shrinks every level down to a floor. */
export function spawnInterval(level: number): number {
  return Math.max(0.6, 4 * Math.pow(0.9, level));
}

export const coinsFor = (kills: number) => Math.floor(kills / BUGS_PER_COIN);

export function createTowerDefense(): TDState {
  return {
    time: 0,
    level: 0,
    pcHp: TD_PC_MAX_HP,
    points: TD_STARTING_POINTS,
    kills: 0,
    spawnIn: 4,
    towers: [],
    bugs: [],
    shots: [],
    popups: [],
    cooldowns: {},
    nextId: 1,
    over: false,
  };
}

export type TDError = 'gameOver' | 'notEnoughPoints' | 'notUsable' | 'slotTaken' | 'boardFull' | 'cooldown' | 'invalidTarget';

export type TDResult = { state: TDState; error?: TDError };

/** Places an attacker card on an empty slot. */
export function placeCard(s: TDState, card: CardTemplate, lane: number, slot: number, skills: SkillLookup): TDResult {
  if (s.over) return { state: s, error: 'gameOver' };
  if (card.tipo === 'consumible' || !isTowerDefenseCard(card, skills)) return { state: s, error: 'notUsable' };
  if (lane < 0 || lane >= TD_LANES || slot < 0 || slot >= TD_SLOTS_PER_LANE) return { state: s, error: 'invalidTarget' };
  if (s.towers.some((t) => t.lane === lane && t.slot === slot)) return { state: s, error: 'slotTaken' };
  if (s.towers.length >= TD_MAX_TOWERS) return { state: s, error: 'boardFull' };
  const cost = cardPointCost(card);
  if (s.points < cost) return { state: s, error: 'notEnoughPoints' };
  const stats = towerStats(card, skills);
  const tower: TDTower = {
    id: s.nextId,
    cardId: card.id,
    lane,
    slot,
    x: slotX(slot),
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    special: stats.special,
    interval: stats.interval,
    cooldown: 0.3,
    shots: 0,
  };
  return { state: { ...s, points: s.points - cost, towers: [...s.towers, tower], nextId: s.nextId + 1 } };
}

/** Uses a direct-damage consumable on a whole lane. */
export function fireConsumable(s: TDState, card: CardTemplate, lane: number, skills: SkillLookup, random: () => number = Math.random): TDResult {
  if (s.over) return { state: s, error: 'gameOver' };
  if (card.tipo !== 'consumible' || !isTowerDefenseCard(card, skills)) return { state: s, error: 'notUsable' };
  if (lane < 0 || lane >= TD_LANES) return { state: s, error: 'invalidTarget' };
  if ((s.cooldowns[card.id] ?? 0) > 0) return { state: s, error: 'cooldown' };
  const cost = cardPointCost(card);
  if (s.points < cost) return { state: s, error: 'notEnoughPoints' };
  const dmg = consumableDamage(card, skills);
  let next: TDState = {
    ...s,
    points: s.points - cost,
    cooldowns: { ...s.cooldowns, [card.id]: TD_CONSUMABLE_COOLDOWN },
    bugs: s.bugs.map((b) => (b.lane === lane ? { ...b, hp: b.hp - dmg } : b)),
    shots: [...s.shots, { id: s.nextId, lane, fromX: 0, toX: TD_FIELD_LENGTH, ttl: SHOT_TTL * 2, special: true }],
    nextId: s.nextId + 1,
  };
  next = collectDeadBugs(next, random);
  return { state: next };
}

function pickBugKind(level: number, random: () => number): TDBugKind {
  const kinds = (Object.keys(TD_BUG_KINDS) as TDBugKind[]).filter((k) => TD_BUG_KINDS[k].minLevel <= level);
  const total = kinds.reduce((acc, k) => acc + TD_BUG_KINDS[k].weight, 0);
  let roll = random() * total;
  for (const k of kinds) {
    roll -= TD_BUG_KINDS[k].weight;
    if (roll < 0) return k;
  }
  return kinds[kinds.length - 1];
}

/** Bug HP multiplier: grows faster than linearly so long runs always end. */
export const hpScale = (level: number) => 1 + 0.25 * level + 0.045 * level * level;

/** Builds a Bug scaled to the difficulty level: more HP, speed and bite every level. */
export function spawnBug(kind: TDBugKind, lane: number, level: number, id: number): TDBug {
  const rule = TD_BUG_KINDS[kind];
  const hp = Math.round(rule.hp * hpScale(level));
  return {
    id,
    kind,
    lane,
    x: TD_FIELD_LENGTH,
    hp,
    maxHp: hp,
    speed: rule.speed * Math.min(2, 1 + 0.05 * level),
    bite: rule.bite + Math.floor(level / 4),
    pcDamage: rule.pcDamage,
    biteCooldown: 0,
  };
}

export const killReward = (random: () => number) =>
  TD_KILL_POINTS_MIN + Math.floor(random() * (TD_KILL_POINTS_MAX - TD_KILL_POINTS_MIN + 1));

function collectDeadBugs(s: TDState, random: () => number): TDState {
  const dead = s.bugs.filter((b) => b.hp <= 0);
  if (dead.length === 0) return s;
  let points = s.points;
  let nextId = s.nextId;
  const popups = [...s.popups];
  for (const b of dead) {
    const reward = killReward(random);
    points += reward;
    popups.push({ id: nextId++, lane: b.lane, x: b.x, text: `+${reward}⭐`, ttl: POPUP_TTL });
  }
  return { ...s, points, nextId, popups, kills: s.kills + dead.length, bugs: s.bugs.filter((b) => b.hp > 0) };
}

/** Advances the simulation by `dt` seconds. */
export function tick(state: TDState, dt: number, random: () => number = Math.random): TDState {
  if (state.over || dt <= 0) return state;
  let nextId = state.nextId;
  const time = state.time + dt;
  const level = levelAt(time);

  const cooldowns: Record<string, number> = {};
  for (const [id, cd] of Object.entries(state.cooldowns)) if (cd - dt > 0) cooldowns[id] = cd - dt;

  // Spawning: higher levels sometimes send a pack of Bugs at once
  const bugs = state.bugs.map((b) => ({ ...b }));
  const income = Math.floor(time / TD_INCOME_SECONDS) - Math.floor(state.time / TD_INCOME_SECONDS);
  let spawnIn = state.spawnIn - dt;
  while (spawnIn <= 0) {
    const pack = 1 + (level >= 3 && random() < Math.min(0.5, 0.08 * level) ? 1 : 0);
    for (let i = 0; i < pack; i++) {
      bugs.push(spawnBug(pickBugKind(level, random), Math.floor(random() * TD_LANES), level, nextId++));
    }
    spawnIn += spawnInterval(level);
  }

  const towers = state.towers.map((t) => ({ ...t }));

  // Bugs move left, or chew the first card they reach
  let pcHp = state.pcHp;
  const popups = state.popups.map((p) => ({ ...p, ttl: p.ttl - dt })).filter((p) => p.ttl > 0);
  const walking: TDBug[] = [];
  for (const b of bugs) {
    const blocker = towers
      .filter((t) => t.lane === b.lane && t.hp > 0 && b.x >= t.x && b.x - t.x <= BITE_REACH)
      .sort((a, c) => c.x - a.x)[0];
    if (blocker) {
      b.biteCooldown -= dt;
      if (b.biteCooldown <= 0) {
        blocker.hp -= b.bite;
        b.biteCooldown += BITE_INTERVAL;
      }
    } else {
      b.x -= b.speed * dt;
      b.biteCooldown = Math.max(0, b.biteCooldown - dt);
    }
    if (b.x <= 0) {
      pcHp -= b.pcDamage;
      popups.push({ id: nextId++, lane: b.lane, x: 0, text: `-${b.pcDamage}❤️`, ttl: POPUP_TTL });
    } else {
      walking.push(b);
    }
  }
  const aliveTowers = towers.filter((t) => t.hp > 0);

  // Cards fire at the closest Bug in their lane in front of them
  const shots = state.shots.map((sh) => ({ ...sh, ttl: sh.ttl - dt })).filter((sh) => sh.ttl > 0);
  for (const t of aliveTowers) {
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const target = walking
      .filter((b) => b.lane === t.lane && b.hp > 0 && b.x >= t.x - 0.1)
      .sort((a, c) => a.x - c.x)[0];
    if (!target) {
      t.cooldown = 0;
      continue;
    }
    t.shots += 1;
    const special = t.special > 0 && t.shots % SPECIAL_EVERY === 0;
    target.hp -= t.damage + (special ? t.special : 0);
    t.cooldown += t.interval;
    shots.push({ id: nextId++, lane: t.lane, fromX: t.x, toX: target.x, ttl: SHOT_TTL, special });
  }

  const next = collectDeadBugs(
    { ...state, time, level, spawnIn, bugs: walking, towers: aliveTowers, shots, popups, cooldowns, nextId, pcHp: Math.max(0, pcHp), points: state.points + income },
    random,
  );
  return pcHp <= 0 ? { ...next, over: true } : next;
}
