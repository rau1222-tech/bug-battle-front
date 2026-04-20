import { motion } from 'framer-motion';
import { CardInstance } from '@/constants/cards';
import cardBase from '@/assets/Base-Carta.png';

interface GameCardProps {
  card: CardInstance;
  isOpponent?: boolean;
  index?: number;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  inHand?: boolean;
  isUsedThisTurn?: boolean;
}

export default function GameCard({ card, isOpponent = false, index = 0, disabled = false, selected = false, onSelect, inHand = false, isUsedThisTurn = false }: GameCardProps) {
  const { definition } = card;
  const isProgramador = definition.tipo === 'programador';

  const handleClick = () => {
    if (inHand) return; // Hand cards are drag-only
    if (!disabled && onSelect) {
      onSelect(card.instanceId);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.7, rotateY: 90 }}
      animate={{
        opacity: disabled && !isOpponent ? 0.5 : 1,
        scale: selected ? 1.12 : 1,
        y: selected ? -14 : 0,
        rotateY: 0,
      }}
      exit={{ opacity: 0, scale: 0.4, y: 30 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={!disabled && !inHand ? { scale: 1.08, y: -8, transition: { duration: 0.2 } } : {}}
      onClick={handleClick}
      className={`relative select-none w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem] ${
        inHand ? 'cursor-default' : !disabled ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{ zIndex: selected ? 50 : index + 1 }}
    >
      {/* Card frame */}
      <img
        src={cardBase}
        alt=""
        className="absolute inset-0 w-full h-full object-fill pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
        draggable={false}
      />

      {/* Selected glow */}
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`absolute -inset-1.5 rounded-xl border-2 pointer-events-none ${
            isProgramador
              ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
          }`}
        />
      )}

      {/* Used this turn indicator */}
      {isUsedThisTurn && (
        <div className="absolute -inset-1 rounded-xl border-2 border-gray-400/40 pointer-events-none bg-black/20" />
      )}

      {/* Opponent targeting highlight */}
      {isOpponent && !disabled && (
        <div className="absolute inset-0 rounded-lg border-2 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] pointer-events-none" />
      )}

      {/* TOP: Card Name */}
      <div className="absolute top-[4%] left-[10%] right-[18%] h-[7%] flex items-center justify-center pointer-events-none overflow-hidden">
        <span className={`text-[4px] sm:text-[5.5px] md:text-[7px] font-display font-bold tracking-wide text-center leading-none px-1 ${
          isProgramador ? 'text-stone-900' : 'text-red-600'
        }`}>
          {definition.nombre.toUpperCase()}
        </span>
      </div>

      {/* CENTER: Card Art */}
      <div className="absolute top-[13%] left-[8%] right-[8%] bottom-[45%] flex items-center justify-center pointer-events-none">
        <span className="text-base sm:text-2xl md:text-3xl">{definition.emoji}</span>
      </div>

      {/* BOTTOM: Ability */}
      <div className="absolute top-[59%] left-[10%] right-[10%] bottom-[14%] flex items-center justify-center p-1 pointer-events-none overflow-hidden">
        <p className="text-[3.5px] sm:text-[4.5px] md:text-[5.5px] font-body text-stone-600 text-center leading-tight">
          {definition.descripcion}
        </p>
      </div>

      {/* BOTTOM LEFT: Power */}
      <div className="absolute bottom-[3%] left-[10%] w-[28%] h-[8%] flex items-center justify-center pointer-events-none">
        <span className={`text-[5px] sm:text-[6.5px] md:text-[8px] font-display font-bold ${
          isProgramador ? 'text-stone-800' : 'text-red-600'
        }`}>
          {isProgramador ? `${definition.potencia}` : 'QA'}
        </span>
      </div>

      {/* BOTTOM RIGHT: Cost */}
      <div className="absolute bottom-[3%] right-[10%] w-[28%] h-[8%] flex items-center justify-center pointer-events-none">
        <span className="text-[4px] sm:text-[5px] md:text-[7px] leading-none">
          {'⚡'.repeat(definition.coste)}
        </span>
      </div>
    </motion.div>
  );
}
