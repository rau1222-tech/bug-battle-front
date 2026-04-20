import { motion, AnimatePresence } from 'framer-motion';
import { BugState } from '@/hooks/useGameLogic';
import { BUG_MAX_COMPLEXITY } from '@/constants/cards';
import { useRef, useEffect } from 'react';

interface BugCentralProps {
  complexity: number;
  bugState: BugState;
  id?: string;
}

export default function BugCentral({ complexity, bugState, id }: BugCentralProps) {
  const hpPercent = (complexity / BUG_MAX_COMPLEXITY) * 100;
  const explosionRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (bugState === 'death' && explosionRef.current) {
      explosionRef.current.currentTime = 0;
      explosionRef.current.play();
    }
  }, [bugState]);

  return (
    <div id={id} className="flex flex-col items-center gap-1.5 sm:gap-3">
      <motion.div
        className="relative w-24 h-24 sm:w-40 sm:h-40 md:w-56 md:h-56 flex items-center justify-center"
        animate={
          bugState === 'hit'
            ? { x: [0, -14, 14, -7, 7, 0], scale: [1, 0.85, 1.15, 1] }
            : bugState === 'death'
            ? { scale: [1, 1.3, 0], opacity: [1, 1, 0] }
            : {}
        }
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence mode="wait">
          {bugState === 'death' ? (
            <motion.video
              key="explosion"
              ref={explosionRef}
              src="/assets/Explosion-Bug.mp4"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full object-contain"
              muted
              playsInline
              autoPlay
            />
          ) : (
            <motion.video
              key="idle"
              src="/assets/Bug.webm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(100,255,100,0.3)]"
              muted
              playsInline
              autoPlay
              loop
            />
          )}
        </AnimatePresence>

        {bugState === 'hit' && (
          <motion.div
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 rounded-2xl bg-red-500/40"
          />
        )}
      </motion.div>

      {/* HP Bar — warm tones to match desk */}
      <div className="w-24 sm:w-40 md:w-56 h-2 sm:h-3 md:h-3.5 rounded-full bg-black/40 overflow-hidden border border-amber-900/30">
        <motion.div
          className={`h-full rounded-full ${
            hpPercent > 60 ? 'bg-emerald-500' : hpPercent > 30 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          animate={{ width: `${hpPercent}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      </div>
      <span className="text-[9px] sm:text-[11px] md:text-xs font-display text-amber-200/50 tracking-wider">
        COMPLEJIDAD {complexity}/{BUG_MAX_COMPLEXITY}
      </span>
    </div>
  );
}
