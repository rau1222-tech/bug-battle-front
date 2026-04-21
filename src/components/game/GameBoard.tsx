import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameLogic } from '@/hooks/useGameLogic';
import { TABLE_MAX } from '@/constants/cards';
import BugCentral from './BugCentral';
import GameCard from './GameCard';
import CardBack from './CardBack';
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
  | { type: 'picking-target'; qaCardId: string };

export default function GameBoard({ onExit, deckComposition, playerName = 'Jugador' }: GameBoardProps) {
  const game = useGameLogic(deckComposition);
  const isPlayerTurn = game.turn === 'player';
  const [selection, setSelection] = useState<SelectionPhase>({ type: 'none' });
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Drag state (pointer-based — works for mouse + touch)
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingCardIdRef = useRef<string | null>(null);
  const dragOverSlotRef = useRef<number | null>(null);

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

  const draggingCard = draggingCardId
    ? game.playerHand.find(c => c.instanceId === draggingCardId) ?? null
    : null;

  const selectedCard = selection.type === 'card-selected'
    ? game.playerTable.find(c => c?.instanceId === selection.cardId) ?? null
    : null;

  const getActionsForCard = () => {
    if (!selectedCard) return [];
    if (selectedCard.definition.tipo === 'programador') {
      return [{ id: 'attack', label: `Atacar Bug (-${selectedCard.definition.potencia})`, description: 'Reduce la complejidad del Bug (pasa turno)' }];
    }
    if (selectedCard.definition.tipo === 'qa') {
      const isUsed = game.usedAbilityCards.includes(selectedCard.instanceId);
      if (isUsed) {
        return [{ id: 'already-used', label: 'Ya usada este turno', description: 'Solo puedes usar cada habilidad una vez por turno' }];
      }
      const hasTargets = game.botTable.some(c => c?.definition.tipo === 'programador');
      if (hasTargets) {
        return [{ id: 'qa-target', label: 'Eliminar carta rival', description: 'Elige un Programador del Bot (no pasa turno)' }];
      }
      return [{ id: 'no-targets', label: 'Sin objetivos', description: 'El Bot no tiene Programadores en mesa' }];
    }
    return [];
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
    if (selection.type !== 'picking-target') return;
    game.playerUseQA(selection.qaCardId, cardId);
    setSelection({ type: 'none' });
  }, [selection, game]);

  const handleAction = useCallback((actionId: string) => {
    if (!selectedCard) return;
    if (actionId === 'attack') {
      game.playerAttackBug(selectedCard.instanceId);
      setSelection({ type: 'none' });
    } else if (actionId === 'qa-target') {
      setSelection({ type: 'picking-target', qaCardId: selectedCard.instanceId });
    } else if (actionId === 'no-targets' || actionId === 'already-used') {
      setSelection({ type: 'none' });
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
    if (commit && cardId !== null && slotIdx !== null) {
      game.playCardToTable(cardId, slotIdx);
    }
    draggingCardIdRef.current = null;
    dragOverSlotRef.current = null;
    setDraggingCardId(null);
    setDragOverSlot(null);
    setDragPos(null);
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
  }, [game]);

  const updateDragOverFromPoint = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const slotEl = el?.closest('[data-slot-index]') as HTMLElement | null;
    if (slotEl) {
      const idx = Number(slotEl.dataset.slotIndex);
      if (!Number.isNaN(idx)) {
        dragOverSlotRef.current = idx;
        setDragOverSlot(idx);
        return;
      }
    }
    dragOverSlotRef.current = null;
    setDragOverSlot(null);
  }, []);

  const handlePointerDownCard = useCallback((e: React.PointerEvent, cardId: string) => {
    if (!isPlayerTurn || game.gamePhase !== 'playing') return;
    if (game.playerTable.every(Boolean)) return;
    // Only main button for mouse; touch/pen are always allowed
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingCardIdRef.current = cardId;
    setDraggingCardId(cardId);
    setDragPos({ x: e.clientX, y: e.clientY });
    // Prevent page scroll while dragging on touch
    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
  }, [isPlayerTurn, game.gamePhase, game.playerTable]);

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
            ? selection.type === 'picking-target' ? '🎯 OBJETIVO' : `🟢 ${playerName.toUpperCase()}`
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
        {selection.type === 'picking-target' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute top-11 sm:top-16 left-1/2 -translate-x-1/2 z-20 max-w-[95%]"
          >
            <span className="text-[9px] sm:text-xs font-body text-amber-100/90 bg-black/50 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-amber-500/40 whitespace-nowrap">
              👆 Elige carta rival
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
            selection.type === 'picking-target' ? 'ring-2 ring-red-500/50 rounded-xl bg-red-900/10' : ''
          }`}>
            {game.botTable.map((card, i) => (
              <div key={`bot-slot-${i}`} className="relative w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem] flex items-end justify-center">
                {card ? (
                  <>
                    <GameCard
                      card={card}
                      isOpponent
                      index={i}
                      selected={false}
                      disabled={selection.type !== 'picking-target'}
                      onSelect={selection.type === 'picking-target' ? handleBotCardSelect : undefined}
                    />
                    {game.botHighlightId === card.instanceId && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: [1, 1.05, 1] }}
                        transition={{ scale: { duration: 1, repeat: Infinity } }}
                        className="absolute -inset-2 rounded-xl border-2 border-amber-300 shadow-[0_0_28px_rgba(252,211,77,0.7)] pointer-events-none z-10"
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
        <div className="flex items-center justify-center py-2 relative z-10">
          <BugCentral complexity={game.bugComplexity} bugState={game.bugState} id="bug-central" />
        </div>

        {/* PLAYER TABLE — 4 independent slot drop zones */}
        <div className="flex-1 flex flex-col justify-start pt-2">
          <div ref={tableRef} className="flex items-start justify-center gap-1 sm:gap-3 min-h-[5rem] sm:min-h-[7rem] md:min-h-[10rem] px-1 sm:px-4 relative">
            {game.playerTable.map((card, i) => {
              const isHovered = dragOverSlot === i;
              const isOccupied = card !== null;
              const canDrop = !isOccupied && draggingCardId !== null;
              return (
                <div
                  key={`slot-${i}`}
                  data-slot-index={!isOccupied ? i : undefined}
                  className={`relative w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem] rounded-lg transition-all duration-200 ${
                    isOccupied
                      ? ''
                      : `border-2 border-dashed bg-amber-900/5 flex items-center justify-center ${
                          isHovered
                            ? 'border-amber-400/80 bg-amber-700/20 shadow-[0_0_18px_rgba(217,180,103,0.35)] scale-105'
                            : 'border-amber-600/40'
                        }`
                  }`}
                >
                  {isOccupied ? (
                    <>
                      <GameCard
                        card={card!}
                        index={i}
                        disabled={!isPlayerTurn || selection.type === 'picking-target'}
                        selected={selection.type === 'card-selected' && selection.cardId === card!.instanceId}
                        onSelect={handleTableCardSelect}
                        isUsedThisTurn={game.usedAbilityCards.includes(card!.instanceId)}
                      />
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

      {/* ===== BOT HAND — face-down at top ===== */}
      <div className="absolute top-[8%] sm:top-[7%] left-1/2 -translate-x-1/2 z-10 hidden sm:block">
        <div className="flex items-center justify-center gap-1">
          <AnimatePresence>
            {game.botHand.map((card, i) => (
              <div key={card.instanceId} style={{ transform: `translateY(${Math.abs(i - (game.botHand.length - 1) / 2) * 2}px)` }}>
                <CardBack index={i} size="sm" />
              </div>
            ))}
          </AnimatePresence>
        </div>
        <div className="text-[10px] font-display text-amber-200/40 uppercase tracking-[0.3em] mt-1 text-center">
          Mano rival ({game.botHand.length})
        </div>
      </div>

      {/* ===== PLAYER HAND — drag only ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-15 h-[22%]">
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="text-[8px] sm:text-[10px] font-display text-amber-200/40 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1 sm:mb-2 px-2 text-center">
            {playerName} ({game.playerHand.length}) — arrastra a un hueco
          </div>
          <div className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-8">
            <AnimatePresence>
              {game.playerHand.map((card, i) => {
                const tableFull = game.playerTable.every(Boolean);
                const canDrag = isPlayerTurn && !tableFull;
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
