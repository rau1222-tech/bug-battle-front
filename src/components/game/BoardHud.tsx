import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENERGY_PER_TURN, MAX_ROUNDS, ROUND_BONUS_CAP, ROUND_BONUS_DAMAGE_STEP, TURN_SECONDS } from '@/game/onlineEngine';
import { useI18n } from '@/i18n';

type Tone = 'player' | 'opponent';

const TONE = {
  player: {
    text: 'text-emerald-300',
    dim: 'text-emerald-300/70',
    orb: 'from-emerald-700/90 via-emerald-900/90 to-emerald-950 border-emerald-400/70',
    glow: 'shadow-[0_0_22px_rgba(52,211,153,0.45)]',
    pip: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
    dot: 'bg-emerald-400',
  },
  opponent: {
    text: 'text-rose-300',
    dim: 'text-rose-300/70',
    orb: 'from-rose-700/90 via-rose-900/90 to-rose-950 border-rose-400/70',
    glow: 'shadow-[0_0_22px_rgba(244,63,94,0.45)]',
    pip: 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]',
    dot: 'bg-rose-400',
  },
} as const;

/** Round icon button for the top bar. */
export function HudIconButton({ label, onClick, children, className = '' }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      className={`group w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center bg-black/50 border border-amber-900/40 text-amber-200/80 hover:text-amber-100 hover:border-amber-500/50 hover:bg-amber-900/30 transition-colors shadow-md shadow-black/40 ${className}`}
    >
      {children}
    </motion.button>
  );
}

interface ScoreboardProps {
  playerName: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  round: number;
  roundLabel: string;
  roundTooltip: string;
  isPlayerTurn: boolean;
}

export function Scoreboard({ playerName, opponentName, playerScore, opponentScore, round, roundLabel, roundTooltip, isPlayerTurn }: ScoreboardProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-4 min-w-0 bg-black/55 border border-amber-900/40 rounded-2xl px-2.5 sm:px-5 py-1 sm:py-1.5 shadow-lg shadow-black/50">
      <NameTag name={playerName} tone="player" active={isPlayerTurn} align="right" />
      <ScoreValue value={playerScore} tone="player" />
      <div className="flex flex-col items-center gap-0.5 shrink-0" title={roundTooltip}>
        <div className="flex gap-1">
          {Array.from({ length: MAX_ROUNDS }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-colors duration-500 ${
                i < round ? 'bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.8)]' : 'bg-amber-900/60'
              }`}
            />
          ))}
        </div>
        <span className="text-[8px] sm:text-[10px] font-display text-amber-200/60 tabular-nums tracking-wider whitespace-nowrap">{roundLabel}</span>
      </div>
      <ScoreValue value={opponentScore} tone="opponent" />
      <NameTag name={opponentName} tone="opponent" active={!isPlayerTurn} align="left" />
    </div>
  );
}

function NameTag({ name, tone, active, align }: { name: string; tone: Tone; active: boolean; align: 'left' | 'right' }) {
  const dot = (
    <span className="relative flex w-2 h-2 shrink-0">
      {active && <span className={`absolute inset-0 rounded-full ${TONE[tone].dot} animate-ping opacity-75`} />}
      <span className={`relative w-2 h-2 rounded-full ${active ? TONE[tone].dot : 'bg-stone-600'}`} />
    </span>
  );
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {dot}
      <span
        className={`hidden sm:block truncate max-w-[9rem] text-xs font-display tracking-wider transition-colors duration-300 ${
          active ? TONE[tone].text : 'text-amber-200/40'
        }`}
      >
        {name}
      </span>
    </div>
  );
}

function ScoreValue({ value, tone }: { value: number; tone: Tone }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.8, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      className={`text-lg sm:text-2xl font-display font-black tabular-nums ${TONE[tone].text}`}
    >
      {value}
    </motion.span>
  );
}

interface EnergyPanelProps {
  name: string;
  energy: number;
  max: number;
  tone: Tone;
  active: boolean;
  /** Energy gained next turn and bonus carried into next round (null hides the line). */
  nextTurn: number | null;
  nextRound: number | null;
}

export function EnergyPanel({ name, energy, max, tone, active, nextTurn, nextRound }: EnergyPanelProps) {
  const { t } = useI18n();
  const colors = TONE[tone];
  const prevEnergy = useRef(energy);
  const [delta, setDelta] = useState<{ key: number; value: number } | null>(null);

  useEffect(() => {
    const diff = energy - prevEnergy.current;
    prevEnergy.current = energy;
    if (diff !== 0) setDelta((d) => ({ key: (d?.key ?? 0) + 1, value: diff }));
  }, [energy]);

  const turnBonus = (nextTurn ?? 0) - ENERGY_PER_TURN;

  return (
    <div className="flex flex-col items-center gap-1 min-w-0" title={t('game.energyLabel', { current: energy, max })}>
      <span className={`max-w-[5.5rem] truncate text-[8px] sm:text-[10px] font-display tracking-wider ${active ? colors.text : 'text-amber-200/40'}`}>
        {name}
      </span>

      <div className="relative">
        <motion.div
          key={energy}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          className={`relative rounded-full border-2 bg-gradient-to-b ${colors.orb} flex flex-col items-center justify-center transition-shadow duration-500 ${
            active ? colors.glow : 'shadow-[0_4px_12px_rgba(0,0,0,0.5)]'
          }`}
          style={{ width: 'clamp(2.5rem, 7vh, 3.75rem)', height: 'clamp(2.5rem, 7vh, 3.75rem)' }}
        >
          <span className="absolute -top-2 text-[10px] sm:text-sm drop-shadow">⚡</span>
          <span className={`text-base sm:text-2xl font-display font-black tabular-nums leading-none ${colors.text}`}>{energy}</span>
          <span className={`text-[7px] sm:text-[9px] font-display tabular-nums leading-none ${colors.dim}`}>/{max}</span>
        </motion.div>

        <AnimatePresence>
          {delta && (
            <motion.span
              key={delta.key}
              initial={{ opacity: 1, y: 0, scale: 0.8 }}
              animate={{ opacity: 0, y: -26, scale: 1.15 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className={`absolute left-full top-0 ml-0.5 text-xs sm:text-sm font-display font-black tabular-nums pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                delta.value > 0 ? 'text-amber-300' : 'text-red-400'
              }`}
            >
              {delta.value > 0 ? `+${delta.value}` : delta.value}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-5 gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-sm transition-all duration-300 ${i < energy ? colors.pip : 'bg-black/50 border border-white/10'}`}
          />
        ))}
      </div>

      {/* Forecast — hidden on very short screens to keep the rail compact */}
      <div className="flex flex-col items-center gap-0.5 font-display tabular-nums text-[8px] sm:text-[10px] leading-none [@media(max-height:560px)]:hidden">
        {nextTurn !== null && (
          <span
            title={t('game.energy.nextTurn', { base: ENERGY_PER_TURN, bonus: turnBonus })}
            className={`px-1 py-0.5 rounded-sm bg-black/50 whitespace-nowrap ${turnBonus > 0 ? 'text-amber-300' : 'text-stone-300/70'}`}
          >
            ⏭ +{nextTurn}⚡
          </span>
        )}
        {nextRound !== null && (
          <span
            title={t('game.energy.nextRound', { step: ROUND_BONUS_DAMAGE_STEP, cap: ROUND_BONUS_CAP })}
            className={`px-1 py-0.5 rounded-sm bg-black/50 whitespace-nowrap ${nextRound > 0 ? 'text-sky-300' : 'text-stone-300/50'}`}
          >
            🔄 +{nextRound}⚡
          </span>
        )}
      </div>
    </div>
  );
}

