import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_DEFINITIONS, type CardInstance } from '@/constants';
import type { EngineCard, MatchAction, MatchView, Side } from '@/game/onlineEngine';

export type BugState = 'idle' | 'hit' | 'death';
export type GamePhase = 'playing' | 'round-end' | 'game-over';
export type ViewSide = 'player' | 'bot';

export type ActionInput = MatchAction extends infer A ? (A extends MatchAction ? Omit<A, 'side'> : never) : never;

export interface ControllerLastAction {
  side: ViewSide;
  type: MatchAction['type'];
  cardId: string | null;
  targetId: string | null;
  defId: string | null;
}

export interface GameController {
  bugComplexity: number;
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

/** Engine cards carry rules only; restore local art/audio for rendering. */
const hydrate = (card: EngineCard): CardInstance => ({ ...card, definition: DEFS.get(card.definition.id) ?? card.definition });
const hydrateTable = (table: (EngineCard | null)[]) => table.map((c) => (c ? hydrate(c) : null));

interface ControllerOptions {
  version: number;
  message: string | null;
  messageKey: string;
  busy: boolean;
  turnDeadline: number | null;
  dispatch: (action: ActionInput) => void;
  restart: () => void;
}

/** Maps an engine view (local or online) to the board's controller, adding highlight/hit animations. */
export function useMatchController(view: MatchView | null, opts: ControllerOptions): GameController | null {
  const { version, message, messageKey, busy, turnDeadline, dispatch, restart } = opts;
  const [highlight, setHighlight] = useState<{ cardId: string | null; targetId: string | null }>({ cardId: null, targetId: null });
  const [bugHit, setBugHit] = useState(false);
  const you: Side = view?.you ?? 'p1';

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
      bugComplexity: view.bugComplexity,
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
      message: message ?? view.message,
      messageKey,
      lastAction: la ? { side: toView(la.side)!, type: la.type, cardId: la.cardId, targetId: la.targetId ?? null, defId: la.defId ?? null } : null,
      actionKey: version,
      botHighlightId: highlight.cardId,
      playerTargetHighlightId: highlight.targetId,
      playerEnergy: me.energy,
      botEnergy: opp.energy,
      playerMaxEnergy: me.maxEnergy,
      botMaxEnergy: opp.maxEnergy,
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
  }, [view, you, bugHit, message, messageKey, version, highlight, busy, turnDeadline, dispatch, restart]);
}
