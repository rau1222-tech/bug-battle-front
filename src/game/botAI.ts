import {
  MAX_ENERGY_CAP,
  MAX_ROUND_TURNS,
  SKILL_RULES,
  applyAction,
  nextTurnGain,
  other,
  potenciaReal,
  type CardCatalog,
  type DeckEntry,
  type EngineCard,
  type MatchAction,
  type MatchState,
  type Side,
} from './onlineEngine';
import { DECK_SIZE, MAX_COPIES } from '@/constants';

const isCard = (c: EngineCard | null): c is EngineCard => c !== null;
/** Programmer copies in a bot deck; the rest is random support. */
const BOT_PROGRAMMER_SLOTS = 14;

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Balanced random deck for the bot from the playable catalog: mostly programmers, the rest random support cards. */
export function randomBotDeck(catalog: CardCatalog, random: () => number = Math.random): DeckEntry[] {
  const cards = Object.values(catalog);
  const copies = (tipo: (t: string) => boolean) => cards.filter((c) => tipo(c.tipo)).flatMap((c) => Array<string>(MAX_COPIES).fill(c.id));
  const programmers = shuffle(copies((t) => t === 'programador'), random).slice(0, BOT_PROGRAMMER_SLOTS);
  const support = shuffle(copies((t) => t !== 'programador'), random);
  const ids = [...programmers, ...support].slice(0, DECK_SIZE);
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  return [...counts].map(([card_id, quantity]) => ({ card_id, quantity }));
}