interface EndTurnButtonProps {
  isPlayerTurn: boolean;
  disabled: boolean;
  /** Draws attention when the player has nothing left to spend. */
  urgent: boolean;
  secondsLeft: number | null;
  onClick: () => void;
}

/** End-turn plaque that sits on the board's centre line, with the turn timer as a ring. */
export function EndTurnButton({ isPlayerTurn, disabled, urgent, secondsLeft, onClick }: EndTurnButtonProps) {
  const { t } = useI18n();
  const ratio = secondsLeft === null ? null : Math.max(0, Math.min(1, secondsLeft / TURN_SECONDS));
  const lowTime = secondsLeft !== null && secondsLeft <= 15;
  const enabled = isPlayerTurn && !disabled;

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={!enabled}
        whileHover={enabled ? { scale: 1.06 } : undefined}
        whileTap={enabled ? { scale: 0.94 } : undefined}
        animate={enabled && urgent ? { boxShadow: ['0 0 0 0 rgba(251,191,36,0.0)', '0 0 26px 6px rgba(251,191,36,0.55)', '0 0 0 0 rgba(251,191,36,0.0)'] } : { boxShadow: '0 6px 18px rgba(0,0,0,0.55)' }}
        transition={enabled && urgent ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
        className={`relative rounded-full border-2 flex flex-col items-center justify-center font-display font-bold leading-tight tracking-wide text-center transition-colors duration-300 ${
          isPlayerTurn
            ? 'bg-gradient-to-b from-amber-500 to-amber-800 border-amber-300/80 text-amber-50 hover:from-amber-400 hover:to-amber-700 disabled:opacity-60'
            : 'bg-gradient-to-b from-stone-700 to-stone-900 border-stone-500/50 text-stone-400 cursor-not-allowed'
        }`}
        style={{ width: 'clamp(4.5rem, 11vh, 7rem)', height: 'clamp(2.75rem, 6.5vh, 4.25rem)' }}
      >
        {ratio !== null && (
          <span className="absolute -inset-[5px] pointer-events-none">
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full h-full">
              <rect x="2" y="2" width="96" height="56" rx="28" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              <rect
                x="2"
                y="2"
                width="96"
                height="56"
                rx="28"
                fill="none"
                pathLength={100}
                strokeDasharray={`${ratio * 100} 100`}
                strokeLinecap="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                className={`transition-[stroke-dasharray] duration-1000 ease-linear ${lowTime ? 'stroke-red-400' : isPlayerTurn ? 'stroke-amber-200' : 'stroke-rose-400/80'}`}
              />
            </svg>
          </span>
        )}
        {isPlayerTurn ? (
          <>
            <span className="text-[9px] sm:text-sm">{t('game.skipTurnLine1')}</span>
            <span className="text-[9px] sm:text-sm">{t('game.skipTurnLine2')}</span>
          </>
        ) : (
          <>
            <motion.span
              animate={{ rotate: [0, 180, 180, 360] }}
              transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.3, 0.5, 0.8] }}
              className="text-xs sm:text-base"
            >
              ⏳
            </motion.span>
            <span className="text-[8px] sm:text-[11px]">{t('game.rivalTurnButton')}</span>
          </>
        )}
      </motion.button>
      <span
        className={`h-3 sm:h-4 text-[9px] sm:text-xs font-display tabular-nums ${lowTime ? 'text-red-300 animate-pulse' : 'text-amber-200/60'}`}
      >
        {secondsLeft !== null ? `⏱ ${secondsLeft}s` : ''}
      </span>
    </div>
  );
}

