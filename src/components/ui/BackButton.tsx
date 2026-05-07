import { motion } from 'framer-motion';

interface BackButtonProps {
  onClick: () => void;
  color?: 'purple' | 'emerald' | 'cyan';
}

const colorMap = {
  purple: {
    text: 'text-purple-400/70 hover:text-purple-300',
    cmd: 'text-purple-300/90',
    border: 'border-purple-500/15 hover:border-purple-500/30',
    bg: 'hover:bg-purple-500/5',
    cursor: 'text-purple-400',
  },
  emerald: {
    text: 'text-emerald-400/70 hover:text-emerald-300',
    cmd: 'text-emerald-300/90',
    border: 'border-emerald-500/15 hover:border-emerald-500/30',
    bg: 'hover:bg-emerald-500/5',
    cursor: 'text-emerald-400',
  },
  cyan: {
    text: 'text-cyan-400/70 hover:text-cyan-300',
    cmd: 'text-cyan-300/90',
    border: 'border-cyan-500/15 hover:border-cyan-500/30',
    bg: 'hover:bg-cyan-500/5',
    cursor: 'text-cyan-400',
  },
};

export default function BackButton({ onClick, color = 'cyan' }: BackButtonProps) {
  const scheme = colorMap[color];

  return (
    <motion.button
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-[hsl(220,18%,10%)]/80 backdrop-blur-sm transition-all ${scheme.border} ${scheme.bg}`}
    >
      <span className={`font-body text-xs ${scheme.cursor} opacity-80`}>❯</span>
      <span className={`font-mono text-xs tracking-wide ${scheme.cmd}`}>cd ..</span>
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'steps(2)' }}
        className={`inline-block w-[6px] h-3.5 ${scheme.cursor} bg-current opacity-60 ml-0.5`}
      />
    </motion.button>
  );
}
