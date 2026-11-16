// Bot-vs-bot balance simulation. Usage: npm run sim -- [games]
import {
  applyAction,
  initMatch,
  matchWinner,
  mulberry32,
  other,
  type MatchState,
  type Side,
} from '../supabase/functions/_shared/engine';
import { botNextAction, randomBotDeck } from '../src/game/botAI';
import { BUILTIN_CARDS } from '../src/game/catalog';

const GAMES = Number((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 2000);
const SIDES: Side[] = ['p1', 'p2'];

interface RoundStat { bug: string; round: number; turns: number; starterWon: boolean; byLimit: boolean; winnerDmg: number; loserDmg: number }

const rounds: RoundStat[] = [];
const cards = new Map<string, { rounds: number; wins: number; uses: number; drawn: number; drawnWins: number }>();
const dmgByOwnTurn: number[][] = [];
let leftover = 0, endTurns = 0, cappedTurns = 0, counterKills = 0, matchesR1Decides = 0, matches = 0;

for (let seed = 1; seed <= GAMES; seed++) {
  let s: MatchState = initMatch(seed, { p1: randomBotDeck(BUILTIN_CARDS, mulberry32(seed * 2 + 1)), p2: randomBotDeck(BUILTIN_CARDS, mulberry32(seed * 2 + 2)) }, { p1: 'A', p2: 'B' }, BUILTIN_CARDS);
  let played: Record<Side, Map<string, number>> = { p1: new Map(), p2: new Map() };
  let seen: Record<Side, Set<string>> = { p1: new Set(), p2: new Set() };
  let turnStartDmg = 0;
  let r1Winner: Side | null = null;

  for (let i = 0; i < 5000 && s.gamePhase !== 'game-over'; i++) {
    for (const side of SIDES) s.sides[side].hand.forEach((c) => seen[side].add(c.definition.id));
    const actor = s.gamePhase === 'round-end' ? 'p1' : s.turn;
    const action = botNextAction(s, actor);
    const prev = s;
    const result = applyAction(s, action);
    if (result.error) throw new Error(`Illegal bot action: ${result.error}`);
    s = result.state;

    if (action.type === 'NEXT_ROUND') { turnStartDmg = 0; continue; }
    if (action.type === 'END_TURN') {
      const me = prev.sides[actor];
      leftover += me.energy;
      endTurns++;
      if (me.energy + 3 >= me.maxEnergy) cappedTurns++;
      (dmgByOwnTurn[me.turnCount] ??= []).push(me.damage - turnStartDmg);
      if (s.msg?.key === 'bugCounterKill') counterKills++;
      turnStartDmg = s.sides[s.turn].damage;
    } else if (s.lastAction?.defId) {
      const m = played[actor];
      m.set(s.lastAction.defId, (m.get(s.lastAction.defId) ?? 0) + 1);
    }

    if (prev.gamePhase === 'playing' && s.gamePhase !== 'playing') {
      const winner = s.lastAttacker!;
      const loser = other(winner);
      const byLimit = s.bug.hp > 0;
      rounds.push({
        bug: prev.bug.id,
        round: prev.roundNumber,
        turns: byLimit ? s.roundTurns : prev.roundTurns + 1,
        starterWon: winner === prev.roundStarter,
        byLimit,
        winnerDmg: s.sides[winner].damage,
        loserDmg: s.sides[loser].damage,
      });
      const stat = (id: string) => {
        const c = cards.get(id) ?? { rounds: 0, wins: 0, uses: 0, drawn: 0, drawnWins: 0 };
        cards.set(id, c);
        return c;
      };
      for (const side of SIDES) {
        for (const [id, uses] of played[side]) {
          const c = stat(id);
          c.rounds++; c.uses += uses; if (side === winner) c.wins++;
        }
        for (const id of seen[side]) {
          const c = stat(id);
          c.drawn++; if (side === winner) c.drawnWins++;
        }
      }
      played = { p1: new Map(), p2: new Map() };
      seen = { p1: new Set(), p2: new Set() };
      if (prev.roundNumber === 1) r1Winner = winner;
    }
  }
  matches++;
  if (matchWinner(s) === r1Winner) matchesR1Decides++;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fx = (x: number) => x.toFixed(2);

/** Match win rate of a careful bot (respects the rival's kill range) against a careless one, swapping seats. */
function skillEdge(games: number): number {
  let wins = 0;
  for (let seed = 1; seed <= games; seed++) {
    const careful: Side = seed % 2 ? 'p1' : 'p2';
    let s = initMatch(seed + 100000, { p1: randomBotDeck(BUILTIN_CARDS, mulberry32(seed * 3)), p2: randomBotDeck(BUILTIN_CARDS, mulberry32(seed * 3 + 1)) }, { p1: 'A', p2: 'B' }, BUILTIN_CARDS);
    for (let i = 0; i < 5000 && s.gamePhase !== 'game-over'; i++) {
      const actor = s.gamePhase === 'round-end' ? 'p1' : s.turn;
      s = applyAction(s, botNextAction(s, actor, { careful: actor === careful })).state;
    }
    if (matchWinner(s) === careful) wins++;
  }
  return wins / games;
}

console.log(`\n== ${GAMES} partidas bot vs bot, ${rounds.length} rondas ==\n`);
console.table({
  'Gana la ronda quien empieza': pct(avg(rounds.map((r) => +r.starterWon))),
  'Ganador de R1 gana la partida': pct(matchesR1Decides / matches),
  'Rondas por límite de turnos': pct(avg(rounds.map((r) => +r.byLimit))),
  'Turnos por ronda (ambos)': fx(avg(rounds.map((r) => r.turns))),
  'Daño ganador / perdedor': `${fx(avg(rounds.map((r) => r.winnerDmg)))} / ${fx(avg(rounds.map((r) => r.loserDmg)))}`,
  'Energía sobrante al pasar': fx(leftover / endTurns),
  'Turnos rozando el tope (≥7⚡ al pasar)': pct(cappedTurns / endTurns),
  'Cartas destruidas por contraataque / ronda': fx(counterKills / rounds.length),
  'Bot prudente vs impaciente (partidas)': pct(skillEdge(Math.min(GAMES, 1000))),
});

console.log('\n-- Por Bug --');
console.table(Object.fromEntries([...new Set(rounds.map((r) => r.bug))].map((bug) => {
  const rs = rounds.filter((r) => r.bug === bug);
  return [bug, {
    rondas: rs.length,
    turnos: fx(avg(rs.map((r) => r.turns))),
    'gana quien empieza': pct(avg(rs.map((r) => +r.starterWon))),
    'por límite': pct(avg(rs.map((r) => +r.byLimit))),
  }];
})));

console.log('\n-- Daño medio al Bug según el turno propio (1 = primer turno del jugador) --');
const byTurn: Record<number, { daño: string; muestras: number }> = {};
for (let t = 1; t < Math.min(dmgByOwnTurn.length, 9); t++) {
  const xs = dmgByOwnTurn[t] ?? [];
  byTurn[t] = { daño: fx(avg(xs)), muestras: xs.length };
}
console.table(byTurn);

console.log('\n-- Cartas: % de rondas ganadas cuando se roban y cuando se usan (50% = neutra) --');
console.table(Object.fromEntries([...cards].sort((a, b) => b[1].drawnWins / b[1].drawn - a[1].drawnWins / a[1].drawn).map(([id, c]) => [id, {
  'winrate robada': pct(c.drawnWins / c.drawn),
  'winrate usada': pct(c.wins / Math.max(1, c.rounds)),
  'usos/ronda': fx(c.uses / Math.max(1, c.rounds)),
  rondas: c.drawn,
}])));
