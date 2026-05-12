import { motion } from 'framer-motion';
import { CardInstance, DEFAULT_CARD_IMAGE, calcularPotenciaReal, resolveCardImage } from '@/constants';
import cardBase from '@/assets/Base-Carta.png';

interface GameCardProps {
  card: CardInstance;
  isOpponent?: boolean;
  index?: number;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  inHand?: boolean;
}

export default function GameCard({ card, isOpponent = false, index = 0, disabled = false, selected = false, onSelect, inHand = false }: GameCardProps) {
  const { definition } = card;
  const isProgramador = definition.tipo === 'programador';

  const handleClick = () => {
    if (inHand && definition.tipo !== 'consumible') return; // Only consumibles can be clicked in hand
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
        inHand ? (definition.tipo === 'consumible' ? 'cursor-pointer' : 'cursor-grab') : !disabled ? 'cursor-pointer' : 'cursor-default'
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
            definition.tipo === 'consumible'
              ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
              : isProgramador
                ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                : 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
          }`}
        />
      )}

      {/* Used this turn indicator */}
      {!inHand && !card.disponible && (
        <div className="absolute -inset-1 rounded-xl border-2 border-gray-400/40 pointer-events-none bg-black/20" />
      )}

      {/* Opponent targeting highlight */}
      {isOpponent && !disabled && (
        <div className="absolute inset-0 rounded-lg border-2 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] pointer-events-none" />
      )}

      {/* TOP: Card Name */}
      <div className="absolute top-[4%] left-[10%] right-[18%] h-[7%] flex items-center justify-center pointer-events-none overflow-hidden">
        <span className={`text-[4px] sm:text-[5.5px] md:text-[7px] font-display font-bold tracking-wide text-center leading-none px-1 ${
          definition.tipo === 'consumible' ? 'text-cyan-700' : isProgramador ? 'text-stone-900' : 'text-red-600'
        }`}>
          {definition.nombre.toUpperCase()}
        </span>
      </div>

      {/* CENTER: Card Art */}
      <div className="absolute top-[13%] left-[8%] right-[8%] bottom-[45%] flex items-center justify-center pointer-events-none">
        <img
          src={resolveCardImage(definition.image)}
          alt={definition.nombre}
          className="w-full h-full object-contain rounded-sm"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.dataset.fallbackApplied === 'true') return;
            img.dataset.fallbackApplied = 'true';
            img.src = DEFAULT_CARD_IMAGE;
          }}
          draggable={false}
        />
      </div>

      {/* BOTTOM: Ability */}
      <div className="absolute top-[59%] left-[10%] right-[10%] bottom-[14%] flex items-center justify-center p-1 pointer-events-none overflow-hidden">
        <p className="text-[3.5px] sm:text-[4.5px] md:text-[5.5px] font-body text-stone-600 text-center leading-tight">
          {definition.descripcion}
        </p>
      </div>

      {/* BOTTOM LEFT: Power */}
      <div className="absolute bottom-[3%] left-[10%] w-[28%] h-[8%] flex items-center justify-center pointer-events-none">
        {definition.tipo === 'consumible' ? (
          <span className="text-[6px] sm:text-[7.5px] md:text-[10px] font-display font-bold">🧪</span>
        ) : definition.tipo === 'programador' ? (
          <span className={`text-[5px] sm:text-[6.5px] md:text-[8px] font-display font-bold transition-colors ${
            calcularPotenciaReal(card) > (definition.potencia ?? 0)
              ? 'text-emerald-500'
              : calcularPotenciaReal(card) < (definition.potencia ?? 0)
                ? 'text-red-500'
                : 'text-stone-800'
          }`}>
            {calcularPotenciaReal(card)}
          </span>
        ) : (
          <span className="text-[5px] sm:text-[6.5px] md:text-[8px] font-display font-bold text-red-600">QA</span>
        )}
      </div>

      {/* BOTTOM RIGHT: Cost */}
      <div className="absolute bottom-[2%] right-[8%] w-[30%] h-[10%] flex items-center justify-center pointer-events-none">
        <div className="flex items-center justify-center gap-[1px] bg-gradient-to-b from-amber-700/80 to-amber-900/90 rounded-[3px] sm:rounded px-[3px] py-[1px] sm:px-1.5 sm:py-0.5 border border-amber-400/50 shadow-[0_0_6px_rgba(251,191,36,0.3)]">
          <span className="text-[5px] sm:text-[7px] md:text-[9px] leading-none">⚡</span>
          <span className="text-[6px] sm:text-[8px] md:text-[11px] font-display font-black text-amber-100 leading-none tabular-nums">
            {definition.coste}
          </span>
        </div>
      </div>

      {/* EFFECTS INDICATOR — show if card has active effects */}
      {!inHand && card.efectosActivos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-[5%] right-[8%] pointer-events-none"
        >
          <span className="text-base sm:text-xl md:text-2xl animate-pulse">✨</span>
        </motion.div>
      )}

      {/* CORDURA INDICATOR — only when on the table and not consumible */}
      {!inHand && definition.corduraMax && definition.corduraMax > 0 && definition.tipo !== 'consumible' && (
        <div className="absolute top-[11%] left-[8%] right-[8%] flex flex-col items-center gap-[1px] pointer-events-none">
          <span className={`text-[4px] sm:text-[5px] md:text-[6.5px] font-display font-bold leading-none ${
            card.cordura === definition.corduraMax ? 'text-emerald-600' : card.cordura <= 1 ? 'text-red-500' : 'text-amber-500'
          }`}>
            🧠 {card.cordura}
          </span>
          <div className="w-full h-[2px] sm:h-[3px] rounded-full overflow-hidden bg-stone-700/40">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (card.cordura / definition.corduraMax) * 100)}%`,
                backgroundColor: card.cordura === definition.corduraMax ? 'transparent' : card.cordura <= 1 ? '#ef4444' : '#f59e0b',
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