/** Card-back fan showing how many cards the opponent holds; sized from --card-w. */
export function OpponentHand({ count }: { count: number }) {
  const { t } = useI18n();
  const shown = Math.min(count, 6);
  const label = t('game.handCount', { count });
  return (
    <div className="flex flex-col items-center gap-1.5" title={label} aria-label={label}>
      <div
        className="relative"
        style={{
          width: `calc(var(--card-w, 7rem) * ${0.5 + Math.max(shown - 1, 0) * 0.22})`,
          height: 'calc(var(--card-w, 7rem) * 0.72)',
        }}
      >
        <AnimatePresence>
          {Array.from({ length: shown }).map((_, i) => {
            const offset = i - (shown - 1) / 2;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -24, scale: 0.6 }}
                animate={{ opacity: 1, y: Math.abs(offset) * 3, rotate: -offset * 7, scale: 1 }}
                exit={{ opacity: 0, y: -24, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute top-0 rounded-md border border-amber-800/80 shadow-lg shadow-black/60 origin-top flex items-center justify-center overflow-hidden"
                style={{
                  left: `calc(var(--card-w, 7rem) * ${i * 0.22})`,
                  width: 'calc(var(--card-w, 7rem) * 0.5)',
                  height: 'calc(var(--card-w, 7rem) * 0.72)',
                  background: 'repeating-linear-gradient(45deg, hsl(30 35% 18%), hsl(30 35% 18%) 4px, hsl(30 40% 22%) 4px, hsl(30 40% 22%) 8px)',
                }}
              >
                <span className="absolute inset-[3px] rounded-[4px] border border-amber-700/40" />
                <span className="text-[10px] sm:text-sm text-amber-300/50">🐛</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <motion.span
        key={count}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 14 }}
        className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.35)] font-display font-black tabular-nums text-rose-100 text-xs sm:text-base leading-none"
      >
        <span className="text-[10px] sm:text-sm">✋</span>
        {count}
      </motion.span>
    </div>
  );
}

/** Short banner that sweeps across the board when the turn changes. */
export function TurnBanner({ bannerKey, isPlayerTurn, text }: { bannerKey: number; isPlayerTurn: boolean; text: string }) {
  return (
    <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-[45] pointer-events-none flex justify-center overflow-hidden">
      {/* Every transform ends at its identity value so reduced-motion (which skips transforms) still rests centred */}
      <motion.div
        key={bannerKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.7, times: [0, 0.15, 0.75, 1], ease: 'easeInOut' }}
        className="relative w-full flex justify-center px-4 py-3 sm:py-5"
      >
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`absolute inset-0 bg-gradient-to-r from-transparent ${
            isPlayerTurn ? 'via-emerald-950/90' : 'via-rose-950/90'
          } to-transparent`}
        />
        <motion.span
          initial={{ x: '-30%', scale: 0.9 }}
          animate={{ x: '0%', scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className={`relative text-center pl-[0.25em] text-xl sm:text-4xl font-display font-black tracking-[0.25em] ${
            isPlayerTurn ? 'text-emerald-200 drop-shadow-[0_0_18px_rgba(52,211,153,0.8)]' : 'text-rose-200 drop-shadow-[0_0_18px_rgba(244,63,94,0.8)]'
          }`}
        >
          {text}
        </motion.span>
      </motion.div>
    </div>
  );
}
