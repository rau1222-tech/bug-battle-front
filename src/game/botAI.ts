import {
  CARD_RULES,
  SKILL_RULES,
  applyAction,
  other,
  potenciaReal,
  type DeckEntry,
  type EngineCard,
  type MatchAction,
  type MatchState,
  type Side,
} from './onlineEngine';
import { DECK_SIZE, MAX_COPIES } from '@/constants';

const isCard = (c: EngineCard | null): c is EngineCard => c !== null;

/** Balanced random deck for the bot: every programmer twice, the rest filled with random support cards. */
export function randomBotDeck(random: () => number = Math.random): DeckEntry[] {
  const programmers = CARD_RULES.filter((c) => c.tipo === 'programador');
  const support = CARD_RULES.filter((c) => c.tipo !== 'programador').flatMap((c) => Array<string>(MAX_COPIES).fill(c.id));
  for (let i = support.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [support[i], support[j]] = [support[j], support[i]];
  }
  const ids = [...programmers.flatMap((c) => Array<string>(MAX_COPIES).fill(c.id)), ...support].slice(0, DECK_SIZE);
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  return [...counts].map(([card_id, quantity]) => ({ card_id, quantity }));
}

/** Greedy bot: returns the first legal action from a priority list, falling back to ending the turn. */
export function botNextAction(s: MatchState, side: Side): MatchAction {
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

  // 1. Finish the Bug if possible
  attackers.filter((c) => potenciaReal(c) >= hp).forEach((c) => candidates.push({ type: 'ATTACK_BUG', side, cardId: c.instanceId }));
  ready.forEach((c) => c.definition.habilidades.forEach(([, pot], i) => {
    if (skillOf(c, i)?.accionTipo === 'DANIO_DIRECTO' && pot >= hp) candidates.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i });
  }));
  consumables.forEach((c) => {
    const [, pot] = c.definition.habilidades[0] ?? [];
    if (skillOf(c, 0)?.accionTipo === 'DANIO_DIRECTO' && pot >= hp) candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId });
  });

  // 2. Develop the board, keeping enough energy for the attackers already on it
  const slot = me.table.findIndex((t) => t === null);
  if (slot >= 0) {
    const reserve = attackers.reduce((acc, c) => acc + (c.definition.ataqueCoste ?? 0), 0);
    me.hand
      .filter((c) => c.definition.tipo !== 'consumible' && (attackers.length === 0 || me.energy - c.definition.coste >= reserve))
      .sort((a, b) => (b.definition.potencia ?? 0) + b.definition.coste - ((a.definition.potencia ?? 0) + a.definition.coste))
      .forEach((c) => candidates.push({ type: 'PLACE_CARD', side, cardId: c.instanceId, slot }));
  }

  // 3. Disrupt the rival: bounce their best programmer, or finish off weak cards
  const foeProgs = foes.filter((c) => c.definition.tipo === 'programador').sort((a, b) => potenciaReal(b) - potenciaReal(a));
  ready.filter((c) => c.definition.tipo === 'qa').forEach((qa) => {
    qa.definition.habilidades.forEach((_, i) => {
      if (skillOf(qa, i)?.accionTipo === 'DEVOLVER_MANO' && foeProgs[0] && (potenciaReal(foeProgs[0]) >= 2 || hp <= 5)) {
        candidates.push({ type: 'USE_SKILL', side, cardId: qa.instanceId, skillIndex: i, targetId: foeProgs[0].instanceId });
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

  // 4. Buff the strongest attacker before it hits
  const best = attackers[0];
  if (best) {
    ready.filter((c) => c.instanceId !== best.instanceId).forEach((c) => c.definition.habilidades.forEach(([, pot], i) => {
      const worthIt = c.definition.tipo !== 'programador' || pot >= potenciaReal(c);
      if (skillOf(c, i)?.accionTipo === 'APLICAR_ESTADO' && worthIt) {
        candidates.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i, targetId: best.instanceId });
      }
    }));
    consumables
      .filter((c) => skillOf(c, 0)?.accionTipo === 'APLICAR_ESTADO')
      .forEach((c) => candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId, targetId: best.instanceId }));
  }

  // 5. Direct-damage skills that beat the card's own attack
  ready.forEach((c) => c.definition.habilidades.forEach(([, pot], i) => {
    if (skillOf(c, i)?.accionTipo === 'DANIO_DIRECTO' && pot > potenciaReal(c)) {
      candidates.push({ type: 'USE_SKILL', side, cardId: c.instanceId, skillIndex: i });
    }
  }));

  // 6. Attack with everything available
  attackers.forEach((c) => candidates.push({ type: 'ATTACK_BUG', side, cardId: c.instanceId }));

  // 7. Leftover energy: heal hurt allies, then burn the Bug
  const hurt = mine.filter((c) => (c.definition.corduraMax ?? 0) - c.cordura >= 2).sort((a, b) => a.cordura - b.cordura);
  consumables.forEach((c) => {
    const action = skillOf(c, 0)?.accionTipo;
    if (action === 'CURAR_CORDURA' && hurt[0]) candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId, targetId: hurt[0].instanceId });
    if (action === 'DANIO_DIRECTO') candidates.push({ type: 'USE_CONSUMABLE', side, cardId: c.instanceId });
  });

  return candidates.find((a) => !applyAction(s, a).error) ?? { type: 'END_TURN', side };
}
