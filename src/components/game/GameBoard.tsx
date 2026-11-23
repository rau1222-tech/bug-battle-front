import { useState, useCallback, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DoorOpen, Settings as SettingsIcon, Volume2, VolumeX } from 'lucide-react';
import { useGameLogic, type GameController } from '@/hooks/useGameLogic';
import { useGameStats } from '@/hooks/useGameStats';
import { useCards } from '@/hooks/useCards';
import { SKILLS, CARD_DEFINITIONS, CARD_INSPECT_HOLD_MS, calcularPotenciaReal, type CardInstance, type CardTemplate } from '@/constants';
import { MAX_ROUNDS, MAX_ROUND_TURNS } from '@/game/onlineEngine';
import BugCentral from './BugCentral';
import GameCard from './GameCard';
import ActionMenu, { type CardAction } from './ActionMenu';
import DeckPile from './DeckPile';
import ActionLog from './ActionLog';
import { EndTurnButton, EnergyPanel, HudIconButton, OpponentHand, Scoreboard, TurnBanner } from './BoardHud';
import BoardBackground from './BoardBackground';
import CardInspector from './CardInspector';
import SettingsDialog from '@/components/auth/SettingsDialog';
import { useI18n } from '@/i18n';
import { getSettings, updateSettings, useSettings } from '@/lib/settings';

interface GameBoardProps {
  onExit: () => void;
  deckComposition?: { card_id: string; quantity: number }[];
  playerId?: string;
  playerName?: string;
}

type SelectionPhase =
  | { type: 'none' }
  | { type: 'card-selected'; cardId: string }
  | { type: 'picking-enemy'; cardId: string; actionType: 'attack-enemy' | 'skill'; skillIndex?: number }
  | { type: 'picking-ally'; cardId: string; skillIndex: number }
  | { type: 'consumable-picking-ally'; cardId: string }
  | { type: 'consumable-picking-enemy'; cardId: string };

type ConsumableDropTarget = 'bug' | 'carta_aliada' | 'carta_enemiga';

const AUDIO_BY_CARD = new Map(CARD_DEFINITIONS.map((d) => [d.id, d.audio]));
/** Pointer travel that turns a press on a hand card into a drag. */
const DRAG_THRESHOLD_PX = 6;
const ONLINE_REWARD = { win: 150, loss: 50 };

/** Card rows take ~4.5 card-widths of height, the Bug gets what is left; ~15rem is reserved for HUD rows. */
const BOARD_VARS = {
  '--card-w': 'clamp(2.75rem, min(10.5vw, calc((100dvh - 15rem) / 5.7)), 7.25rem)',
  '--bug-size': 'clamp(4rem, min(20dvh, calc(100dvh - 15rem - var(--card-w) * 4.5)), 12rem)',
} as CSSProperties;

/** Card badges stick out ~4% per side and the legendary crown ~11% on top. */
const TABLE_SPACING: CSSProperties = {
  gap: 'calc(var(--card-w) * 0.12)',
  padding: 'calc(var(--card-w) * 0.1) calc(var(--card-w) * 0.06) calc(var(--card-w) * 0.04)',
};

export default function GameBoard(props: GameBoardProps) {
  const { cards, loading } = useCards();
  const { t } = useI18n();
  // The match snapshots card rules at start, so wait for the database catalog
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-display text-amber-200/70">{t('common.loading')}</div>;
  }
  return <LocalGameBoard {...props} cards={cards} />;
}

function LocalGameBoard({ deckComposition, cards, ...rest }: GameBoardProps & { cards: CardTemplate[] }) {
  const game = useGameLogic(deckComposition, cards, rest.playerName);
  return <GameBoardView game={game} {...rest} />;
}

interface GameBoardViewProps {
  game: GameController;
  onExit: () => void;
  /** When set, the game result is persisted client-side (vs-bot mode). */
  playerId?: string;
  playerName?: string;
  /** Online mode: rival name, no local restart, round advance only on your turn. */
  opponentName?: string;
  online?: boolean;
  banner?: ReactNode;
}

