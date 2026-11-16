// Tower Defense balance simulation with a greedy bot. Usage: npm run sim:td -- [games]
import { CARD_DEFINITIONS, SKILLS, type CardTemplate } from '../src/constants';
import { mulberry32 } from '../supabase/functions/_shared/engine';
import {
  TD_LANES,
  TD_MAX_TOWERS,
  TD_SLOTS_PER_LANE,
  cardPointCost,
  coinsFor,
  createTowerDefense,
  fireConsumable,
  isTowerDefenseCard,
  placeCard,
  tick,
  towerStats,
  type TDState,
} from '../src/game/towerDefense';

const GAMES = Number((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 100);
const DT = 0.1;
const MAX_TIME = 60 * 60;

const PALETTE = CARD_DEFINITIONS.filter((c) => isTowerDefenseCard(c, SKILLS));
const towers = PALETTE.filter((c) => c.tipo !== 'consumible');
const consumables = PALETTE.filter((c) => c.tipo === 'consumible');
const value = (c: CardTemplate) => {
  const st = towerStats(c, SKILLS);
  return ((st.damage + st.special / 3) / st.interval) * (1 + st.hp / 4);
};

/** Greedy bot: holds the lane under most pressure, saves for the best value card it can reach. */
function botAct(s: TDState, random: () => number): TDState {
  for (const c of consumables) {
    if (s.points < cardPointCost(c) + 6) continue;
    for (let lane = 0; lane < TD_LANES; lane++) {
      const hp = s.bugs.filter((b) => b.lane === lane).reduce((a, b) => a + b.hp, 0);
      if (hp >= 15) {
        const r = fireConsumable(s, c, lane, SKILLS, random);
        if (!r.error) return r.state;
      }
    }
  }
  const pressure = (lane: number) =>
    s.bugs.filter((b) => b.lane === lane).reduce((a, b) => a + b.hp / Math.max(0.5, b.x), 0) -
    s.towers.filter((t) => t.lane === lane).reduce((a, t) => a + t.damage / t.interval, 0) * 0.5;
  const lanes = [...Array(TD_LANES).keys()].sort((a, b) => pressure(b) - pressure(a));
  const affordable = towers.filter((c) => cardPointCost(c) <= s.points).sort((a, b) => value(b) - value(a));
  if (affordable.length === 0 || s.towers.length >= TD_MAX_TOWERS) return s;
  const best = [...towers].sort((a, b) => value(b) - value(a))[0];
  // Save up for the best card unless a lane is in danger
  const danger = s.bugs.some((b) => b.x < 4);
  const pick = !danger && affordable[0] !== best && s.points < cardPointCost(best) ? null : affordable[0];
  if (!pick) return s;
  for (const lane of lanes) {
    for (let slot = 0; slot < TD_SLOTS_PER_LANE; slot++) {
      const r = placeCard(s, pick, lane, slot, SKILLS);
      if (!r.error) return r.state;
    }
  }
  return s;
}

interface Result { time: number; level: number; kills: number; coins: number; towers: number; placed: number; unspent: number; earned: number }
const results: Result[] = [];

for (let seed = 1; seed <= GAMES; seed++) {
  const random = mulberry32(seed);
  let s = createTowerDefense();
  let placed = 0, earned = 0;
  while (!s.over && s.time < MAX_TIME) {
    const before = s.towers.length;
    const prevPoints = s.points;
    s = tick(s, DT, random);
    if (s.points > prevPoints) earned += s.points - prevPoints;
    s = botAct(s, random);
    if (s.towers.length > before) placed++;
  }
  results.push({ time: s.time, level: s.level + 1, kills: s.kills, coins: coinsFor(s.kills), towers: s.towers.length, placed, unspent: s.points, earned });
}

const stat = (k: keyof Result) => {
  const v = results.map((r) => r[k]).sort((a, b) => a - b);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  return `${k.padEnd(8)} avg ${avg.toFixed(1).padStart(7)}  min ${v[0].toFixed(0).padStart(5)}  p50 ${v[Math.floor(v.length / 2)].toFixed(0).padStart(5)}  max ${v[v.length - 1].toFixed(0).padStart(5)}`;
};
console.log(`${GAMES} games (survived the ${MAX_TIME / 60} min cap: ${results.filter((r) => r.time >= MAX_TIME).length})`);
const early = results.filter((r) => r.time < 90).length;
const coinsPerMin = results.reduce((a, r) => a + r.coins, 0) / (results.reduce((a, r) => a + r.time, 0) / 60);
const ptsPerKill = results.reduce((a, r) => a + r.earned, 0) / Math.max(1, results.reduce((a, r) => a + r.kills, 0));
console.log(`died before 90 s: ${early}  ·  coins/min: ${coinsPerMin.toFixed(2)}  ·  points/kill: ${ptsPerKill.toFixed(2)}`);
for (const k of ['time', 'level', 'kills', 'coins', 'towers', 'placed', 'earned', 'unspent'] as const) console.log(stat(k));
