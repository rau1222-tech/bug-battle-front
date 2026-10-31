import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BrandHeroProps {
  tagline?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Animated bug logo + title. Centered on small screens, left-aligned next to content on large ones. */
export default function BrandHero({ tagline, className, children }: BrandHeroProps) {
  return (
    <div className={cn('flex flex-col items-center text-center lg:items-start lg:text-left', className)}>
      <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-5">
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl lg:text-7xl inline-block drop-shadow-[0_0_20px_hsl(200,100%,50%,0.25)]"
        >
          🐛
        </motion.div>
        <div>
          <h1 className="text-3xl lg:text-5xl font-display font-bold text-cyan-100 tracking-[0.2em] text-glow-blue leading-tight">
            BUG HUNTERS
          </h1>
          {tagline && (
            <p className="text-xs lg:text-sm font-body text-cyan-300/40 mt-1 tracking-wider uppercase">{tagline}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
