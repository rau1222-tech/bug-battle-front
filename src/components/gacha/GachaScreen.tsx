import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BackButton from '@/components/ui/BackButton';
import { DEFAULT_CARD_IMAGE, resolveCardImage, type CardTemplate } from '@/constants';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCards } from '@/hooks/useCards';
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

interface Props {
  onBack: () => void;
}

type Phase = 'shop' | 'opening' | 'reveal';

export default function GachaScreen({ onBack }: Props) {
  const { user } = useAuthContext();
  const { cards, gachaWeightById } = useCards();
  const { collection, coins, loading, addCards, spendCoins } = useCollection(user.id);
  const [phase, setPhase] = useState<Phase>('shop');
  const [pulled, setPulled] = useState<CardTemplate[]>([]);
  const [revealedIdx, setRevealedIdx] = useState(-1);

  const handleBuyPack = async () => {
    if (!(await spendCoins(PACK_COST))) return;
    const results = openPack(cards, (card) => gachaWeightById[card.id] ?? 1);
    setPulled(results);
    setRevealedIdx(-1);
    setPhase('opening');
    setTimeout(() => {
      setPhase('reveal');
      setRevealedIdx(0);
    }, 1200);
  };

  const handleRevealNext = async () => {
    if (revealedIdx < pulled.length - 1) {
      setRevealedIdx((i) => i + 1);
    } else {
      await addCards(pulled);
      setPhase('shop');
      setPulled([]);
      setRevealedIdx(-1);
    }
  };

  const allRevealed = revealedIdx >= pulled.length - 1;

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/3 w-60 h-60 bg-indigo-500/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} color="purple" />
          <h1 className="font-display text-lg sm:text-2xl text-purple-100 tracking-wider text-glow-purple">
            📦 RECLUTAMIENTO
          </h1>
          <div className="flex items-center gap-2 bg-[hsl(220,18%,10%)] px-3 py-1.5 rounded-md border border-purple-500/20">
            <span className="text-base">🪙</span>
            <span className="font-display text-sm text-purple-100 tracking-wider">{coins}</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col items-center">
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
              {/* Terminal-style panel */}
              <div className="w-full rounded-lg border border-purple-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.15)] overflow-hidden">
                {/* Title bar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <span className="ml-2 text-[10px] font-body text-purple-400/50 tracking-wider uppercase">
                    ~/bug-hunters/reclutamiento
                  </span>
                </div>

                <div className="p-4 sm:p-6 flex flex-col items-center gap-5">
                  <h1 className="text-2xl sm:text-3xl font-display text-purple-100 tracking-wider text-glow-purple">
                    📦 RECLUTAMIENTO
                  </h1>
                  <p className="text-sm font-body text-purple-200/50 text-center">
                    Recluta nuevos miembros para tu equipo. Cada sobre contiene {CARDS_PER_PACK} cartas.
                  </p>

                  {/* Pack visual */}
                  <motion.button
                    onClick={() => { void handleBuyPack(); }}
                    disabled={loading || coins < PACK_COST}
                    whileHover={{ scale: coins >= PACK_COST ? 1.05 : 1 }}
                    whileTap={{ scale: coins >= PACK_COST ? 0.95 : 1 }}
                    className="relative flex flex-col items-center gap-3 p-6 sm:p-8 rounded-lg bg-gradient-to-b from-purple-600/20 to-purple-900/20 border-2 border-purple-500/30 backdrop-blur-sm shadow-[0_0_30px_-10px_hsl(260,80%,60%,0.25)] transition-all hover:border-purple-400/50 hover:shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.4)] disabled:opacity-40 disabled:cursor-not-allowed group"
                  >
                    <motion.span
                      animate={{ rotate: [0, -3, 3, -3, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="text-6xl sm:text-7xl"
                    >
                      🎁
                    </motion.span>
                    <span className="font-display text-base text-purple-100 tracking-wide">
                      Sobre de Reclutamiento
                    </span>
                    <span className="flex items-center gap-1.5 font-display text-sm text-purple-300/80">
                      🪙 {PACK_COST}
                    </span>
                    {coins < PACK_COST && (
                      <span className="text-xs font-body text-red-400/80 mt-1">
                        Monedas insuficientes
                      </span>
                    )}
                  </motion.button>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <p className="text-[10px] font-body text-purple-400/30 flex items-center gap-1">
                    <span className="text-purple-400/60">❯</span> Toca el sobre para reclutar nuevos miembros
                  </p>
                </div>
              </div>

              {/* Collection summary — separate panel */}
              <div className="w-full rounded-lg border border-purple-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <span className="text-[10px] font-body text-purple-400/50 tracking-wider uppercase">
                    Colección
                  </span>
                </div>
                <div className="p-3 grid grid-cols-3 gap-2">
                  {cards.map((def) => {
                    const qty = collection[def.id] ?? 0;
                    const rarity = getRarity(def);
                    return (
                      <div
                        key={def.id}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md bg-[hsl(220,15%,12%)] border ${qty > 0 ? RARITY_COLORS[rarity] : 'text-purple-200/20 border-[hsl(220,15%,15%)]'}`}
                      >
                        <img
                          src={resolveCardImage(def.image)}
                          alt={def.nombre}
                          className="w-5 h-5 object-contain rounded shrink-0"
                          onError={(event) => {
                            const img = event.currentTarget;
                            if (img.dataset.fallbackApplied === 'true') return;
                            img.dataset.fallbackApplied = 'true';
                            img.src = DEFAULT_CARD_IMAGE;
                          }}
                          draggable={false}
                        />
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
                className="h-1 bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full"
              />
              <p className="font-display text-purple-200/60 text-sm tracking-wider animate-pulse">
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
              <div className="w-full rounded-lg border border-purple-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.15)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <span className="ml-2 text-[10px] font-body text-purple-400/50 tracking-wider uppercase">
                    ~/reclutamiento/resultados
                  </span>
                </div>

                <div className="p-4 sm:p-6 flex flex-col items-center gap-5">
                  <h2 className="font-display text-lg text-purple-100 tracking-wider text-glow-purple">
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
                              className={`flex flex-col items-center gap-2 p-4 sm:p-5 rounded-lg bg-gradient-to-b from-[hsl(220,15%,14%)] to-[hsl(220,18%,10%)] border-2 ${RARITY_COLORS[rarity]} backdrop-blur-sm shadow-lg ${RARITY_GLOW[rarity]} w-24 sm:w-32`}
                            >
                              <img
                                src={resolveCardImage(def.image)}
                                alt={def.nombre}
                                className="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded"
                                onError={(event) => {
                                  const img = event.currentTarget;
                                  if (img.dataset.fallbackApplied === 'true') return;
                                  img.dataset.fallbackApplied = 'true';
                                  img.src = DEFAULT_CARD_IMAGE;
                                }}
                                draggable={false}
                              />
                              <span className="text-xs sm:text-sm font-display text-center leading-tight">
                                {def.nombre}
                              </span>
                              <span className={`text-[10px] font-body ${RARITY_COLORS[rarity]}`}>
                                {RARITY_LABELS[rarity]}
                              </span>
                              <span className="text-xs font-display text-purple-300/80">
                                ⚔️ {def.potencia}
                              </span>
                            </motion.div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-lg bg-gradient-to-b from-purple-900/20 to-[hsl(220,18%,10%)] border-2 border-purple-700/30 w-24 sm:w-32 h-32 sm:h-40">
                              <span className="text-3xl sm:text-4xl opacity-50">❓</span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  <motion.button
                    onClick={() => { void handleRevealNext(); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-2 px-8 py-3 font-display text-sm tracking-wide rounded-md bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white hover:from-purple-500/90 hover:to-indigo-500/90 border border-purple-400/30 shadow-[0_0_20px_-5px_hsl(260,80%,60%,0.3)] transition-all hover:shadow-[0_0_25px_-5px_hsl(260,80%,60%,0.5)]"
                  >
                    {allRevealed ? '✅ RECOGER' : '👆 REVELAR SIGUIENTE'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
