import { motion, AnimatePresence } from 'framer-motion';
import { BugState } from '@/hooks/useGameLogic';
import { useRef, useEffect } from 'react';
import { useI18n } from '@/i18n';
import { BUG_RULES } from '@/game/onlineEngine';

// Placeholder tint per Bug until each one has its own art
const BUG_TINT: Record<string, string> = {
  heisenbug: 'hue-rotate-180',
  'legacy-code': 'hue-rotate-60 saturate-50',
};

interface BugCentralProps {
  bugId: string;
  complexity: number;
  maxComplexity: number;
  power: number;
  bugState: BugState;
  id?: string;
}

export default function BugCentral({ bugId, complexity, maxComplexity, power, bugState, id }: BugCentralProps) {
  const { t } = useI18n();
  const bugName = BUG_RULES.find((b) => b.id === bugId)?.nombre ?? 'Bug';
  const hpPercent = (complexity / maxComplexity) * 100;
  const explosionRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (bugState === 'death' && explosionRef.current) {
      explosionRef.current.currentTime = 0;
      explosionRef.current.play();
    }
  }, [bugState]);

  return (
    <div id={id} className="flex flex-col items-center gap-1 sm:gap-1.5">
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: 'var(--bug-size, 14rem)', height: 'var(--bug-size, 14rem)' }}
        animate={
          bugState === 'hit'
            ? { x: [0, -14, 14, -7, 7, 0], scale: [1, 0.85, 1.15, 1], opacity: 1 }
            : bugState === 'death'
            ? { scale: [1, 1.3, 0], opacity: [1, 1, 0] }
            : { scale: 1, opacity: 1 }
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
              key={`idle-${bugId}`}
              src="/assets/Bug.webm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`w-full h-full object-contain drop-shadow-[0_0_30px_rgba(100,255,100,0.3)] ${BUG_TINT[bugId] ?? ''}`}
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
      <div
        className="h-2 sm:h-2.5 rounded-full bg-black/50 overflow-hidden border border-amber-900/40 shadow-inner"
        style={{ width: 'var(--bug-size, 14rem)' }}
      >
        <motion.div
          className={`h-full rounded-full ${
            hpPercent > 60 ? 'bg-emerald-500' : hpPercent > 30 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          animate={{ width: `${hpPercent}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      </div>
      <span className="text-[9px] sm:text-[11px] font-display text-amber-200/60 tracking-wider whitespace-nowrap">
        {bugName} · {t('game.complexity', { current: complexity, max: maxComplexity })}
        {power > 0 && <> · ⚔️ {power}</>}
      </span>
    </div>
  );
}
