import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DEFAULT_CARD_IMAGE } from '@/constants/cards';
import { useSettings } from '@/lib/settings';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export interface TourStep {
  id: string;
  /** Value of the `data-tour` attribute to highlight; omit for a centered step. */
  target?: string;
  title: string;
  text: string;
  /** Emoji that pops next to the mascot. */
  mood: string;
}

interface HomeTourProps {
  steps: TourStep[];
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PADDING = 8;
const TYPE_SPEED_MS = 18;

function useTypewriter(text: string, instant: boolean) {
  const [count, setCount] = useState(instant ? text.length : 0);
  useEffect(() => {
    setCount(instant ? text.length : 0);
    if (instant) return;
    const id = window.setInterval(() => setCount((c) => Math.min(c + 1, text.length)), TYPE_SPEED_MS);
    return () => window.clearInterval(id);
  }, [text, instant]);
  const done = count >= text.length;
  const complete = useCallback(() => setCount(text.length), [text]);
  return { shown: text.slice(0, count), done, complete };
}

function findTarget(target?: string): HTMLElement | null {
  return target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
}

/** Guided tour of the home menu: dims the page, spotlights each option and lets the mascot explain it. */
export default function HomeTour({ steps, onClose }: HomeTourProps) {
  const { t } = useI18n();
  const { reduceMotion } = useSettings();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  const { shown, done, complete } = useTypewriter(step.text, reduceMotion);

  const measure = useCallback(() => {
    const el = findTarget(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({
      top: r.top - SPOT_PADDING,
      left: r.left - SPOT_PADDING,
      width: r.width + SPOT_PADDING * 2,
      height: r.height + SPOT_PADDING * 2,
    });
  }, [step.target]);

  useLayoutEffect(() => {
    findTarget(step.target)?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    measure();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [measure, step.target, reduceMotion]);

  // First press while the text is still typing reveals it all; the next one advances.
  const next = useCallback(() => {
    if (!done) complete();
    else if (isLast) onClose();
    else setIndex((i) => i + 1);
  }, [done, complete, isLast, onClose]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  // Keep the guide away from the highlighted element: above it when it sits low, below it otherwise.
  const placement: 'center' | 'top' | 'bottom' = !box
    ? 'center'
    : box.top + box.height / 2 > window.innerHeight / 2
      ? 'top'
      : 'bottom';

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="home-tour-title">
      {/* Click shield so the menu underneath can't be used mid-tour */}
      <div className="absolute inset-0" />

      {box ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed rounded-xl"
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{
            boxShadow:
              '0 0 0 9999px rgba(3,7,12,0.78), 0 0 0 2px rgb(var(--theme-400) / 0.9), 0 0 32px 6px rgb(var(--theme-400) / 0.45)',
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-cyan-300/60"
            animate={{ opacity: [0.9, 0.2, 0.9], scale: [1, 1.03, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      ) : (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-[rgba(3,7,12,0.78)] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      <div
        className={cn(
          'fixed left-1/2 -translate-x-1/2 w-[min(94vw,560px)] px-1',
          placement === 'center' && 'top-1/2 -translate-y-1/2',
          placement === 'top' && 'top-4 sm:top-6',
          placement === 'bottom' && 'bottom-4 sm:bottom-6',
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: placement === 'top' ? -16 : 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-end gap-3 sm:gap-4"
          >
            <Mascot mood={step.mood} talking={!done} alt={t('tour.mascotAlt')} />

            <div className="relative flex-1 min-w-0">
              {/* Bubble tail pointing at the mascot */}
              <span
                aria-hidden
                className="absolute -left-2 bottom-8 h-4 w-4 rotate-45 border-b border-l border-cyan-400/40 bg-[hsl(220,22%,11%)]"
              />
              <div
                className="relative rounded-2xl border border-cyan-400/40 bg-[hsl(220,22%,11%)] p-4 shadow-[0_0_40px_-8px_rgb(var(--theme-400)/0.45)] cursor-pointer"
                onClick={() => !done && complete()}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-display uppercase tracking-[0.2em] text-cyan-300/60">{t('tour.mascotName')}</span>
                  <span className="text-[10px] font-display tabular-nums text-cyan-300/40">
                    {t('tour.step', { current: index + 1, total: steps.length })}
                  </span>
                </div>
                <h2 id="home-tour-title" className="font-display text-sm sm:text-base tracking-wide text-cyan-50">
                  {step.title}
                </h2>
                <p className="sr-only" aria-live="polite">
                  {step.text}
                </p>
                <p aria-hidden className="mt-1.5 min-h-[4.5rem] text-xs sm:text-sm font-body leading-relaxed text-cyan-100/85">
                  {shown}
                  {!done && <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-cyan-300/80 animate-pulse" />}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex gap-1 mr-auto" aria-hidden>
                    {steps.map((s, i) => (
                      <span
                        key={s.id}
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          i === index ? 'w-4 bg-cyan-300' : i < index ? 'w-1.5 bg-cyan-500/60' : 'w-1.5 bg-cyan-900',
                        )}
                      />
                    ))}
                  </div>
                  {!isLast && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="px-2 py-1.5 text-[10px] font-display tracking-wider uppercase text-cyan-300/50 hover:text-cyan-100 transition-colors"
                    >
                      {t('tour.skip')}
                    </button>
                  )}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        back();
                      }}
                      className="px-3 py-1.5 rounded-md border border-cyan-500/20 text-[10px] font-display tracking-wider uppercase text-cyan-200/70 hover:text-cyan-50 hover:border-cyan-400/40 transition-colors"
                    >
                      {t('tour.back')}
                    </button>
                  )}
                  <button
                    type="button"
                    autoFocus
                    onClick={(e) => {
                      e.stopPropagation();
                      next();
                    }}
                    className="px-3.5 py-1.5 rounded-md bg-gradient-to-r from-cyan-600/90 to-cyan-800/90 hover:from-cyan-500 hover:to-cyan-700 border border-cyan-400/40 text-[10px] font-display tracking-wider uppercase text-white shadow-[0_0_14px_-4px_rgb(var(--theme-400)/0.7)] transition-all"
                  >
                    {isLast ? t('tour.finish') : t('tour.next')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

function Mascot({ mood, talking, alt }: { mood: string; talking: boolean; alt: string }) {
  return (
    <motion.div
      className="relative shrink-0 mb-1"
      animate={talking ? { y: [0, -5, 0], rotate: [0, -3, 3, 0] } : { y: [0, -3, 0], rotate: 0 }}
      transition={{ duration: talking ? 0.6 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full overflow-hidden border-2 border-cyan-300/70 bg-cyan-950 shadow-[0_0_24px_-2px_rgb(var(--theme-400)/0.6)]">
        <img src={DEFAULT_CARD_IMAGE} alt={alt} className="h-full w-full object-cover object-[50%_30%] scale-125" draggable={false} />
      </div>
      <motion.span
        key={mood}
        aria-hidden
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.15 }}
        className="absolute -top-1 -right-1 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[hsl(220,22%,11%)] border border-cyan-400/50 text-sm sm:text-base"
      >
        {mood}
      </motion.span>
    </motion.div>
  );
}
