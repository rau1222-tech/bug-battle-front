import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, ScrollText, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ActionLogProps {
  entries: { id: number; text: string }[];
}

export default function ActionLog({ entries }: ActionLogProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(!isMobile);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, expanded]);

  const lastEntry = entries[entries.length - 1];

  // ===== MOBILE =====
  if (isMobile) {
    return (
      <>
        {/* Floating button */}
        <button
          onClick={() => setExpanded(true)}
          className="absolute bottom-[23%] left-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-amber-900/40 shadow-lg shadow-black/40 active:scale-95 transition-transform"
          aria-label="Abrir registro"
        >
          <ScrollText className="w-3.5 h-3.5 text-amber-300/80" />
          <span className="text-[10px] font-display tracking-[0.15em] text-amber-200/80 uppercase">
            Log
          </span>
          {entries.length > 0 && (
            <span className="text-[9px] font-body text-amber-100/60 bg-amber-900/40 rounded-full px-1.5 py-px min-w-[16px] text-center">
              {entries.length}
            </span>
          )}
        </button>

        {/* Fullscreen-ish overlay */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full h-[85vh] bg-stone-950/95 border-t-2 border-amber-700/40 rounded-t-2xl shadow-2xl shadow-black/60 flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/40">
                  <div className="flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-amber-300/80" />
                    <span className="text-sm font-display tracking-[0.2em] text-amber-200 uppercase">
                      Registro
                    </span>
                    <span className="text-[10px] font-body text-amber-200/50">
                      ({entries.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setExpanded(false)}
                    className="p-1.5 rounded-md hover:bg-amber-900/30 active:bg-amber-900/50 transition-colors"
                    aria-label="Cerrar registro"
                  >
                    <X className="w-5 h-5 text-amber-200/80" />
                  </button>
                </div>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
                >
                  {entries.length === 0 ? (
                    <div className="text-xs font-body text-amber-200/40 italic text-center mt-8">
                      Sin acciones aún…
                    </div>
                  ) : (
                    entries.map((entry, i) => {
                      const isLast = i === entries.length - 1;
                      return (
                        <div
                          key={entry.id}
                          className={`text-xs font-body leading-relaxed pl-2 border-l-2 ${
                            isLast
                              ? 'text-amber-100 border-amber-400/70'
                              : 'text-amber-200/60 border-amber-900/40'
                          }`}
                        >
                          {entry.text}
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ===== DESKTOP =====
  return (
    <div className="fixed bottom-3 left-3 z-20 w-[24%] max-w-[300px] pointer-events-auto">
      <div className="bg-black/45 backdrop-blur-sm border border-amber-900/30 rounded-lg shadow-lg shadow-black/40 overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 border-b border-amber-900/30 hover:bg-amber-900/20 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <ScrollText className="w-3 h-3 text-amber-300/70" />
            <span className="text-[10px] font-display text-amber-300/70 tracking-[0.2em] uppercase">
              Registro
            </span>
            <span className="text-[9px] font-body text-amber-200/40">
              ({entries.length})
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-amber-300/60" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-amber-300/60" />
          )}
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                ref={scrollRef}
                className="max-h-48 overflow-y-auto px-2.5 py-1.5 space-y-1"
              >
                <AnimatePresence initial={false}>
                  {entries.map((entry, i) => {
                    const isLast = i === entries.length - 1;
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-[11px] font-body leading-snug ${
                          isLast ? 'text-amber-100' : 'text-amber-200/55'
                        }`}
                      >
                        {entry.text}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {entries.length === 0 && (
                  <div className="text-[11px] font-body text-amber-200/40 italic">
                    Sin acciones aún…
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            lastEntry && (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-2.5 py-1.5 text-[11px] font-body text-amber-100/80 truncate"
              >
                {lastEntry.text}
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