export function GameBoardView({ game, onExit, playerId, playerName: playerNameProp, opponentName, online = false, banner }: GameBoardViewProps) {
  const { t, cardName, skillName, skillDescription } = useI18n();
  const playerName = playerNameProp ?? t('game.defaultPlayerName');
  const { recordResult } = useGameStats(playerId);
  const isPlayerTurn = game.turn === 'player';
  /** Input is ignored while an online action is in flight */
  const canAct = isPlayerTurn && !game.busy;
  const [selection, setSelection] = useState<SelectionPhase>({ type: 'none' });
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settings = useSettings();
  const [turnBannerKey, setTurnBannerKey] = useState(1);
  const [reward, setReward] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tableRef = useRef<HTMLDivElement>(null);

  // Drag state (pointer-based — works for mouse + touch)
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingConsumableTarget, setDraggingConsumableTarget] = useState<ConsumableDropTarget | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | 'bug' | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingCardIdRef = useRef<string | null>(null);
  const dragOverSlotRef = useRef<number | null>(null);
  const draggingConsumableTargetRef = useRef<ConsumableDropTarget | null>(null);
  const dragOverTargetIdRef = useRef<string | 'bug' | null>(null);
  /** Hand card pressed but not dragged yet: becomes a drag on move, an inspect on hold, a tap on release. */
  const pressRef = useRef<{ cardId: string; x: number; y: number; timer: number } | null>(null);
  const gameOverRecordedRef = useRef(false);

  const [inspect, setInspect] = useState<{ card: CardInstance; side: 'ally' | 'enemy' } | null>(null);
  const inspectAlly = useCallback((card: CardInstance) => setInspect({ card, side: 'ally' }), []);
  const inspectEnemy = useCallback((card: CardInstance) => setInspect({ card, side: 'enemy' }), []);
  const closeInspect = useCallback(() => setInspect(null), []);
  useEffect(() => () => window.clearTimeout(pressRef.current?.timer), []);

  // Action log — one entry per message key, so repeated texts are still logged
  const [logEntries, setLogEntries] = useState<{ id: number; text: string }[]>([]);
  const lastMessageKeyRef = useRef<string | null>(null);
  const logIdRef = useRef(0);

  useEffect(() => {
    if (!game.message) return;
    if (lastMessageKeyRef.current === game.messageKey) return;
    lastMessageKeyRef.current = game.messageKey;
    logIdRef.current += 1;
    const id = logIdRef.current;
    setLogEntries((prev) => {
      const next = [...prev, { id, text: game.message }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, [game.message, game.messageKey]);

  useEffect(() => {
    if (game.gamePhase !== 'game-over') {
      gameOverRecordedRef.current = false;
      setReward(null);
      return;
    }
    if (gameOverRecordedRef.current) return;

    gameOverRecordedRef.current = true;
    const result = game.playerScore > game.botScore ? 'win' : 'loss';
    if (online) {
      setReward(ONLINE_REWARD[result]);
      return;
    }
    recordResult(result)
      .then((gold) => setReward(gold))
      .catch((err) => {
        console.error('Failed to persist game result:', err);
      });
  }, [game.gamePhase, game.playerScore, game.botScore, recordResult, online]);

  useEffect(() => {
    if (game.turnDeadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [game.turnDeadline]);
  const secondsLeft = game.turnDeadline === null ? null : Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));

  const playCardAudio = useCallback((audioSrc?: string) => {
    if (!audioSrc) return;
    const { soundEnabled, volume } = getSettings();
    if (!soundEnabled || volume === 0) return;
    const audio = new Audio(audioSrc);
    audio.volume = volume;
    const playPromise = audio.play();
    if (playPromise) {
      void playPromise.catch(() => {
        // Ignore autoplay rejections and transient playback errors.
      });
    }
  }, []);

  // Sound only for actions the engine accepted (both sides)
  const lastActionKeyRef = useRef(game.actionKey);
  useEffect(() => {
    if (lastActionKeyRef.current === game.actionKey) return;
    lastActionKeyRef.current = game.actionKey;
    const la = game.lastAction;
    if (!la?.defId || (la.type !== 'PLACE_CARD' && la.type !== 'USE_CONSUMABLE')) return;
    playCardAudio(AUDIO_BY_CARD.get(la.defId));
  }, [game.actionKey, game.lastAction, playCardAudio]);

  const draggingCard = draggingCardId
    ? game.playerHand.find(c => c.instanceId === draggingCardId) ?? null
    : null;

  const selectedCard = selection.type === 'card-selected'
    ? game.playerTable.find(c => c?.instanceId === selection.cardId) ?? null
    : null;

  const getActionsForCard = (): CardAction[] => {
    if (!selectedCard) return [];
    const def = selectedCard.definition;
    const energy = game.playerEnergy;
    const used = selectedCard.disponible ? undefined : t('game.menu.used');
    const hasEnemies = game.botTable.some((c) => c !== null);
    const hasAllies = game.playerTable.some((c) => c !== null && c.instanceId !== selectedCard.instanceId);
    const blockReason = (cost: number, hasTargets: boolean) =>
      used ?? (!hasTargets ? t('game.menu.noTargets') : energy < cost ? t('game.menu.noEnergy', { cost }) : undefined);

    const actions: CardAction[] = [];
    // Basic attack — programadores attack the Bug, QAs attack enemy cards
    if (def.tipo === 'programador' || def.tipo === 'qa') {
      const isQa = def.tipo === 'qa';
      const attackCost = def.ataqueCoste ?? 0;
      const power = calcularPotenciaReal(selectedCard);
      actions.push({
        id: isQa ? 'attack-enemy' : 'attack-bug',
        icon: isQa ? 'qa-attack' : 'attack',
        name: isQa ? t('game.inspect.attackEnemy') : t('game.inspect.attackBug'),
        description: isQa ? t('game.action.attackEnemyDesc') : t('game.action.attackBugDesc'),
        cost: attackCost,
        power,
        blocked: used ?? (power <= 0 ? t('game.menu.noPower') : blockReason(attackCost, isQa ? hasEnemies : true)),
      });
    }
    def.habilidades.forEach(([skillId, potencia, coste, duracion], idx) => {
      const skill = SKILLS[skillId];
      if (!skill) return;
      const hasTargets = skill.objetivo === 'carta_enemiga' ? hasEnemies : skill.objetivo === 'carta_aliada' ? hasAllies : true;
      actions.push({
        id: `skill-${skillId}-${idx}`,
        icon: skill.objetivo,
        name: skillName(skill),
        description: skillDescription(skill),
        cost: coste,
        power: potencia > 0 ? potencia : undefined,
        duration: duracion > 0 ? duracion : undefined,
        blocked: blockReason(coste, hasTargets),
      });
    });
    return actions;
  };

  const handleTableCardSelect = useCallback((cardId: string) => {
    if (!canAct || game.gamePhase !== 'playing') return;
    if (selection.type === 'card-selected' && selection.cardId === cardId) {
      setSelection({ type: 'none' });
    } else {
      setSelection({ type: 'card-selected', cardId });
    }
  }, [canAct, game.gamePhase, selection]);

  const handleBotCardSelect = useCallback((cardId: string) => {
    if (!canAct) return;
    if (selection.type === 'picking-enemy') {
      if (selection.actionType === 'attack-enemy') {
        game.playerAttackEnemy(selection.cardId, cardId);
      } else if (selection.actionType === 'skill' && selection.skillIndex !== undefined) {
        game.playerUseSkill(selection.cardId, selection.skillIndex, cardId);
      }
      setSelection({ type: 'none' });
    } else if (selection.type === 'consumable-picking-enemy') {
      game.playerUseConsumable(selection.cardId, cardId);
      setSelection({ type: 'none' });
    }
  }, [selection, game, canAct]);

  const handleAllyCardSelect = useCallback((cardId: string) => {
    if (!canAct) return;
    if (selection.type === 'picking-ally') {
      game.playerUseSkill(selection.cardId, selection.skillIndex, cardId);
      setSelection({ type: 'none' });
    } else if (selection.type === 'consumable-picking-ally') {
      game.playerUseConsumable(selection.cardId, cardId);
      setSelection({ type: 'none' });
    }
  }, [selection, game, canAct]);

  const handleAction = useCallback((actionId: string) => {
    if (!selectedCard || game.busy) return;
    if (actionId === 'attack-bug') {
      game.playerAttackBug(selectedCard.instanceId);
      setSelection({ type: 'none' });
    } else if (actionId === 'attack-enemy') {
      setSelection({ type: 'picking-enemy', cardId: selectedCard.instanceId, actionType: 'attack-enemy' });
    } else if (actionId.startsWith('skill-')) {
      const parts = actionId.split('-');
      const skillId = Number(parts[1]);
      const skillIndex = Number(parts[2]);
      const skill = SKILLS[skillId];
      if (!skill) { setSelection({ type: 'none' }); return; }
      if (skill.objetivo === 'bug') {
        game.playerUseSkill(selectedCard.instanceId, skillIndex);
        setSelection({ type: 'none' });
      } else if (skill.objetivo === 'carta_enemiga') {
        setSelection({ type: 'picking-enemy', cardId: selectedCard.instanceId, actionType: 'skill', skillIndex });
      } else if (skill.objetivo === 'carta_aliada') {
        setSelection({ type: 'picking-ally', cardId: selectedCard.instanceId, skillIndex });
      }
    }
  }, [selectedCard, game]);

  const cancelSelection = useCallback(() => setSelection({ type: 'none' }), []);

  const turn = game.turn;
  const [prevTurn, setPrevTurn] = useState(turn);
  if (turn !== prevTurn) {
    setPrevTurn(turn);
    setTurnBannerKey((k) => k + 1);
    if (selection.type !== 'none') setSelection({ type: 'none' });
  }

  // Pointer-based drag (works for mouse, touch, pen)
  const endDrag = useCallback((commit: boolean) => {
    const cardId = draggingCardIdRef.current;
    const slotIdx = dragOverSlotRef.current;
    const consumableTarget = draggingConsumableTargetRef.current;
    const targetId = dragOverTargetIdRef.current;

    if (commit && cardId !== null && consumableTarget !== null) {
      const card = game.playerHand.find((c) => c.instanceId === cardId);
      if (card && card.definition.tipo === 'consumible' && targetId !== null) {
        if (targetId === 'bug') {
          game.playerUseConsumable(cardId);
        } else {
          game.playerUseConsumable(cardId, targetId);
        }
      }
    } else if (commit && cardId !== null && slotIdx !== null) {
      game.playCardToTable(cardId, slotIdx);
    }
    draggingCardIdRef.current = null;
    dragOverSlotRef.current = null;
    draggingConsumableTargetRef.current = null;
    dragOverTargetIdRef.current = null;
    setDraggingCardId(null);
    setDragOverSlot(null);
    setDraggingConsumableTarget(null);
    setDragOverTargetId(null);
    setDragPos(null);
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
  }, [game]);

  const updateDragOverFromPoint = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const consumableTarget = draggingConsumableTargetRef.current;

    if (consumableTarget) {
      let matchedTarget: string | 'bug' | null = null;

      if (consumableTarget === 'bug') {
        const bugEl = el?.closest('[data-drop-target="bug"]') as HTMLElement | null;
        matchedTarget = bugEl ? 'bug' : null;
      } else if (consumableTarget === 'carta_aliada') {
        const allyEl = el?.closest('[data-drop-target="ally-card"]') as HTMLElement | null;
        matchedTarget = allyEl?.dataset.cardId ?? null;
      } else if (consumableTarget === 'carta_enemiga') {
        const enemyEl = el?.closest('[data-drop-target="enemy-card"]') as HTMLElement | null;
        matchedTarget = enemyEl?.dataset.cardId ?? null;
      }

      dragOverSlotRef.current = null;
      setDragOverSlot(null);
      dragOverTargetIdRef.current = matchedTarget;
      setDragOverTargetId(matchedTarget);
      return;
    }

    const slotEl = el?.closest('[data-slot-index]') as HTMLElement | null;
    if (slotEl) {
      const idx = Number(slotEl.dataset.slotIndex);
      if (!Number.isNaN(idx)) {
        dragOverSlotRef.current = idx;
        setDragOverSlot(idx);
        dragOverTargetIdRef.current = null;
        setDragOverTargetId(null);
        return;
      }
    }
    dragOverSlotRef.current = null;
    setDragOverSlot(null);
    dragOverTargetIdRef.current = null;
    setDragOverTargetId(null);
  }, []);

  const selectConsumable = useCallback((card: CardInstance) => {
    if (!canAct) return;
    const skill = SKILLS[card.definition.habilidades[0]?.[0]];
    if (!skill) return;
    if (skill.objetivo === 'bug') {
      game.playerUseConsumable(card.instanceId);
    } else if (skill.objetivo === 'carta_aliada') {
      setSelection({ type: 'consumable-picking-ally', cardId: card.instanceId });
    } else if (skill.objetivo === 'carta_enemiga') {
      setSelection({ type: 'consumable-picking-enemy', cardId: card.instanceId });
    }
  }, [canAct, game]);

  const startDrag = useCallback((cardId: string, x: number, y: number) => {
    const card = game.playerHand.find((c) => c.instanceId === cardId);
    if (!card) return;
    if (card.definition.tipo === 'consumible') {
      const habilidad = card.definition.habilidades[0];
      const skill = habilidad ? SKILLS[habilidad[0]] : null;
      if (!skill) return;
      draggingConsumableTargetRef.current = skill.objetivo;
      setDraggingConsumableTarget(skill.objetivo);
    } else {
      draggingConsumableTargetRef.current = null;
      setDraggingConsumableTarget(null);
    }
    draggingCardIdRef.current = cardId;
    setDraggingCardId(cardId);
    setDragPos({ x, y });
    // Prevent page scroll while dragging on touch
    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
  }, [game.playerHand]);

  const handlePointerDownCard = useCallback((e: React.PointerEvent, cardId: string) => {
    if (!canAct || game.gamePhase !== 'playing') return;
    const card = game.playerHand.find((c) => c.instanceId === cardId);
    if (!card) return;

    const isConsumible = card.definition.tipo === 'consumible';
    if (!isConsumible && game.playerTable.every(Boolean)) return;

    // Only main button for mouse; touch/pen are always allowed
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    window.clearTimeout(pressRef.current?.timer);
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      setInspect({ card, side: 'ally' });
    }, CARD_INSPECT_HOLD_MS);
    pressRef.current = { cardId, x: e.clientX, y: e.clientY, timer };
  }, [canAct, game.gamePhase, game.playerTable, game.playerHand]);

  const handlePointerMoveCard = useCallback((e: React.PointerEvent) => {
    const press = pressRef.current;
    if (press) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
      window.clearTimeout(press.timer);
      pressRef.current = null;
      startDrag(press.cardId, e.clientX, e.clientY);
    }
    if (!draggingCardIdRef.current) return;
    e.preventDefault();
    setDragPos({ x: e.clientX, y: e.clientY });
    updateDragOverFromPoint(e.clientX, e.clientY);
  }, [startDrag, updateDragOverFromPoint]);

  const handlePointerUpCard = useCallback((e: React.PointerEvent) => {
    const press = pressRef.current;
    if (press) {
      // Quick tap: consumables can also be used by tapping then picking a target
      window.clearTimeout(press.timer);
      pressRef.current = null;
      const card = game.playerHand.find((c) => c.instanceId === press.cardId);
      if (card?.definition.tipo === 'consumible') selectConsumable(card);
      return;
    }
    if (!draggingCardIdRef.current) return;
    e.preventDefault();
    // Final hit-test (in case pointer was captured and didn't fire move at end)
    updateDragOverFromPoint(e.clientX, e.clientY);
    endDrag(true);
  }, [endDrag, updateDragOverFromPoint, game.playerHand, selectConsumable]);

  const handlePointerCancelCard = useCallback(() => {
    window.clearTimeout(pressRef.current?.timer);
    pressRef.current = null;
    if (!draggingCardIdRef.current) return;
    endDrag(false);
  }, [endDrag]);


  const isPlaying = game.gamePhase === 'playing';
  const opponentLabel = opponentName ?? t('game.bot');
  const tableFull = game.playerTable.every(Boolean);
  const pickingEnemy = selection.type === 'picking-enemy' || selection.type === 'consumable-picking-enemy' || draggingConsumableTarget === 'carta_enemiga';
  const pickingAlly = selection.type === 'picking-ally' || selection.type === 'consumable-picking-ally' || draggingConsumableTarget === 'carta_aliada';
  const draggingToSlot = draggingCardId !== null && draggingConsumableTarget === null;

  const targetHint = draggingConsumableTarget === 'bug'
    ? t('game.hint.dropBug')
    : draggingConsumableTarget === 'carta_aliada'
      ? t('game.hint.dropAlly')
      : draggingConsumableTarget === 'carta_enemiga'
        ? t('game.hint.dropEnemy')
        : selection.type === 'consumable-picking-ally'
          ? t('game.hint.consumableAlly')
          : selection.type === 'consumable-picking-enemy'
            ? t('game.hint.consumableEnemy')
            : selection.type === 'picking-ally'
              ? t('game.hint.skillAlly')
              : selection.type === 'picking-enemy'
                ? selection.actionType === 'attack-enemy' ? t('game.hint.attackEnemy') : t('game.hint.skillEnemy')
                : null;
  const statusText = targetHint
    ?? (!isPlaying ? '' : isPlayerTurn
      ? t('game.handHint', { name: playerName, count: game.playerHand.length })
      : t('game.waitingRival', { name: opponentLabel }));

  // Nothing left to afford: nudge the player towards ending the turn
  const hasAffordableMove = game.playerHand.some((c) => c.definition.coste <= game.playerEnergy && (c.definition.tipo === 'consumible' || !tableFull))
    || game.playerTable.some((c) => c !== null && c.disponible && (
      (calcularPotenciaReal(c) > 0 && (c.definition.ataqueCoste ?? 0) <= game.playerEnergy)
      || c.definition.habilidades.some(([, , coste]) => coste <= game.playerEnergy)
    ));

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col bg-[#0a0807] select-none" style={BOARD_VARS}>
      <BoardBackground isPlayerTurn={isPlayerTurn} pulseKey={turnBannerKey} />
      <div
        aria-hidden
        className="absolute inset-1 sm:inset-2 rounded-xl sm:rounded-2xl border border-amber-700/25 shadow-[inset_0_0_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)] pointer-events-none"
      />

      {/* ===== TOP BAR ===== */}
      <header className="relative shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 pt-2.5 sm:pt-4">
        <div className="flex-1 basis-0 flex items-center">
          <HudIconButton label={t('game.leave.confirm')} onClick={() => setShowExitConfirm(true)}>
            <DoorOpen className="w-4 h-4 sm:w-5 sm:h-5" />
          </HudIconButton>
        </div>
        <Scoreboard
          playerName={playerName}
          opponentName={opponentLabel}
          playerScore={game.playerScore}
          opponentScore={game.botScore}
          round={game.roundNumber}
          roundLabel={t('game.roundCounter', { round: game.roundNumber, turns: game.roundTurns, max: MAX_ROUND_TURNS })}
          roundTooltip={t('game.roundTooltip')}
          isPlayerTurn={isPlayerTurn}
        />
        <div className="flex-1 basis-0 flex items-center justify-end gap-1.5 sm:gap-2">
          <HudIconButton
            label={settings.soundEnabled ? t('game.mute') : t('game.unmute')}
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          >
            {settings.soundEnabled ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-300" />}
          </HudIconButton>
          <HudIconButton label={t('game.settings')} onClick={() => setShowSettings(true)}>
            <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-500 group-hover:rotate-90" />
          </HudIconButton>
        </div>
      </header>

      {banner && <div className="relative shrink-0 flex justify-center px-2 pt-1.5">{banner}</div>}

      {/* ===== BOARD MAT ===== */}
      <main className="relative flex-1 min-h-0 flex justify-center px-1.5 sm:px-4">
        <div className="relative w-full max-w-[100rem] h-full flex flex-col">
          {/* OPPONENT SIDE */}
          <section className="relative flex-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5 sm:gap-4 px-1.5 sm:px-5 pt-2 sm:pt-3">
            <div className="justify-self-start flex flex-col sm:flex-row items-center sm:items-end gap-1.5 sm:gap-3">
              <DeckPile count={game.botDeckCount} label={t('game.deck')} side="opponent" />
              <OpponentHand count={game.botHandCount} />
            </div>
            <div
              className={`flex items-end justify-center rounded-xl transition-all duration-300 ${
                pickingEnemy ? 'ring-2 ring-red-500/60 bg-red-900/15 shadow-[0_0_30px_rgba(239,68,68,0.25)]' : ''
              }`}
              style={TABLE_SPACING}
            >
              {game.botTable.map((card, i) => (
                <div
                  key={`bot-slot-${i}`}
                  data-drop-target={card ? 'enemy-card' : undefined}
                  data-card-id={card?.instanceId}
                  className="game-card relative flex items-end justify-center"
                >
                  {card ? (
                    <>
                      <GameCard
                        key={card.instanceId}
                        card={card}
                        isOpponent
                        index={i}
                        selected={false}
                        disabled={selection.type !== 'picking-enemy' && selection.type !== 'consumable-picking-enemy'}
                        onSelect={selection.type === 'picking-enemy' || selection.type === 'consumable-picking-enemy' ? handleBotCardSelect : undefined}
                        onInspect={inspectEnemy}
                      />
                      {game.botHighlightId === card.instanceId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: [1, 1.05, 1] }}
                          transition={{ scale: { duration: 1, repeat: Infinity } }}
                          className="absolute -inset-2 rounded-xl border-2 border-amber-300 shadow-[0_0_28px_rgba(252,211,77,0.7)] pointer-events-none z-10"
                        />
                      )}
                      {draggingConsumableTarget === 'carta_enemiga' && dragOverTargetId === card.instanceId && (
                        <motion.div
                          initial={{ opacity: 0.3, scale: 0.92 }}
                          animate={{ opacity: 1, scale: [1, 1.06, 1] }}
                          transition={{ scale: { duration: 0.8, repeat: Infinity } }}
                          className="absolute -inset-2 rounded-xl border-2 border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.7)] pointer-events-none z-10"
                        />
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full rounded-lg border-2 border-dashed border-rose-900/30 bg-black/10" />
                  )}
                </div>
              ))}
            </div>
            <div className="justify-self-end">
              <EnergyPanel
                name={opponentLabel}
                energy={game.botEnergy}
                max={game.botMaxEnergy}
                tone="opponent"
                active={!isPlayerTurn && isPlaying}
                nextTurn={isPlaying ? game.botNextTurnGain : null}
                nextRound={game.roundNumber < MAX_ROUNDS ? game.botNextRoundBonus : null}
              />
            </div>
          </section>

          {/* CENTRE LANE — log · Bug · end turn, all on the divider line */}
          <div className="relative shrink-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-4 px-1.5 sm:px-5 py-1 sm:py-2">
            <div
              aria-hidden
              className="absolute inset-x-3 sm:inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent shadow-[0_0_14px_rgba(253,230,138,0.7)] pointer-events-none"
            />
            <div className="relative justify-self-start w-full min-w-0 flex">
              <ActionLog entries={logEntries} />
            </div>
            <div data-drop-target="bug" className="relative z-10 flex items-center justify-center">
              <BugCentral bugId={game.bugId} complexity={game.bugComplexity} maxComplexity={game.bugMaxComplexity} power={game.bugPower} bugState={game.bugState} id="bug-central" />
              {draggingConsumableTarget === 'bug' && (
                <motion.div
                  initial={{ opacity: 0.3, scale: 0.92 }}
                  animate={{ opacity: dragOverTargetId === 'bug' ? 1 : 0.45, scale: [1, 1.06, 1] }}
                  transition={{ scale: { duration: 0.8, repeat: Infinity } }}
                  className="absolute inset-0 rounded-full border-2 border-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.8)] pointer-events-none"
                />
              )}
            </div>
            <div className="relative justify-self-end">
              <EndTurnButton
                isPlayerTurn={isPlayerTurn && isPlaying}
                disabled={game.busy}
                urgent={!hasAffordableMove}
                secondsLeft={isPlaying ? secondsLeft : null}
                onClick={game.skipTurn}
              />
            </div>
          </div>

          {/* PLAYER SIDE */}
          <section className="relative flex-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 sm:gap-4 px-1.5 sm:px-5 pb-2 sm:pb-3">
            <div className="justify-self-start">
              <DeckPile count={game.playerDeckCount} label={t('game.deck')} side="player" />
            </div>
            <div
              ref={tableRef}
              className={`flex items-start justify-center rounded-xl transition-all duration-300 ${
                pickingAlly ? 'ring-2 ring-cyan-500/60 bg-cyan-900/15 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : ''
              }`}
              style={TABLE_SPACING}
            >
              {game.playerTable.map((card, i) => {
                const isHovered = draggingToSlot && dragOverSlot === i;
                return (
                  <div
                    key={`slot-${i}`}
                    data-slot-index={card ? undefined : i}
                    data-drop-target={card ? 'ally-card' : undefined}
                    data-card-id={card?.instanceId}
                    className={`game-card relative rounded-lg transition-all duration-200 ${
                      card
                        ? ''
                        : `border-2 border-dashed flex items-center justify-center ${
                            isHovered
                              ? 'border-amber-300 bg-amber-500/20 shadow-[0_0_22px_rgba(252,211,77,0.45)] scale-105'
                              : draggingToSlot
                                ? 'border-amber-400/60 bg-amber-500/10 animate-pulse'
                                : 'border-amber-600/30 bg-black/10'
                          }`
                    }`}
                  >
                    {card ? (
                      <>
                        <GameCard
                          key={card.instanceId}
                          card={card}
                          index={i}
                          disabled={
                            !isPlayerTurn
                            || selection.type === 'picking-enemy'
                            || selection.type === 'consumable-picking-enemy'
                            || (selection.type === 'picking-ally' && selection.cardId === card.instanceId)
                          }
                          selected={selection.type === 'card-selected' && selection.cardId === card.instanceId}
                          onSelect={selection.type === 'picking-ally' || selection.type === 'consumable-picking-ally' ? handleAllyCardSelect : handleTableCardSelect}
                          onInspect={inspectAlly}
                        />
                        {draggingConsumableTarget === 'carta_aliada' && dragOverTargetId === card.instanceId && (
                          <motion.div
                            initial={{ opacity: 0.3, scale: 0.92 }}
                            animate={{ opacity: 1, scale: [1, 1.06, 1] }}
                            transition={{ scale: { duration: 0.8, repeat: Infinity } }}
                            className="absolute -inset-2 rounded-xl border-2 border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.7)] pointer-events-none z-10"
                          />
                        )}
                        {game.playerTargetHighlightId === card.instanceId && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: [1, 1.08, 1] }}
                            transition={{ scale: { duration: 0.7, repeat: Infinity } }}
                            className="absolute -inset-2 rounded-xl border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)] pointer-events-none z-10"
                          />
                        )}
                        <AnimatePresence>
                          {selection.type === 'card-selected' && selection.cardId === card.instanceId && (
                            <ActionMenu
                              anchorId={card.instanceId}
                              title={cardName(card.definition)}
                              energy={game.playerEnergy}
                              actions={getActionsForCard()}
                              onSelect={handleAction}
                              onCancel={cancelSelection}
                            />
                          )}
                        </AnimatePresence>
                      </>
                    ) : (
                      <span className="text-amber-300/25 text-[10px] font-display tracking-wider">{i + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="justify-self-end">
              <EnergyPanel
                name={playerName}
                energy={game.playerEnergy}
                max={game.playerMaxEnergy}
                tone="player"
                active={isPlayerTurn && isPlaying}
                nextTurn={isPlaying ? game.playerNextTurnGain : null}
                nextRound={game.roundNumber < MAX_ROUNDS ? game.playerNextRoundBonus : null}
              />
            </div>
          </section>
        </div>
      </main>

      {/* ===== STATUS LINE — contextual hint, reserved height so nothing shifts ===== */}
      <div className="relative shrink-0 h-6 sm:h-7 flex items-center justify-center px-3">
        <AnimatePresence mode="wait">
          {statusText && (
            <motion.span
              key={statusText}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={`max-w-full truncate text-[9px] sm:text-xs font-display tracking-wider ${
                targetHint
                  ? 'text-amber-100 bg-amber-900/60 border border-amber-400/50 rounded-full px-3 py-0.5 shadow-[0_0_14px_rgba(251,191,36,0.35)]'
                  : 'text-amber-200/45 uppercase'
              }`}
            >
              {statusText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ===== PLAYER HAND — fanned, drag to play ===== */}
      <div
        className="relative shrink-0 flex items-end justify-center px-3 pb-3 sm:pb-4"
        style={{ minHeight: 'calc(var(--card-w) * 1.4 + 1rem)' }}
      >
        <div aria-hidden className="absolute inset-x-[10%] bottom-1 sm:bottom-2 h-3/4 rounded-t-[50%] bg-gradient-to-t from-emerald-500/10 to-transparent blur-xl pointer-events-none" />
        <AnimatePresence>
          {game.playerHand.map((card, i) => {
            const isConsumible = card.definition.tipo === 'consumible';
            const canDrag = isPlayerTurn && isPlaying && (isConsumible || !tableFull);
            const affordable = canDrag && card.definition.coste <= game.playerEnergy;
            const isDragging = draggingCardId === card.instanceId;
            const offset = i - (game.playerHand.length - 1) / 2;
            return (
              <motion.div
                key={card.instanceId}
                layout
                initial={{ opacity: 0, y: 60, scale: 0.8 }}
                animate={{
                  opacity: isDragging ? 0 : 1,
                  y: Math.abs(offset) * 5,
                  rotate: offset * 3.5,
                  scale: 1,
                }}
                exit={{ opacity: 0, y: -40, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.04 }}
                whileHover={canDrag && !isDragging ? { y: -18, rotate: 0, scale: 1.1, transition: { duration: 0.2 } } : {}}
                onPointerDown={canDrag ? (e) => handlePointerDownCard(e, card.instanceId) : undefined}
                onPointerMove={canDrag ? handlePointerMoveCard : undefined}
                onPointerUp={canDrag ? handlePointerUpCard : undefined}
                onPointerCancel={canDrag ? handlePointerCancelCard : undefined}
                onContextMenu={canDrag ? (e) => { e.preventDefault(); inspectAlly(card); } : undefined}
                className={`relative origin-bottom select-none touch-none hover:z-30 ${
                  canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                }`}
                style={{
                  marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * 0.1)',
                  ...(isDragging ? { width: 0, marginLeft: 0, marginRight: 0 } : {}),
                }}
              >
                {affordable && (
                  <motion.div
                    aria-hidden
                    animate={{ opacity: [0.45, 0.85, 0.45] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                    className="absolute -inset-1 rounded-xl bg-emerald-400/30 blur-md pointer-events-none"
                  />
                )}
                <GameCard
                  card={card}
                  index={i}
                  disabled={!canDrag}
                  selected={false}
                  inHand
                  onInspect={canDrag ? undefined : inspectAlly}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
        {game.playerHand.length === 0 && (
          <span className="self-center text-amber-200/25 text-xs font-display">{t('game.emptyHand')}</span>
        )}
      </div>

      {/* ===== Floating drag preview — follows cursor ===== */}
      {draggingCard && dragPos && (
        <motion.div
          className="fixed pointer-events-none z-[60]"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            y: [0, -6, 0],
            rotate: [-3, 3, -3],
          }}
          transition={{
            y: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <div className="drop-shadow-[0_20px_30px_rgba(0,0,0,0.7)]">
            <GameCard card={draggingCard} index={0} disabled selected inHand />
          </div>
        </motion.div>
      )}

      {isPlaying && (
        <TurnBanner
          bannerKey={turnBannerKey}
          isPlayerTurn={isPlayerTurn}
          text={isPlayerTurn ? t('game.turn.yours') : t('game.turn.rival', { name: opponentLabel.toUpperCase() })}
        />
      )}

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} scope="game" />

      <AnimatePresence>
        {inspect && (
          <CardInspector
            key={inspect.card.instanceId}
            card={
              [...game.playerHand, ...game.playerTable, ...game.botTable].find((c) => c?.instanceId === inspect.card.instanceId)
              ?? inspect.card
            }
            side={inspect.side}
            onClose={closeInspect}
          />
        )}
      </AnimatePresence>

      {/* ===== Overlays ===== */}
      <AnimatePresence>
        {(game.gamePhase === 'round-end' || game.gamePhase === 'game-over') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-8 z-50"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="text-center"
            >
              {game.gamePhase === 'game-over' ? (
                <>
                  <div className="text-7xl mb-4">
                    {game.playerScore > game.botScore ? '🏆' : game.playerScore < game.botScore ? '💀' : '🤝'}
                  </div>
                  <h2 className="text-4xl font-display font-bold text-amber-100 mb-3">
                    {game.playerScore > game.botScore ? t('game.victory') : game.playerScore < game.botScore ? t('game.defeat') : t('game.draw')}
                  </h2>
                  <p className="text-xl text-amber-200/60 font-body">{game.playerScore} - {game.botScore}</p>
                  {reward !== null && (
                    <p className="mt-3 text-lg font-display text-yellow-300">
                      {reward > 0 ? `+${reward} 🪙` : online ? '' : t('game.dailyGoldLimit')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">{game.lastAttacker === 'player' ? '✅' : '❌'}</div>
                  <h2 className="text-3xl font-display font-bold text-amber-100 mb-3">
                    {game.lastAttacker === 'player' ? t('game.pointForPlayer', { name: playerName }) : opponentName ? t('game.pointForOpponent', { name: opponentName }) : t('game.pointForBot')}
                  </h2>
                  <p className="text-xl text-amber-200/60 font-body">{game.playerScore} - {game.botScore}</p>
                </>
              )}
            </motion.div>
            <div className="flex flex-col gap-4">
              {!(online && game.gamePhase === 'game-over') && (
              <button
                onClick={game.gamePhase === 'game-over' ? game.restartGame : game.startNewRound}
                disabled={game.busy}
                className="h-14 px-10 font-display text-base tracking-wide rounded-lg bg-amber-700/80 text-amber-100 hover:bg-amber-600/80 border border-amber-500/30 shadow-[0_0_20px_hsl(35_60%_30%/0.3)] transition-all disabled:opacity-60"
              >
                {game.gamePhase === 'game-over' ? t('game.newMatch') : t('game.nextRound')}
                {game.gamePhase === 'round-end' && secondsLeft !== null && ` (${secondsLeft}s)`}
              </button>
              )}
              {game.gamePhase === 'game-over' && (
                <button
                  onClick={onExit}
                  className="font-display text-amber-200/50 hover:text-amber-200/80 text-sm transition-colors"
                >
                  {t('game.backToMenu')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit confirmation dialog */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowExitConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-stone-950/95 border border-amber-700/40 rounded-xl shadow-2xl shadow-black/60 p-6 sm:p-8 flex flex-col items-center gap-5 max-w-sm mx-4"
            >
              <span className="text-3xl">🚪</span>
              <h2 className="text-lg sm:text-xl font-display text-amber-100 text-center tracking-wide">
                {t('game.leave.title')}
              </h2>
              <p className="text-sm font-body text-amber-200/60 text-center">
                {online ? t('game.leave.online') : t('game.leave.offline')}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 h-11 font-display text-sm tracking-wide rounded-lg bg-stone-800/80 text-amber-200/80 hover:bg-stone-700/80 border border-amber-900/30 transition-colors"
                >
                  {t('game.leave.stay')}
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 h-11 font-display text-sm tracking-wide rounded-lg bg-red-900/60 text-red-100 hover:bg-red-800/70 border border-red-700/40 transition-colors"
                >
                  {t('game.leave.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
