import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CARD_INSPECT_HOLD_MS, CardInstance } from '@/constants';
import CardFrame from './CardFrame';

interface GameCardProps {
  card: CardInstance;
  isOpponent?: boolean;
  index?: number;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  /** Long press / right click opens the card detail view. */
  onInspect?: (card: CardInstance) => void;
  inHand?: boolean;
}

const MOVE_TOLERANCE_PX = 8;

export default function GameCard({ card, isOpponent = false, index = 0, disabled = false, selected = false, onSelect, onInspect, inHand = false }: GameCardProps) {
  const { definition } = card;
  const isProgramador = definition.tipo === 'programador';

  const pressTimer = useRef<number | undefined>(undefined);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  const clearPress = () => {
    window.clearTimeout(pressTimer.current);
    pressStart.current = null;
  };

  const pressHandlers = onInspect
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          suppressClick.current = false;
          pressStart.current = { x: e.clientX, y: e.clientY };
          window.clearTimeout(pressTimer.current);
          pressTimer.current = window.setTimeout(() => {
            suppressClick.current = true;
            pressStart.current = null;
            onInspect(card);
          }, CARD_INSPECT_HOLD_MS);
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = pressStart.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX) clearPress();
        },
        onPointerUp: clearPress,
        onPointerLeave: clearPress,
        onPointerCancel: clearPress,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          clearPress();
          onInspect(card);
        },
      }
    : {};

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (inHand && definition.tipo !== 'consumible') return; // Only consumibles can be clicked in hand
    if (!disabled && onSelect) {
      onSelect(card.instanceId);
    }
  };

  return (
    <motion.div
      layout
      initial={inHand ? { opacity: 0, scale: 0.7, rotateY: 90 } : { opacity: 0, scale: 1.35, y: -24 }}
      animate={{
        opacity: disabled && !isOpponent && inHand ? 0.5 : 1,
        scale: selected ? 1.12 : 1,
        y: selected ? -14 : 0,
        rotateY: 0,
      }}
      exit={{ opacity: 0, scale: 0.4, y: 30 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={!disabled && !inHand ? { scale: 1.08, y: -8, transition: { duration: 0.2 } } : {}}
      onClick={handleClick}
      {...pressHandlers}
      className={`game-card relative select-none ${
        inHand ? (definition.tipo === 'consumible' ? 'cursor-pointer' : 'cursor-grab') : !disabled ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{ zIndex: selected ? 50 : index + 1, WebkitTouchCallout: 'none' }}
    >
      <CardFrame card={card} onBoard={!inHand} />

      {/* Selected glow */}
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`absolute -inset-1.5 rounded-xl border-2 pointer-events-none ${
            definition.tipo === 'consumible'
              ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
              : isProgramador
                ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                : 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
          }`}
        />
      )}

      {/* Opponent targeting highlight */}
      {isOpponent && !disabled && (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="absolute -inset-1 rounded-xl border-2 border-red-500/80 shadow-[0_0_18px_rgba(239,68,68,0.55)] pointer-events-none"
        />
      )}
    </motion.div>
  );
}
