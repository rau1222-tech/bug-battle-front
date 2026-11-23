import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Bug, Crosshair, Hourglass, Lock, Swords, Target, Users, X, Zap } from 'lucide-react';
import type { SkillTarget } from '@/constants';
import { useI18n } from '@/i18n';

export interface CardAction {
  id: string;
  icon: 'attack' | 'qa-attack' | SkillTarget;
  name: string;
  description: string;
  cost: number;
  power?: number;
  duration?: number;
  /** Why the action can't be used right now (shown in red, row disabled). */
  blocked?: string;
}

interface ActionMenuProps {
  /** `data-card-id` of the table slot the bubble points at. */
  anchorId: string;
  title: string;
  energy: number;
  actions: CardAction[];
  onSelect: (actionId: string) => void;
  onCancel: () => void;
}

const ICONS = {
  attack: Swords,
  'qa-attack': Crosshair,
  bug: Bug,
  carta_aliada: Users,
  carta_enemiga: Target,
} as const;

const EDGE_PX = 8;
/** Room between the slot and the tail, so a raised selected card doesn't cover it. */
const GAP_PX = 22;

/**
 * Speech-bubble menu above a table card. Portalled to <body>: table slots are size
 * containers, which would otherwise trap the fixed backdrop and the z-index.
 */
export default function ActionMenu({ anchorId, title, energy, actions, onSelect, onCancel }: ActionMenuProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; shift: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(anchorId)}"]`);
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const r = anchor.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const half = panel.offsetWidth / 2;
      const shift = Math.min(Math.max(cx, EDGE_PX + half), window.innerWidth - EDGE_PX - half) - cx;
      setPos({ left: cx, bottom: window.innerHeight - r.top + GAP_PX, shift, maxHeight: r.top - GAP_PX - EDGE_PX });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorId]);

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <motion.div
        initial={{ opacity: 0, x: '-50%', y: 14, scale: 0.85 }}
        animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
        exit={{ opacity: 0, x: '-50%', y: 10, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="fixed z-50 w-[min(19rem,calc(100vw-1rem))] origin-bottom"
        style={{
          left: (pos?.left ?? 0) + (pos?.shift ?? 0),
          bottom: pos?.bottom ?? 0,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        <div
          ref={panelRef}
          className="relative flex flex-col rounded-2xl border border-amber-500/45 bg-gradient-to-b from-stone-900/95 via-stone-950/95 to-black/95 shadow-[0_18px_50px_rgba(0,0,0,0.75),0_0_24px_rgba(251,191,36,0.15),inset_0_1px_0_rgba(253,230,138,0.15)] backdrop-blur-md"
          style={{ maxHeight: pos?.maxHeight }}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-amber-700/30">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-display tracking-[0.25em] uppercase text-amber-400/70">{t('game.menu.title')}</p>
              <p className="truncate font-display font-black text-sm text-amber-50 leading-tight">{title}</p>
            </div>
            <span
              title={t('game.menu.energy')}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-950/70 px-2 py-0.5 font-display font-black text-xs text-amber-200 tabular-nums"
            >
              <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
              {energy}
            </span>
            <button
              type="button"
              onClick={onCancel}
              aria-label={t('game.menu.cancel')}
              className="shrink-0 rounded-full p-1 text-amber-200/50 hover:text-amber-100 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="min-h-0 overflow-y-auto p-2 space-y-1.5">
            {actions.map((action, i) => (
              <ActionRow key={action.id} action={action} index={i} energy={energy} onSelect={onSelect} />
            ))}
          </div>
        </div>

        {/* Tail pointing at the card */}
        <span
          aria-hidden
          className="absolute top-full w-3.5 h-3.5 -mt-[7px] rotate-45 border-r border-b border-amber-500/45 bg-black"
          style={{ left: `calc(50% - 7px - ${pos?.shift ?? 0}px)` }}
        />
      </motion.div>
    </>,
    document.body,
  );
}

function ActionRow({ action, index, energy, onSelect }: { action: CardAction; index: number; energy: number; onSelect: (id: string) => void }) {
  const Icon = ICONS[action.icon];
  const blocked = Boolean(action.blocked);
  const isAttack = action.icon === 'attack' || action.icon === 'qa-attack';
  return (
    <motion.button
      type="button"
      disabled={blocked}
      aria-disabled={blocked}
      onClick={() => onSelect(action.id)}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + index * 0.05 }}
      whileHover={blocked ? undefined : { x: 2 }}
      whileTap={blocked ? undefined : { scale: 0.98 }}
      className={`w-full flex items-start gap-2.5 rounded-xl border p-2 text-left transition-colors ${
        blocked
          ? 'cursor-not-allowed border-red-900/40 bg-stone-900/60'
          : 'border-amber-700/30 bg-white/[0.03] hover:border-amber-400/60 hover:bg-amber-500/10 hover:shadow-[0_0_16px_rgba(251,191,36,0.15)]'
      }`}
    >
      <div
        className={`relative shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${
          blocked
            ? 'border-stone-600/50 bg-stone-800/70 text-stone-500'
            : isAttack
              ? 'border-red-400/50 bg-gradient-to-br from-red-500/30 to-red-950/60 text-red-200'
              : 'border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/30 to-purple-950/60 text-fuchsia-200'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
        {blocked && (
          <Lock className="absolute -bottom-1 -right-1 w-4 h-4 p-0.5 rounded-full bg-red-900 text-red-200 border border-red-500/60" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`flex-1 min-w-0 font-display font-bold text-[13px] leading-tight ${blocked ? 'text-stone-400' : 'text-amber-50'}`}>
            {action.name}
          </p>
          <span
            className={`shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px font-display font-black text-[11px] tabular-nums ${
              energy < action.cost ? 'border-red-500/50 bg-red-950/60 text-red-300' : 'border-amber-400/50 bg-amber-950/60 text-amber-200'
            }`}
          >
            <Zap className="w-2.5 h-2.5 fill-current" />
            {action.cost}
          </span>
        </div>
        <p className={`mt-0.5 text-[11px] font-body leading-snug ${blocked ? 'text-stone-500' : 'text-amber-100/60'}`}>{action.description}</p>
        {(action.power !== undefined || action.duration !== undefined) && (
          <div className="mt-1 flex gap-2 text-[10px] font-display">
            {action.power !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-red-300/90">
                <Swords className="w-3 h-3" />
                {action.power}
              </span>
            )}
            {action.duration !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-sky-300/90">
                <Hourglass className="w-3 h-3" />
                {action.duration}
              </span>
            )}
          </div>
        )}
        {action.blocked && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-950/60 border border-red-500/40 px-1.5 py-0.5 text-[10px] font-display font-bold tracking-wide text-red-300">
            {action.blocked}
          </p>
        )}
      </div>
    </motion.button>
  );
}
