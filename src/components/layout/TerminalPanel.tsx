import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PanelAccent = 'cyan' | 'purple' | 'emerald';

const ACCENTS: Record<PanelAccent, { border: string; divider: string; path: string; glow: string; prompt: string }> = {
  cyan: {
    border: 'border-cyan-500/20',
    divider: 'border-cyan-500/10',
    path: 'text-cyan-400/50',
    glow: 'shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.15)]',
    prompt: 'text-green-400/60',
  },
  purple: {
    border: 'border-purple-500/20',
    divider: 'border-purple-500/10',
    path: 'text-purple-400/50',
    glow: 'shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.15)]',
    prompt: 'text-purple-400/60',
  },
  emerald: {
    border: 'border-emerald-500/15',
    divider: 'border-emerald-500/10',
    path: 'text-emerald-400/50',
    glow: 'shadow-[0_0_40px_-10px_hsl(150,80%,45%,0.12)]',
    prompt: 'text-emerald-400/60',
  },
};

interface TerminalPanelProps {
  path: ReactNode;
  accent?: PanelAccent;
  footer?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Terminal-window chrome (traffic lights + path, optional prompt footer) shared by the menu screens. */
export default function TerminalPanel({
  path,
  accent = 'cyan',
  footer,
  actions,
  className,
  bodyClassName,
  children,
}: TerminalPanelProps) {
  const a = ACCENTS[accent];
  return (
    <div className={cn('flex flex-col rounded-lg border bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden', a.border, a.glow, className)}>
      <div className={cn('flex items-center gap-2 px-4 py-2 border-b bg-[hsl(220,18%,10%)]', a.divider)}>
        <div className="flex gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className={cn('ml-2 text-[10px] font-body tracking-wider uppercase truncate', a.path)}>{path}</span>
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className={cn('flex-1 p-4', bodyClassName)}>{children}</div>
      {footer && (
        <div className={cn('px-4 py-2 border-t bg-[hsl(220,18%,10%)]', a.divider)}>
          <p className={cn('text-[10px] font-body flex items-center gap-1', a.path)}>
            <span className={a.prompt}>❯</span> {footer}
          </p>
        </div>
      )}
    </div>
  );
}
