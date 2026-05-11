import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameLogic } from '@/hooks/useGameLogic';
import { TABLE_MAX, SKILLS } from '@/constants';
import BugCentral from './BugCentral';
import GameCard from './GameCard';
import ActionMenu from './ActionMenu';
import DeckPile from './DeckPile';
import ActionLog from './ActionLog';
import boardBg from '@/assets/game-board-bg.png';

interface GameBoardProps {
  onExit: () => void;
  deckComposition?: { card_id: string; quantity: number }[];
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

export default function GameBoard({ onExit, deckComposition, playerName = 'Jugador' }: GameBoardProps) {
  const game = useGameLogic(deckComposition);
  const isPlayerTurn = game.turn === 'player';
  const [selection, setSelection] = useState<SelectionPhase>({ type: 'none' });
  const [showExitConfirm, setShowExitConfirm] = useState(false);
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
  const prevBotTableIdsRef = useRef<string[]>([]);

  // Action log — accumulates every game.message change
  const [logEntries, setLogEntries] = useState<{ id: number; text: string }[]>([]);
  const lastMessageRef = useRef<string | null>(null);
  const logIdRef = useRef(0);

  useEffect(() => {
    if (!game.message) return;
    if (lastMessageRef.current === game.message) return;
    lastMessageRef.current = game.message;
    logIdRef.current += 1;
    const id = logIdRef.current;
    setLogEntries((prev) => {
      const next = [...prev, { id, text: game.message }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, [game.message]);

  const playCardAudio = useCallback((audioSrc?: string) => {
    if (!audioSrc) return;
    const audio = new Audio(audioSrc);
    const playPromise = audio.play();
    if (playPromise) {
      void playPromise.catch(() => {
        // Ignore autoplay rejections and transient playback errors.
      });
    }
  }, []);

  useEffect(() => {
    const previousIds = prevBotTableIdsRef.current;
    const currentIds = game.botTable.filter((card): card is NonNullable<typeof card> => card !== null).map((card) => card.instanceId);

    const addedBotCard = game.botTable.find((card) => card !== null && !previousIds.includes(card.instanceId));
    if (addedBotCard) {
      playCardAudio(addedBotCard.definition.audio);
    }

    prevBotTableIdsRef.current = currentIds;
  }, [game.botTable, playCardAudio]);

  const draggingCard = draggingCardId
    ? game.playerHand.find(c => c.instanceId === draggingCardId) ?? null
    : null;

  const selectedCard = selection.type === 'card-selected'
    ? game.playerTable.find(c => c?.instanceId === selection.cardId) ?? null
    : null;

  const getActionsForCard = () => {
    if (!selectedCard) return [];
    if (!selectedCard.disponible) {
      return [{ id: 'unavailable', label: 'Ya actuó este turno', description: 'Esta carta no puede actuar más en este turno' }];
    }
    const actions: { id: string; label: string; description: string }[] = [];
    const def = selectedCard.definition;
    const hasEnergy = game.playerEnergy >= def.ataqueCoste;
    // Basic attack — programadores attack bugs, QAs attack enemy cards
    if (def.potencia > 0) {
      if (def.tipo === 'programador') {
        actions.push({
          id: 'attack-bug',
          label: `⚔️ Atacar Bug (-${def.potencia}❤️, -${def.ataqueCoste}⚡)`,
          description: hasEnergy ? 'Reduce la complejidad del Bug.' : `⚠️ Necesitas ${def.ataqueCoste}⚡`,
        });
      }
      if (def.tipo === 'qa') {
        const hasEnemies = game.botTable.some(c => c !== null);
        if (hasEnemies) {
          actions.push({
            id: 'attack-enemy',
            label: `🎯 Atacar Carta Enemiga (-${def.ataqueCoste}⚡)`,
            description: hasEnergy ? 'Aumenta el estrés de una carta rival.' : `⚠️ Necesitas ${def.ataqueCoste}⚡`,
          });
        }
      }
    }
    // Special skills
    def.habilidades.forEach(([skillId, potencia, coste], idx) => {
      const skill = SKILLS[skillId];
      if (!skill) return;
      if (skill.objetivo === 'carta_enemiga') {
        const hasEnemyTargets = game.botTable.some((c) => c !== null);
        if (!hasEnemyTargets) return;
      }
      if (skill.objetivo === 'carta_aliada') {
        const hasAllyTargets = game.playerTable.some((c) => c !== null && c.instanceId !== selectedCard.instanceId);
        if (!hasAllyTargets) return;
      }
      const canAfford = game.playerEnergy >= coste;
      actions.push({
        id: `skill-${skillId}-${idx}`,
        label: `✨ ${skill.nombre} (Pot: ${potencia}, -${coste}⚡)`,
        description: canAfford ? skill.descripcion : `⚠️ Necesitas ${coste}⚡`,
      });
    });
    return actions;
  };

  const handleTableCardSelect = useCallback((cardId: string) => {
    if (!isPlayerTurn || game.gamePhase !== 'playing') return;
    if (selection.type === 'card-selected' && selection.cardId === cardId) {
      setSelection({ type: 'none' });
    } else {
      setSelection({ type: 'card-selected', cardId });
    }
  }, [isPlayerTurn, game.gamePhase, selection]);

  const handleBotCardSelect = useCallback((cardId: string) => {
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
  }, [selection, game]);

  const handleAllyCardSelect = useCallback((cardId: string) => {
    if (selection.type === 'picking-ally') {
      game.playerUseSkill(selection.cardId, selection.skillIndex, cardId);
      setSelection({ type: 'none' });
    } else if (selection.type === 'consumable-picking-ally') {
      game.playerUseConsumable(selection.cardId, cardId);
      setSelection({ type: 'none' });
    }
  }, [selection, game]);

  const handleAction = useCallback((actionId: string) => {
    if (!selectedCard) return;
    if (actionId === 'attack-bug') {
      game.playerAttackBug(selectedCard.instanceId);
      setSelection({ type: 'none' });
    } else if (actionId === 'attack-enemy') {
      setSelection({ type: 'picking-enemy', cardId: selectedCard.instanceId, actionType: 'attack-enemy' });
    } else if (actionId === 'unavailable') {
      setSelection({ type: 'none' });
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
        playCardAudio(card.definition.audio);
      }
    } else if (commit && cardId !== null && slotIdx !== null) {
      const card = game.playerHand.find((c) => c.instanceId === cardId);
      const canPlace =
        game.gamePhase === 'playing'
        && game.turn === 'player'
        && slotIdx >= 0
        && slotIdx < TABLE_MAX
        && game.playerTable[slotIdx] === null
        && !!card
        && game.playerEnergy >= (card?.definition.coste ?? Infinity);

      if (canPlace) {
        playCardAudio(card.definition.audio);
      }
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
  }, [game, playCardAudio]);

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

  const handlePointerDownCard = useCallback((e: React.PointerEvent, cardId: string) => {
    if (!isPlayerTurn || game.gamePhase !== 'playing') return;
    const card = game.playerHand.find((c) => c.instanceId === cardId);
    if (!card) return;

    const isConsumible = card.definition.tipo === 'consumible';
    if (!isConsumible && game.playerTable.every(Boolean)) return;

    // Only main button for mouse; touch/pen are always allowed
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (isConsumible) {
      const habilidad = card.definition.habilidades[0];
      const skill = habilidad ? SKILLS[habilidad[0]] : null;
      if (!skill) return;
      draggingConsumableTargetRef.current = skill.objetivo;
      setDraggingConsumableTarget(skill.objetivo);
    } else {
      draggingConsumableTargetRef.current = null;
      setDraggingConsumableTarget(null);
    }

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingCardIdRef.current = cardId;
    setDraggingCardId(cardId);
    setDragPos({ x: e.clientX, y: e.clientY });
    // Prevent page scroll while dragging on touch
    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
  }, [isPlayerTurn, game.gamePhase, game.playerTable, game.playerHand]);

  const handlePointerMoveCard = useCallback((e: React.PointerEvent) => {
    if (!draggingCardIdRef.current) return;
    e.preventDefault();
    setDragPos({ x: e.clientX, y: e.clientY });
    updateDragOverFromPoint(e.clientX, e.clientY);
  }, [updateDragOverFromPoint]);

  const handlePointerUpCard = useCallback((e: React.PointerEvent) => {
    if (!draggingCardIdRef.current) return;
    e.preventDefault();
    // Final hit-test (in case pointer was captured and didn't fire move at end)
    updateDragOverFromPoint(e.clientX, e.clientY);
    endDrag(true);
  }, [endDrag, updateDragOverFromPoint]);

  const handlePointerCancelCard = useCallback(() => {
    if (!draggingCardIdRef.current) return;
    endDrag(false);
  }, [endDrag]);


  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* ===== HUD ===== */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 sm:px-6 py-2 sm:py-3 gap-2">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="text-[10px] sm:text-sm font-display text-amber-200/70 hover:text-amber-100 transition-colors bg-black/30 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-amber-900/30 shrink-0"
        >
          ← SALIR
        </button>

        {/* Turn indicator */}
        <motion.div
          key={game.turn}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`text-[10px] sm:text-base font-display font-bold px-2 sm:px-6 py-1 sm:py-2 rounded-lg sm:rounded-xl backdrop-blur-sm border transition-all whitespace-nowrap ${
            isPlayerTurn
              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-500/40 shadow-[0_0_20px_hsl(150_60%_40%/0.3)]'
              : 'bg-red-900/50 text-red-400 border-red-500/40 shadow-[0_0_20px_hsl(0_60%_40%/0.3)]'
          }`}
        >
          {isPlayerTurn
            ? (selection.type === 'picking-enemy'
              || selection.type === 'picking-ally'
              || selection.type === 'consumable-picking-ally'
              || selection.type === 'consumable-picking-enemy'
              || draggingConsumableTarget !== null)
              ? '🎯 OBJETIVO'
              : `🟢 ${playerName.toUpperCase()}`
            : '🔴 RIVAL'}
        </motion.div>

        <div className="flex items-center gap-1.5 sm:gap-4 text-[11px] sm:text-base font-display bg-black/30 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg border border-amber-900/30 shrink-0">
          <span className="text-emerald-400">{game.playerScore}</span>
          <span className="text-amber-200/50 text-[9px] sm:text-xs">R{game.roundNumber}</span>
          <span className="text-red-400">{game.botScore}</span>
        </div>
      </div>

      {/* ===== Energy indicators ===== */}
      <div className="absolute top-11 sm:top-14 right-2 sm:right-6 z-20 flex flex-col items-end gap-1">
        <motion.div
          key={`p-energy-${game.playerEnergy}-${game.playerMaxEnergy}`}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-emerald-700/30"
        >
          <span className="text-[9px] sm:text-xs font-display text-emerald-300/70 mr-0.5">{playerName}</span>
          {Array.from({ length: game.playerMaxEnergy }).map((_, i) => (
            <motion.span
              key={i}
              initial={i < game.playerEnergy ? { scale: 0 } : {}}
              animate={i < game.playerEnergy ? { scale: 1 } : {}}
              transition={{ delay: i * 0.04 }}
              className={`text-[9px] sm:text-xs ${i < game.playerEnergy ? '' : 'opacity-20 grayscale'}`}
            >
              ⚡
            </motion.span>
          ))}
          <span className="text-[9px] sm:text-xs font-display text-amber-100/60 tabular-nums ml-0.5">{game.playerEnergy}/{game.playerMaxEnergy}</span>
        </motion.div>
        <div className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-red-700/30">
          <span className="text-[9px] sm:text-xs font-display text-red-300/70 mr-0.5">BOT</span>
          {Array.from({ length: game.botMaxEnergy }).map((_, i) => (
            <span key={i} className={`text-[9px] sm:text-xs ${i < game.botEnergy ? '' : 'opacity-20 grayscale'}`}>⚡</span>
          ))}
          <span className="text-[9px] sm:text-xs font-display text-amber-100/60 tabular-nums ml-0.5">{game.botEnergy}/{game.botMaxEnergy}</span>
        </div>
      </div>

      {/* ===== Picking-target hint pill (only when choosing QA target) ===== */}
      <AnimatePresence>
        {(
          selection.type === 'picking-enemy'
          || selection.type === 'picking-ally'
          || selection.type === 'consumable-picking-ally'
          || selection.type === 'consumable-picking-enemy'
          || draggingConsumableTarget !== null
        ) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute top-11 sm:top-16 left-1/2 -translate-x-1/2 z-20 max-w-[95%]"
          >
            <span className="text-[9px] sm:text-xs font-body text-amber-100/90 bg-black/50 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-amber-500/40 whitespace-nowrap">
              {draggingConsumableTarget === 'bug'
                ? '🧪 Suelta sobre el Bug'
                : draggingConsumableTarget === 'carta_aliada'
                  ? '🧪 Suelta sobre una carta aliada'
                  : draggingConsumableTarget === 'carta_enemiga'
                    ? '🧪 Suelta sobre una carta rival'
                    : selection.type === 'consumable-picking-ally'
                      ? '🧪 Elige una carta aliada para usar el consumible'
                      : selection.type === 'consumable-picking-enemy'
                        ? '🧪 Elige una carta rival para usar el consumible'
                    : selection.type === 'picking-ally'
                ? '👆 Elige carta aliada para aplicar el efecto'
                : selection.type === 'picking-enemy' && selection.actionType === 'attack-enemy'
                  ? '👆 Elige carta rival para atacar'
                  : '👆 Elige carta rival para aplicar la habilidad'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Action log (bottom-left) ===== */}
      <ActionLog entries={logEntries} />

      {/* ===== DECK ===== */}
      <div className="absolute left-[1%] sm:left-[4%] top-[35%] -translate-y-1/2 z-10 flex flex-col items-center gap-3 sm:gap-8">
        <DeckPile count={game.botDeck.length} label="BOT" />
        <DeckPile count={game.playerDeck.length} label={playerName} />
      </div>

      {/* ===== Skip turn button — bigger, on right edge of mat ===== */}
      {isPlayerTurn && game.gamePhase === 'playing' && (
        <motion.button
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={game.skipTurn}
          className="absolute right-[1%] sm:right-[2%] top-1/2 -translate-y-1/2 z-30 font-display font-bold text-[10px] sm:text-base tracking-wide
            px-2 sm:px-5 py-3 sm:py-6 rounded-xl sm:rounded-2xl
            bg-gradient-to-b from-amber-600/90 to-amber-800/90 text-amber-50
            border-2 border-amber-400/60
            shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]
            hover:from-amber-500/90 hover:to-amber-700/90 hover:border-amber-300/80
            transition-all flex flex-col items-center gap-0.5 sm:gap-1 leading-tight"
        >
          <span className="text-base sm:text-2xl">⏭️</span>
          <span>SALTAR</span>
          <span>TURNO</span>
        </motion.button>
      )}

      {/* ===== PLAY AREA on the mat ===== */}
      <div
        className="absolute flex flex-col top-[9%] bottom-[24%] left-[14%] right-[14%] sm:top-[7%] sm:bottom-[26%] sm:left-[18%] sm:right-[14%]"
      >

        {/* BOT TABLE — slot-based */}
        <div className="flex-1 flex flex-col justify-end pb-2">
          <div className="text-[10px] font-display text-amber-200/30 uppercase tracking-[0.3em] mb-2 text-center">
            Bot
          </div>
          <div className={`flex items-end justify-center gap-1 sm:gap-3 min-h-[5rem] sm:min-h-[7rem] md:min-h-[10rem] px-1 sm:px-4 transition-all duration-300 ${
            selection.type === 'picking-enemy'
            || selection.type === 'consumable-picking-enemy'
            || draggingConsumableTarget === 'carta_enemiga'
              ? 'ring-2 ring-red-500/50 rounded-xl bg-red-900/10'
              : ''
          }`}>
            {game.botTable.map((card, i) => (
              <div
                key={`bot-slot-${i}`}
                data-drop-target={card ? 'enemy-card' : undefined}
                data-card-id={card?.instanceId}
                className="relative w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem] flex items-end justify-center"
              >
                {card ? (
                  <>
                    <GameCard
                      card={card}
                      isOpponent
                      index={i}
                      selected={false}
                      disabled={selection.type !== 'picking-enemy' && selection.type !== 'consumable-picking-enemy'}
                      onSelect={selection.type === 'picking-enemy' || selection.type === 'consumable-picking-enemy' ? handleBotCardSelect : undefined}
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
                  <div className="w-full h-full rounded-lg border-2 border-dashed border-amber-600/25 bg-amber-900/5" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — Bug */}
        <div data-drop-target="bug" className="flex items-center justify-center py-2 relative z-10">
          <BugCentral complexity={game.bugComplexity} bugState={game.bugState} id="bug-central" />
          {draggingConsumableTarget === 'bug' && dragOverTargetId === 'bug' && (
            <motion.div
              initial={{ opacity: 0.3, scale: 0.92 }}
              animate={{ opacity: 1, scale: [1, 1.06, 1] }}
              transition={{ scale: { duration: 0.8, repeat: Infinity } }}
              className="absolute inset-0 rounded-full border-2 border-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.8)] pointer-events-none"
            />
          )}
        </div>

        {/* PLAYER TABLE — 4 independent slot drop zones */}
        <div className="flex-1 flex flex-col justify-start pt-2">
          <div ref={tableRef} className="flex items-start justify-center gap-1 sm:gap-3 min-h-[5rem] sm:min-h-[7rem] md:min-h-[10rem] px-1 sm:px-4 relative">
            {game.playerTable.map((card, i) => {
              const isHovered = draggingConsumableTarget === null && dragOverSlot === i;
              const isOccupied = card !== null;
              return (
                <div
                  key={`slot-${i}`}
                  data-slot-index={!isOccupied ? i : undefined}
                  data-drop-target={card ? 'ally-card' : undefined}
                  data-card-id={card?.instanceId}
                  className={`relative w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem] rounded-lg transition-all duration-200 ${
                    isOccupied
                      ? ''
                      : `border-2 border-dashed bg-amber-900/5 flex items-center justify-center ${
                          isHovered
                            ? 'border-amber-400/80 bg-amber-700/20 shadow-[0_0_18px_rgba(217,180,103,0.35)] scale-105'
                            : 'border-amber-600/40'
                        }`
                  } ${selection.type === 'consumable-picking-ally' || draggingConsumableTarget === 'carta_aliada' ? 'ring-2 ring-cyan-500/50 rounded-xl bg-cyan-900/10' : ''}`}
                >
                  {isOccupied ? (
                    <>
                      <GameCard
                        card={card!}
                        index={i}
                        disabled={
                          !isPlayerTurn
                          || selection.type === 'picking-enemy'
                          || selection.type === 'consumable-picking-enemy'
                          || (selection.type === 'picking-ally' && selection.cardId === card!.instanceId)
                        }
                        selected={selection.type === 'card-selected' && selection.cardId === card!.instanceId}
                        onSelect={selection.type === 'picking-ally' || selection.type === 'consumable-picking-ally' ? handleAllyCardSelect : handleTableCardSelect}
                      />
                      {draggingConsumableTarget === 'carta_aliada' && dragOverTargetId === card.instanceId && (
                        <motion.div
                          initial={{ opacity: 0.3, scale: 0.92 }}
                          animate={{ opacity: 1, scale: [1, 1.06, 1] }}
                          transition={{ scale: { duration: 0.8, repeat: Infinity } }}
                          className="absolute -inset-2 rounded-xl border-2 border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.7)] pointer-events-none z-10"
                        />
                      )}
                      {game.playerTargetHighlightId === card!.instanceId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: [1, 1.08, 1] }}
                          transition={{ scale: { duration: 0.7, repeat: Infinity } }}
                          className="absolute -inset-2 rounded-xl border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)] pointer-events-none z-10"
                        />
                      )}
                      <AnimatePresence>
                        {selection.type === 'card-selected' && selection.cardId === card!.instanceId && (
                          <ActionMenu
                            actions={getActionsForCard()}
                            onSelect={handleAction}
                            onCancel={cancelSelection}
                            position="bottom"
                          />
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <span className="text-amber-300/30 text-[10px] font-display tracking-wider">
                      {i + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] font-display text-amber-200/30 uppercase tracking-[0.3em] mt-1 text-center">
            {playerName} ({game.playerTable.filter(Boolean).length}/{TABLE_MAX})
          </div>
        </div>
      </div>

      {/* ===== BOT HAND — compact indicator at top ===== */}
      <div className="absolute top-[8%] sm:top-[7%] left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2">
          {/* Mini stacked cards */}
          <div className="relative w-8 h-11 sm:w-10 sm:h-14">
            {Array.from({ length: Math.min(game.botHand.length, 3) }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-md overflow-hidden border border-amber-900/60 shadow-md"
                style={{
                  width: '100%',
                  height: '100%',
                  top: -i * 2,
                  left: -i * 1.5,
                  zIndex: i,
                  background:
                    'repeating-linear-gradient(45deg, hsl(30 35% 18%), hsl(30 35% 18%) 4px, hsl(30 40% 22%) 4px, hsl(30 40% 22%) 8px)',
                }}
              >
                <div className="absolute inset-1 rounded-sm border border-amber-700/40 flex items-center justify-center">
                  <span className="text-amber-300/50 text-xs sm:text-sm select-none">🐛</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-black/30 pointer-events-none" />
              </div>
            ))}
          </div>
          {/* Count badge */}
          <motion.div
            key={game.botHand.length}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full border border-amber-900/40"
          >
            <span className="text-[9px] sm:text-[10px] font-display text-amber-200/50 uppercase tracking-wider">Rival</span>
            <span className="text-xs sm:text-sm font-display text-amber-100 font-bold tabular-nums">×{game.botHand.length}</span>
          </motion.div>
        </div>
      </div>

      {/* ===== PLAYER HAND — drag only ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-15 h-[22%]">
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="text-[8px] sm:text-[10px] font-display text-amber-200/40 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1 sm:mb-2 px-2 text-center">
            {playerName} ({game.playerHand.length}) — arrastra cartas a mesa o consumibles a su objetivo
          </div>
          <div className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-8">
            <AnimatePresence>
              {game.playerHand.map((card, i) => {
                const tableFull = game.playerTable.every(Boolean);
                const isConsumible = card.definition.tipo === 'consumible';
                const canDrag = isPlayerTurn && (isConsumible || !tableFull);
                const isDragging = draggingCardId === card.instanceId;
                return (
                  <motion.div
                    key={card.instanceId}
                    layout
                    initial={{ opacity: 0, y: 40, scale: 0.8 }}
                    animate={{
                      opacity: isDragging ? 0 : 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{ opacity: 0, y: -30, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.05 }}
                    whileHover={canDrag && !isDragging ? { y: -12, scale: 1.08, transition: { duration: 0.2 } } : {}}
                    onPointerDown={canDrag ? (e) => handlePointerDownCard(e, card.instanceId) : undefined}
                    onPointerMove={isDragging ? handlePointerMoveCard : undefined}
                    onPointerUp={isDragging ? handlePointerUpCard : undefined}
                    onPointerCancel={isDragging ? handlePointerCancelCard : undefined}
                    className={`select-none touch-none ${
                      canDrag ? 'cursor-grab active:cursor-grabbing' : 'opacity-50 cursor-default'
                    }`}
                    style={isDragging ? { width: 0, marginLeft: '-0.5rem', marginRight: '-0.5rem' } : undefined}
                  >
                    <GameCard
                      card={card}
                      index={i}
                      disabled={!canDrag}
                      selected={false}
                      inHand
                      onSelect={card.definition.tipo === 'consumible' ? (cardId) => {
                        const skill = SKILLS[card.definition.habilidades[0]?.[0]];
                        if (!skill) return;
                        if (skill.objetivo === 'bug') {
                          game.playerUseConsumable(cardId);
                        } else if (skill.objetivo === 'carta_aliada') {
                          setSelection({ type: 'consumable-picking-ally', cardId });
                        } else if (skill.objetivo === 'carta_enemiga') {
                          setSelection({ type: 'consumable-picking-enemy', cardId });
                        }
                      } : undefined}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {game.playerHand.length === 0 && (
              <span className="text-amber-200/20 text-xs font-display">Sin cartas en mano</span>
            )}
          </div>
        </div>
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
                    {game.playerScore > game.botScore ? '¡VICTORIA!' : game.playerScore < game.botScore ? 'DERROTA' : 'EMPATE'}
                  </h2>
                  <p className="text-xl text-amber-200/60 font-body">{game.playerScore} - {game.botScore}</p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">{game.lastAttacker === 'player' ? '✅' : '❌'}</div>
                  <h2 className="text-3xl font-display font-bold text-amber-100 mb-3">
                    {game.lastAttacker === 'player' ? `¡Punto para ${playerName}!` : 'Punto para el Bot'}
                  </h2>
                  <p className="text-xl text-amber-200/60 font-body">{game.playerScore} - {game.botScore}</p>
                </>
              )}
            </motion.div>
            <div className="flex flex-col gap-4">
              <button
                onClick={game.gamePhase === 'game-over' ? game.restartGame : game.startNewRound}
                className="h-14 px-10 font-display text-base tracking-wide rounded-lg bg-amber-700/80 text-amber-100 hover:bg-amber-600/80 border border-amber-500/30 shadow-[0_0_20px_hsl(35_60%_30%/0.3)] transition-all"
              >
                {game.gamePhase === 'game-over' ? 'NUEVA PARTIDA' : 'SIGUIENTE RONDA'}
              </button>
              {game.gamePhase === 'game-over' && (
                <button
                  onClick={onExit}
                  className="font-display text-amber-200/50 hover:text-amber-200/80 text-sm transition-colors"
                >
                  VOLVER AL MENÚ
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
                ¿Abandonar la partida?
              </h2>
              <p className="text-sm font-body text-amber-200/60 text-center">
                Perderás el progreso de esta partida.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 h-11 font-display text-sm tracking-wide rounded-lg bg-stone-800/80 text-amber-200/80 hover:bg-stone-700/80 border border-amber-900/30 transition-colors"
                >
                  SEGUIR
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 h-11 font-display text-sm tracking-wide rounded-lg bg-red-900/60 text-red-100 hover:bg-red-800/70 border border-red-700/40 transition-colors"
                >
                  SALIR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
