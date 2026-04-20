import { motion } from 'framer-motion';

interface CardBackProps {
  index?: number;
  size?: 'sm' | 'md';
}

/**
 * Face-down card representation for opponent's hand.
 * Themed to match the warm desk / amber aesthetic.
 */
export default function CardBack({ index = 0, size = 'md' }: CardBackProps) {
  const dims = size === 'sm'
    ? 'w-[2.4rem] h-[3.4rem] sm:w-[3.5rem] sm:h-[5rem] md:w-[5rem] md:h-[7rem]'
    : 'w-[3.6rem] h-[5rem] sm:w-[5rem] sm:h-[7rem] md:w-[7rem] md:h-[9.8rem]';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, rotateY: 180 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      exit={{ opacity: 0, y: -30, scale: 0.7 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: index * 0.04 }}
      className={`relative ${dims} rounded-lg overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-amber-900/60`}
      style={{
        background:
          'repeating-linear-gradient(45deg, hsl(30 35% 18%), hsl(30 35% 18%) 6px, hsl(30 40% 22%) 6px, hsl(30 40% 22%) 12px)',
      }}
    >
      {/* Inner amber frame */}
      <div className="absolute inset-1.5 rounded-md border border-amber-700/40 flex items-center justify-center">
        <div className="text-amber-300/50 text-base sm:text-xl md:text-2xl font-display font-bold tracking-widest select-none">
          🐛
        </div>
      </div>
      {/* Subtle gloss */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-100/5 via-transparent to-black/30 pointer-events-none" />
    </motion.div>
  );
}
