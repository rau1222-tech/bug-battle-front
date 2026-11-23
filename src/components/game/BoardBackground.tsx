import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

// Fixed layouts (no Math.random) so the scene is stable across renders.
const CODE_TOKENS = [
  { text: '{ }', left: '4%', size: 1.1, dur: 26, delay: -3, dx: '3vw', o: 0.13 },
  { text: '</>', left: '11%', size: 0.9, dur: 31, delay: -17, dx: '-2vw', o: 0.1 },
  { text: 'if (bug)', left: '19%', size: 0.75, dur: 24, delay: -9, dx: '2vw', o: 0.11 },
  { text: '0x1F', left: '27%', size: 0.8, dur: 34, delay: -25, dx: '-3vw', o: 0.09 },
  { text: '=>', left: '35%', size: 1.2, dur: 28, delay: -12, dx: '2vw', o: 0.1 },
  { text: 'null', left: '43%', size: 0.85, dur: 36, delay: -30, dx: '-1vw', o: 0.08 },
  { text: '// TODO', left: '52%', size: 0.75, dur: 27, delay: -6, dx: '3vw', o: 0.1 },
  { text: ';', left: '58%', size: 1.4, dur: 22, delay: -14, dx: '-2vw', o: 0.12 },
  { text: '404', left: '64%', size: 1, dur: 32, delay: -21, dx: '2vw', o: 0.1 },
  { text: 'try { }', left: '71%', size: 0.8, dur: 29, delay: -2, dx: '-3vw', o: 0.09 },
  { text: 'NaN', left: '78%', size: 0.95, dur: 25, delay: -19, dx: '1vw', o: 0.11 },
  { text: '01101', left: '85%', size: 0.75, dur: 35, delay: -8, dx: '-2vw', o: 0.08 },
  { text: '[ ]', left: '92%', size: 1.1, dur: 30, delay: -27, dx: '2vw', o: 0.12 },
  { text: 'git push', left: '47%', size: 0.7, dur: 38, delay: -36, dx: '-3vw', o: 0.07 },
  { text: '!==', left: '8%', size: 0.9, dur: 33, delay: -33, dx: '2vw', o: 0.09 },
  { text: 'undefined', left: '88%', size: 0.7, dur: 37, delay: -15, dx: '-2vw', o: 0.07 },
];

const BUGS = [
  { path: 'a', size: 26, dur: 46, delay: -8 },
  { path: 'b', size: 22, dur: 58, delay: -30 },
  { path: 'c', size: 18, dur: 40, delay: -22 },
  { path: 'd', size: 20, dur: 52, delay: -4 },
];

const PACKETS = [
  { top: '14%', dur: 9, delay: -2 },
  { top: '33%', dur: 12, delay: -7 },
  { top: '67%', dur: 10, delay: -4 },
  { top: '86%', dur: 13, delay: -10 },
];

function CrawlingBug({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.33} viewBox="0 0 24 32" className="board-bug-body" aria-hidden>
      <g stroke="rgba(252,211,77,0.55)" strokeWidth="1.2" strokeLinecap="round" fill="none">
        <path d="M10.5 5 Q8 2 6 1" />
        <path d="M13.5 5 Q16 2 18 1" />
        <g className="board-bug-legs-l">
          <path d="M7 13 L2 10" />
          <path d="M6 18 L1 18" />
          <path d="M7 23 L2 27" />
        </g>
        <g className="board-bug-legs-r">
          <path d="M17 13 L22 10" />
          <path d="M18 18 L23 18" />
          <path d="M17 23 L22 27" />
        </g>
      </g>
      <circle cx="12" cy="7.5" r="3" fill="rgba(252,211,77,0.35)" />
      <ellipse cx="12" cy="18.5" rx="6" ry="8.5" fill="rgba(252,211,77,0.25)" stroke="rgba(252,211,77,0.5)" strokeWidth="1" />
      <path d="M12 11 V27" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
      <circle cx="9.5" cy="16" r="1.2" fill="rgba(0,0,0,0.4)" />
      <circle cx="14.5" cy="21" r="1.2" fill="rgba(0,0,0,0.4)" />
    </svg>
  );
}

interface BoardBackgroundProps {
  isPlayerTurn: boolean;
  /** Changes on every turn switch to fire a ripple from the centre. */
  pulseKey: number;
}

/** Animated full-screen backdrop: code grid, rising code, crawling bugs and turn lighting. */
export default function BoardBackground({ isPlayerTurn, pulseKey }: BoardBackgroundProps) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#221d17_0%,#14110e_55%,#0a0807_100%)]" />

      <div className="board-grid absolute -inset-12" />

      {/* Each half lights up on its owner's turn */}
      <div
        className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-rose-600/20 via-rose-900/5 to-transparent transition-opacity duration-700"
        style={{ opacity: isPlayerTurn ? 0.3 : 1 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-600/20 via-emerald-900/5 to-transparent transition-opacity duration-700"
        style={{ opacity: isPlayerTurn ? 1 : 0.3 }}
      />

      {PACKETS.map((p, i) => (
        <div key={i} className="absolute inset-x-0" style={{ top: p.top }}>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-200/[0.06] to-transparent" />
          <span
            className="board-packet absolute -top-px left-0 h-[3px] w-24 rounded-full bg-gradient-to-r from-transparent via-amber-300/50 to-transparent"
            style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
          />
        </div>
      ))}

      {CODE_TOKENS.map((tok, i) => (
        <span
          key={i}
          className="board-token absolute top-full font-mono font-bold text-amber-200 whitespace-nowrap"
          style={{
            left: tok.left,
            fontSize: `${tok.size}rem`,
            animationDuration: `${tok.dur}s`,
            animationDelay: `${tok.delay}s`,
            '--dx': tok.dx,
            '--o': tok.o,
          } as CSSProperties}
        >
          {tok.text}
        </span>
      ))}

      {BUGS.map((b, i) => (
        <div
          key={i}
          className={`board-bug board-bug-${b.path} absolute left-0 top-0`}
          style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
        >
          <CrawlingBug size={b.size} />
        </div>
      ))}

      <div className="board-scan absolute inset-x-0 top-0 h-[28vh] bg-gradient-to-b from-transparent via-amber-200/[0.035] to-transparent" />

      {/* Turn-change shockwave from the Bug */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          key={pulseKey}
          initial={{ scale: 0.2, opacity: 0.7 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          className={`w-[30vmin] h-[30vmin] rounded-full border-2 ${
            isPlayerTurn ? 'border-emerald-400/60 shadow-[0_0_40px_rgba(52,211,153,0.4)]' : 'border-rose-400/60 shadow-[0_0_40px_rgba(244,63,94,0.4)]'
          }`}
        />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.75)_100%)]" />
    </div>
  );
}
