import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_DEFINITIONS, type CardInstance, type CardTemplate } from '@/constants';
import { BUG_MAX_COMPLEXITY, nextTurnGain, roundCarryEnergy, type EngineCard, type GameMessage, type MatchAction, type MatchView, type Side } from '@/game/onlineEngine';
import { useI18n } from '@/i18n';

export type BugState = 'idle' | 'hit' | 'death';
export type GamePhase = 'playing' | 'round-end' | 'game-over';
export type ViewSide = 'player' | 'bot';

/** A message as structured engine data (translated on render) with a plain-text fallback. */
export interface LocalMessage {
  msg?: GameMessage | null;
  text: string;
}

export type ActionInput = MatchAction extends infer A ? (A extends MatchAction ? Omit<A, 'side'> : never) : never;

export interface ControllerLastAction {
  side: ViewSide;
  type: MatchAction['type'];
  cardId: string | null;
  targetId: string | null;
  defId: string | null;
}

export interface GameController {
  bugId: string;
  bugComplexity: number;
  bugMaxComplexity: number;
  /** Counterattack damage the Bug deals to whoever hit it during their turn. */
  bugPower: number;
  bugState: BugState;
  playerHand: CardInstance[];
  /** Slot-based table: fixed length TABLE_MAX, null = empty slot */
  playerTable: (CardInstance | null)[];
  playerDeckCount: number;
  botHandCount: number;
  botTable: (CardInstance | null)[];
  botDeckCount: number;
  playerScore: number;
  botScore: number;
  playerDamage: number;
  botDamage: number;
  roundNumber: number;
  roundTurns: number;
  gamePhase: GamePhase;
  turn: ViewSide;
  lastAttacker: ViewSide | null;
  message: string;
  /** Changes on every new log entry, even when the text repeats. */
  messageKey: string;
  /** Last applied action and a key that changes with every applied action. */
  lastAction: ControllerLastAction | null;
  actionKey: number;
  botHighlightId: string | null;
  playerTargetHighlightId: string | null;
  playerEnergy: number;
  botEnergy: number;
  playerMaxEnergy: number;
  botMaxEnergy: number;
  /** Energy each side gains at the start of its next turn. */
  playerNextTurnGain: number;
  botNextTurnGain: number;
  /** Extra energy each side would start the next round with. */
  playerNextRoundBonus: number;
  botNextRoundBonus: number;
  /** True while an action is in flight; input should be ignored. */
  busy: boolean;
  /** Client epoch ms when the current turn/pause times out, if timed. */
  turnDeadline: number | null;
  playCardToTable: (cardId: string, slotIndex: number) => void;
  playerAttackBug: (cardId: string) => void;
  playerAttackEnemy: (attackerId: string, targetId: string) => void;
  playerUseSkill: (cardId: string, skillIndex: number, targetId?: string) => void;
  playerUseConsumable: (cardId: string, targetId?: string) => void;
  skipTurn: () => void;
  startNewRound: () => void;
  restartGame: () => void;
}

const DEFS = new Map(CARD_DEFINITIONS.map((d) => [d.id, d]));

/** Engine cards carry rules only; add the art from the card catalog (or the built-in assets). */
function hydrator(cards: CardTemplate[]) {
  const art = new Map(cards.map((c) => [c.id, c]));
  const hydrate = (card: EngineCard): CardInstance => {
    const look = art.get(card.definition.id) ?? DEFS.get(card.definition.id);
    return { ...card, definition: { ...card.definition, image: look?.image, audio: look?.audio } };
  };
  return { hydrate, hydrateTable: (table: (EngineCard | null)[]) => table.map((c) => (c ? hydrate(c) : null)), storedName: (id: string) => art.get(id)?.nombre };
}

interface ControllerOptions {
  version: number;
  /** Local error shown instead of the view's log message. */
  message: LocalMessage | null;
  messageKey: string;
  busy: boolean;
  turnDeadline: number | null;
  dispatch: (action: ActionInput) => void;
  restart: () => void;
  /** Card catalog used for art; rules always come from the engine view. */
  cards: CardTemplate[];
}

