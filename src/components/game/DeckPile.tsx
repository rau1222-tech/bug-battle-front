import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

interface DeckPileProps {
  count: number;
  label: string;
}

const CARD_BACK_BG =
  'repeating-linear-gradient(45deg, hsl(30 35% 18%), hsl(30 35% 18%) 6px, hsl(30 40% 22%) 6px, hsl(30 40% 22%) 12px)';

function CardBackFace({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg sm:rounded-xl overflow-hidden border border-amber-900/60 shadow-lg shadow-black/40 relative ${className ?? ''}`}
      style={{ background: CARD_BACK_BG }}
    >
      <div className="absolute inset-1 sm:inset-1.5 rounded-md border border-amber-700/40 flex items-center justify-center">
        <span className="text-amber-300/50 text-base sm:text-lg md:text-2xl select-none">🐛</span>
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-black/30 pointer-events-none" />
    </div>
  );
}

const CARD_DIMS = 'w-14 h-[4.8rem] sm:w-[4.5rem] sm:h-[6rem] md:w-24 md:h-[8rem]';

export default function DeckPile({ count, label }: DeckPileProps) {
  const stackCount = Math.min(count, 6);
  const prevCount = useRef(count);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (count < prevCount.current) {
      setIsDrawing(true);
      const t = setTimeout(() => setIsDrawing(false), 600);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
      <div className={`relative ${CARD_DIMS}`}>
        {/* Stack of face-down cards */}
        {Array.from({ length: stackCount }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ top: -i * 2.5, left: -i * 1.2, zIndex: i }}
            animate={
              isDrawing && i === stackCount - 1
                ? { scale: [1, 0.97, 1] }
                : {}
            }
            transition={{ duration: 0.3 }}
          >
            <CardBackFace className={CARD_DIMS} />
          </motion.div>
        ))}

        {/* Draw animation — card flies out */}
        <AnimatePresence>
          {isDrawing && (
            <motion.div
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{
                x: [0, 20, 100],
                y: [0, -30, 10],
                opacity: [1, 1, 0],
                scale: [1, 1.1, 0.6],
                rotate: [0, -8, 20],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut', times: [0, 0.35, 1] }}
              className="absolute inset-0 z-20"
            >
              <div
                className={`${CARD_DIMS} rounded-lg sm:rounded-xl overflow-hidden border-2 border-amber-400/60 relative shadow-xl shadow-amber-500/30`}
                style={{ background: CARD_BACK_BG }}
              >
                <div className="absolute inset-1 sm:inset-1.5 rounded-md border border-amber-500/50 flex items-center justify-center">
                  <motion.span
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 0.4 }}
                    className="text-amber-300/70 text-base sm:text-lg md:text-2xl select-none"
                  >
                    🐛
                  </motion.span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-200/10 via-transparent to-black/20 pointer-events-none" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Glow pulse when drawing */}
        <AnimatePresence>
          {isDrawing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0] }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-10 rounded-lg sm:rounded-xl bg-amber-400/20 blur-md"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Count badge */}
      <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-amber-900/30">
        <span className="text-[9px] sm:text-[10px] md:text-xs font-display text-amber-200/50 tracking-wider">
          {label}
        </span>
        <span className="text-[10px] sm:text-xs md:text-sm font-display text-amber-100 font-bold tabular-nums">
          {count}
        </span>
      </div>
    </div>
  );
}