/** Greedy bot: returns the first legal action from a priority list, falling back to ending the turn. */
export function botNextAction(s: MatchState, side: Side, { careful = true } = {}): MatchAction {
  if (s.gamePhase === 'round-end') return { type: 'NEXT_ROUND', side };
  const me = s.sides[side];
  const them = s.sides[other(side)];
  const hp = s.bug.hp;
  const mine = me.table.filter(isCard);
  const ready = mine.filter((c) => c.disponible);
  const attackers = ready
    .filter((c) => c.definition.tipo === 'programador' && potenciaReal(c) > 0)
    .sort((a, b) => potenciaReal(b) - potenciaReal(a));
  const foes = them.table.filter(isCard);
  const skillOf = (c: EngineCard, i: number) => SKILL_RULES[c.definition.habilidades[i]?.[0]];
  const consumables = me.hand.filter((c) => c.definition.tipo === 'consumible');
  const candidates: MatchAction[] = [];

  // Kill range: what each side can deal to the Bug (the rival's hand is hidden, so only its board counts)
  const myBurst = maxBugDamage([...ready, ...consumables], me.energy);
  const foeEnergy = Math.min(MAX_ENERGY_CAP, them.energy + nextTurnGain(s, other(side)));
  const foeBurst = maxBugDamage(foes, foeEnergy);
  const goForKill = myBurst >= hp;
  // Late in the round the turn limit decides on damage, so stop holding back
  const late = s.roundTurns >= MAX_ROUND_TURNS - 6;
  /** Dealing `dmg` is fine if it kills, the Bug is already in the rival's range, or it stays out of it. */
  const safe = (dmg: number) => !careful || goForKill || late || hp <= foeBurst || hp - dmg > foeBurst;

  // 1. Finish the Bug if possible
  attackers.filter((c) => potenciaReal(c) >= hp).forEach((c) => candidates.push({ type: 'ATTACK_BUG', side, cardId: c.instanceId }));
  ready.forEach((c) => c.definition.habilidades.forEach(([, pot], i) => {
    if (skillOf(c, i)?.accionTipo === 'DANIO_DIRECTO' && pot >= hp) candidates.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i });
  }));
  consumables.forEach((c) => {
    const [, pot] = c.definition.habilidades[0] ?? [];
    if (skillOf(c, 0)?.accionTipo === 'DANIO_DIRECTO' && pot >= hp) candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId });
  });

  const best = attackers[0];
  const buffs: MatchAction[] = [];
  if (best) {
    const attackCost = best.definition.ataqueCoste ?? 0;
    ready.filter((c) => c.instanceId !== best.instanceId).forEach((c) => c.definition.habilidades.forEach(([, pot, cost, dur], i) => {
      const ownAttack = c.definition.tipo === 'programador' ? potenciaReal(c) : 0;
      const worthIt = pot * Math.max(1, dur) > ownAttack || (goForKill && pot >= ownAttack);
      if (skillOf(c, i)?.accionTipo === 'APLICAR_ESTADO' && worthIt && me.energy >= cost + attackCost && safe(potenciaReal(best) + pot)) {
        buffs.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i, targetId: best.instanceId });
      }
    }));
    consumables.forEach((c) => {
      const [, pot, cost] = c.definition.habilidades[0] ?? [0, 0, 0];
      if (skillOf(c, 0)?.accionTipo === 'APLICAR_ESTADO' && me.energy >= cost + attackCost && safe(potenciaReal(best) + pot)) {
        buffs.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId, targetId: best.instanceId });
      }
    });
  }
  const directDamage = (filter: (pot: number, c: EngineCard) => boolean) => {
    ready.forEach((c) => c.definition.habilidades.forEach(([, pot], i) => {
      if (skillOf(c, i)?.accionTipo === 'DANIO_DIRECTO' && filter(pot, c) && safe(pot)) {
        candidates.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i });
      }
    }));
  };
  const attacks = attackers.filter((c) => safe(potenciaReal(c))).map((c): MatchAction => ({ type: 'ATTACK_BUG', side, cardId: c.instanceId }));

  // 2. Lethal this turn: buffs first, then every source of damage
  if (goForKill) {
    candidates.push(...buffs);
    directDamage((pot, c) => pot > potenciaReal(c));
    candidates.push(...attacks);
    consumables.forEach((c) => {
      if (skillOf(c, 0)?.accionTipo === 'DANIO_DIRECTO') candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId });
    });
  }

  // 3. Develop the board, keeping enough energy for the attackers already on it
  const slot = me.table.findIndex((t) => t === null);
  if (slot >= 0) {
    const reserve = attackers.filter((c) => safe(potenciaReal(c))).reduce((acc, c) => acc + (c.definition.ataqueCoste ?? 0), 0);
    me.hand
      .filter((c) => c.definition.tipo !== 'consumible' && (reserve === 0 || me.energy - c.definition.coste >= reserve))
      .sort((a, b) => (b.definition.potencia ?? 0) + b.definition.coste - ((a.definition.potencia ?? 0) + a.definition.coste))
      .forEach((c) => candidates.push({ type: 'PLACE_CARD', side, cardId: c.instanceId, slot }));
  }

  // 4. Disrupt the rival: bounce their best programmer when it pays off, or finish off weak cards
  const foeProgs = foes.filter((c) => c.definition.tipo === 'programador').sort((a, b) => potenciaReal(b) - potenciaReal(a));
  const threatened = hp <= foeBurst + 2;
  ready.filter((c) => c.definition.tipo === 'qa').forEach((qa) => {
    qa.definition.habilidades.forEach(([, , cost], i) => {
      const target = foeProgs[0];
      if (skillOf(qa, i)?.accionTipo === 'DEVOLVER_MANO' && target && (target.definition.coste >= cost || threatened)) {
        candidates.push({ type: 'USE_SKILL', side, cardId: qa.instanceId, skillIndex: i, targetId: target.instanceId });
      }
    });
    const dmg = potenciaReal(qa);
    const targets = [...foes].sort((a, b) => {
      const killA = a.cordura <= dmg ? 1 : 0;
      const killB = b.cordura <= dmg ? 1 : 0;
      return killB - killA || potenciaReal(b) - potenciaReal(a) || a.cordura - b.cordura;
    });
    if (targets[0]) candidates.push({ type: 'ATTACK_CARD', side, attackerId: qa.instanceId, targetId: targets[0].instanceId });
  });

  // 5. Buff the strongest attacker, use direct damage that beats the card's own attack, then attack while safe
  candidates.push(...buffs);
  directDamage((pot, c) => pot > potenciaReal(c));
  candidates.push(...attacks);

  // 6. Leftover energy: heal hurt allies, then burn the Bug
  const hurt = mine.filter((c) => (c.definition.corduraMax ?? 0) - c.cordura >= 2).sort((a, b) => a.cordura - b.cordura);
  consumables.forEach((c) => {
    const action = skillOf(c, 0)?.accionTipo;
    const [, pot] = c.definition.habilidades[0] ?? [];
    if (action === 'CURAR_CORDURA' && hurt[0]) candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId, targetId: hurt[0].instanceId });
    if (action === 'DANIO_DIRECTO' && safe(pot ?? 0)) candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId });
  });

  return candidates.find((a) => !applyAction(s, a).error) ?? { type: 'END_TURN', side };
}

/** Max Bug damage the cards can deal in one turn with `energy`; each card picks one action (0/1 knapsack). */
export function maxBugDamage(cards: EngineCard[], energy: number): number {
  const options = cards.flatMap((c) => {
    const opts: { cost: number; dmg: number }[] = [];
    if (c.definition.tipo === 'programador' && potenciaReal(c) > 0) opts.push({ cost: c.definition.ataqueCoste ?? 0, dmg: potenciaReal(c) });
    c.definition.habilidades.forEach(([id, pot, cost]) => {
      const action = SKILL_RULES[id]?.accionTipo;
      if (action === 'DANIO_DIRECTO' || action === 'APLICAR_ESTADO') opts.push({ cost, dmg: pot });
    });
    return opts.sort((a, b) => b.dmg - a.dmg || a.cost - b.cost).slice(0, 1);
  });
  const dp = Array<number>(Math.max(0, energy) + 1).fill(0);
  for (const o of options) {
    for (let e = energy; e >= o.cost; e--) dp[e] = Math.max(dp[e], dp[e - o.cost] + o.dmg);
  }
  return dp[Math.max(0, energy)];
}