/** Maps an engine view (local or online) to the board's controller, adding highlight/hit animations. */
export function useMatchController(view: MatchView | null, opts: ControllerOptions): GameController | null {
  const { version, message, messageKey, busy, turnDeadline, dispatch, restart, cards } = opts;
  const { hydrate, hydrateTable, storedName } = useMemo(() => hydrator(cards), [cards]);
  const [highlight, setHighlight] = useState<{ cardId: string | null; targetId: string | null }>({ cardId: null, targetId: null });
  const [bugHit, setBugHit] = useState(false);
  const you: Side = view?.you ?? 'p1';
  const { gameMessage } = useI18n();

  const lastAction = view?.lastAction ?? null;
  useEffect(() => {
    if (!lastAction || lastAction.side === you) return;
    setHighlight({ cardId: lastAction.cardId, targetId: lastAction.targetId ?? null });
    const t = setTimeout(() => setHighlight({ cardId: null, targetId: null }), 900);
    return () => clearTimeout(t);
    // Re-run per applied action, not per object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, you]);

  const hp = view?.bugComplexity ?? 0;
  const prevHpRef = useRef(hp);
  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = hp;
    if (hp < prev && hp > 0) {
      setBugHit(true);
      const t = setTimeout(() => setBugHit(false), 400);
      return () => clearTimeout(t);
    }
  }, [hp]);

  return useMemo<GameController | null>(() => {
    if (!view) return null;
    const foe: Side = you === 'p1' ? 'p2' : 'p1';
    const me = view.sides[you];
    const opp = view.sides[foe];
    const toView = (side: Side | null): ViewSide | null => (side === null ? null : side === you ? 'player' : 'bot');
    const la = view.lastAction;
    return {
      bugId: view.bug?.id ?? 'nullpointer',
      bugComplexity: view.bugComplexity,
      bugMaxComplexity: view.bug?.maxHp ?? BUG_MAX_COMPLEXITY,
      bugPower: view.bug?.potencia ?? 0,
      bugState: view.bugComplexity === 0 ? 'death' : bugHit ? 'hit' : 'idle',
      playerHand: (me.hand ?? []).map(hydrate),
      playerTable: hydrateTable(me.table),
      playerDeckCount: me.deckCount,
      botHandCount: opp.handCount,
      botTable: hydrateTable(opp.table),
      botDeckCount: opp.deckCount,
      playerScore: me.score,
      botScore: opp.score,
      playerDamage: me.damage ?? 0,
      botDamage: opp.damage ?? 0,
      roundNumber: view.roundNumber,
      roundTurns: view.roundTurns ?? 0,
      gamePhase: view.gamePhase,
      turn: toView(view.turn)!,
      lastAttacker: toView(view.lastAttacker),
      message: message
        ? `⚠️ ${(message.msg ? gameMessage(message.msg, storedName) : message.text).replace(/^⚠️\s*/, '')}`
        : view.msg ? gameMessage(view.msg, storedName) : view.message,
      messageKey,
      lastAction: la ? { side: toView(la.side)!, type: la.type, cardId: la.cardId, targetId: la.targetId ?? null, defId: la.defId ?? null } : null,
      actionKey: version,
      botHighlightId: highlight.cardId,
      playerTargetHighlightId: highlight.targetId,
      playerEnergy: me.energy,
      botEnergy: opp.energy,
      playerMaxEnergy: me.maxEnergy,
      botMaxEnergy: opp.maxEnergy,
      playerNextTurnGain: nextTurnGain(view, you),
      botNextTurnGain: nextTurnGain(view, foe),
      playerNextRoundBonus: roundCarryEnergy(me.damage ?? 0),
      botNextRoundBonus: roundCarryEnergy(opp.damage ?? 0),
      busy,
      turnDeadline,
      playCardToTable: (cardId, slot) => dispatch({ type: 'PLACE_CARD', cardId, slot }),
      playerAttackBug: (cardId) => dispatch({ type: 'ATTACK_BUG', cardId }),
      playerAttackEnemy: (attackerId, targetId) => dispatch({ type: 'ATTACK_CARD', attackerId, targetId }),
      playerUseSkill: (cardId, skillIndex, targetId) => dispatch({ type: 'USE_SKILL', cardId, skillIndex, targetId }),
      playerUseConsumable: (cardId, targetId) => dispatch({ type: 'USE_CONSUMABLE', cardId, targetId }),
      skipTurn: () => dispatch({ type: 'END_TURN' }),
      startNewRound: () => dispatch({ type: 'NEXT_ROUND' }),
      restartGame: restart,
    };
  }, [view, you, bugHit, message, messageKey, version, highlight, busy, turnDeadline, dispatch, restart, gameMessage, hydrate, hydrateTable, storedName]);
}
