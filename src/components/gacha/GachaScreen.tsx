import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { CARD_DEFINITIONS, type CardDefinition } from '@/constants/cards';
import {
  useCollection,
  openPack,
  PACK_COST,
  CARDS_PER_PACK,
  getRarity,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_GLOW,
} from '@/hooks/useCollection';
import boardBg from '@/assets/game-board-bg.png';

interface Props {
  onBack: () => void;
}

type Phase = 'shop' | 'opening' | 'reveal';

export default function GachaScreen({ onBack }: Props) {
  const { collection, coins, addCards, spendCoins } = useCollection();
  const [phase, setPhase] = useState<Phase>('shop');
  const [pulled, setPulled] = useState<CardDefinition[]>([]);
  const [revealedIdx, setRevealedIdx] = useState(-1);

  const handleBuyPack = () => {
    if (!spendCoins(PACK_COST)) return;
    const results = openPack();
    setPulled(results);
    setRevealedIdx(-1);
    setPhase('opening');
    // Auto-start reveal after brief animation
    setTimeout(() => {
      setPhase('reveal');
      setRevealedIdx(0);
    }, 1200);
  };

  const handleRevealNext = () => {
    if (revealedIdx < pulled.length - 1) {
      setRevealedIdx((i) => i + 1);
    } else {
      // All revealed → add to collection
      addCards(pulled);
      setPhase('shop');
      setPulled([]);
      setRevealedIdx(-1);
    }
  };

  const allRevealed = revealedIdx >= pulled.length - 1;

  return (
    <div
      className="h-[100dvh] w-full flex flex-col relative overflow-hidden"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-amber-200/70 hover:text-amber-100 transition-colors bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-amber-900/30"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-display text-xs tracking-wider">VOLVER</span>
        </button>
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-amber-700/30">
          <span className="text-base">🪙</span>
          <span className="font-display text-sm text-amber-100 tracking-wider">{coins}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 z-10">
        <AnimatePresence mode="wait">
          {/* ═══ SHOP PHASE ═══ */}
          {phase === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6 w-full max-w-md"
            >
              <h1 className="text-2xl sm:text-3xl font-display text-amber-100 tracking-wider">
                📦 RECLUTAMIENTO
              </h1>
              <p className="text-sm font-body text-amber-200/50 text-center">
                Recluta nuevos miembros para tu equipo. Cada sobre contiene {CARDS_PER_PACK} cartas.
              </p>

              {/* Pack visual */}
              <motion.button
                onClick={handleBuyPack}
                disabled={coins < PACK_COST}
                whileHover={{ scale: coins >= PACK_COST ? 1.05 : 1 }}
                whileTap={{ scale: coins >= PACK_COST ? 0.95 : 1 }}
                className="relative flex flex-col items-center gap-3 p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-amber-900/40 to-stone-900/60 border-2 border-amber-600/40 backdrop-blur-sm shadow-2xl shadow-amber-900/20 transition-all hover:border-amber-500/60 hover:shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <motion.span
                  animate={{ rotate: [0, -3, 3, -3, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-6xl sm:text-7xl"
                >
                  🎁
                </motion.span>
                <span className="font-display text-lg text-amber-100 tracking-wide">
                  Sobre de Reclutamiento
                </span>
                <span className="flex items-center gap-1.5 font-display text-sm text-amber-300/80">
                  🪙 {PACK_COST}
                </span>
                {coins < PACK_COST && (
                  <span className="text-xs font-body text-red-400/80 mt-1">
                    Monedas insuficientes
                  </span>
                )}
              </motion.button>

              {/* Collection summary */}
              <div className="w-full mt-4">
                <h2 className="font-display text-xs text-amber-300/60 tracking-[0.2em] uppercase mb-3 text-center">
                  Mi Colección
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                  {CARD_DEFINITIONS.map((def) => {
                    const qty = collection[def.id] ?? 0;
                    const rarity = getRarity(def);
                    return (
                      <div
                        key={def.id}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/30 border ${qty > 0 ? RARITY_COLORS[rarity] : 'text-amber-200/20 border-stone-800/40'} backdrop-blur-sm`}
                      >
                        <span className="text-base">{def.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-display truncate">{def.nombre}</p>
                          <p className="text-[9px] font-body opacity-60">{RARITY_LABELS[rarity]}</p>
                        </div>
                        <span className="text-xs font-display tabular-nums">×{qty}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ OPENING ANIMATION ═══ */}
          {phase === 'opening' && (
            <motion.div
              key="opening"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="flex flex-col items-center gap-6"
            >
              <motion.span
                animate={{
                  scale: [1, 1.3, 1],
                  rotate: [0, -10, 10, -5, 0],
                }}
                transition={{ duration: 1, ease: 'easeInOut' }}
                className="text-8xl"
              >
                🎁
              </motion.span>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '200px' }}
                transition={{ duration: 1 }}
                className="h-1 bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
              />
              <p className="font-display text-amber-200/60 text-sm tracking-wider animate-pulse">
                Abriendo...
              </p>
            </motion.div>
          )}

          {/* ═══ REVEAL PHASE ═══ */}
          {phase === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 w-full max-w-lg"
            >
              <h2 className="font-display text-lg text-amber-100 tracking-wider">
                ¡Nuevos reclutas!
              </h2>

              <div className="flex gap-3 sm:gap-5 justify-center w-full">
                {pulled.map((def, i) => {
                  const revealed = i <= revealedIdx;
                  const rarity = getRarity(def);
                  return (
                    <motion.div
                      key={i}
                      initial={{ rotateY: 180, scale: 0.8 }}
                      animate={
                        revealed
                          ? { rotateY: 0, scale: 1 }
                          : { rotateY: 180, scale: 0.8 }
                      }
                      transition={{ type: 'spring', damping: 15, stiffness: 150 }}
                      className="perspective-[800px]"
                    >
                      {revealed ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`flex flex-col items-center gap-2 p-4 sm:p-5 rounded-xl bg-gradient-to-b from-stone-800/80 to-stone-900/90 border-2 ${RARITY_COLORS[rarity]} backdrop-blur-sm shadow-lg ${RARITY_GLOW[rarity]} w-24 sm:w-32`}
                        >
                          <span className="text-3xl sm:text-4xl">{def.emoji}</span>
                          <span className="text-xs sm:text-sm font-display text-center leading-tight">
                            {def.nombre}
                          </span>
                          <span className={`text-[10px] font-body ${RARITY_COLORS[rarity]}`}>
                            {RARITY_LABELS[rarity]}
                          </span>
                          <span className="text-xs font-display text-amber-400/80">
                            ⚔️ {def.potencia}
                          </span>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-xl bg-gradient-to-b from-amber-900/40 to-stone-900/60 border-2 border-amber-700/30 backdrop-blur-sm w-24 sm:w-32 h-32 sm:h-40">
                          <span className="text-3xl sm:text-4xl opacity-50">❓</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              <motion.button
                onClick={handleRevealNext}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="mt-4 px-8 py-3 font-display text-sm tracking-wide rounded-xl bg-amber-700/70 text-amber-100 hover:bg-amber-600/70 border border-amber-500/30 shadow-lg shadow-black/30 transition-all"
              >
                {allRevealed ? '✅ RECOGER' : '👆 REVELAR SIGUIENTE'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
