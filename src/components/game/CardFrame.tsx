import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Brain, Crosshair, Crown, FlaskConical, Hourglass, Sparkles, Swords, Zap } from 'lucide-react';
import { CardInstance, DEFAULT_CARD_IMAGE, calcularPotenciaReal, resolveCardImage } from '@/constants';
import { getRarity, type Rarity } from '@/hooks/useCollection';
import { useI18n } from '@/i18n';

interface FrameStyle {
  /** Frame fill (border area). */
  frame: string;
  accent: string;
  glow: string;
  /** Border thickness in cqw. */
  pad: number;
  outerClip?: string;
  innerClip?: string;
}

const CHAMFER = 'polygon(9% 0, 91% 0, 100% 6.4%, 100% 93.6%, 91% 100%, 9% 100%, 0 93.6%, 0 6.4%)';
const NOTCHED = 'polygon(9% 0, 91% 0, 100% 6.4%, 100% 45%, 96.5% 50%, 100% 55%, 100% 93.6%, 91% 100%, 9% 100%, 0 93.6%, 0 55%, 3.5% 50%, 0 45%, 0 6.4%)';
const CRESTED = 'polygon(9% 1.8%, 40% 1.8%, 50% 0, 60% 1.8%, 91% 1.8%, 100% 8%, 100% 45%, 96.5% 50%, 100% 55%, 100% 92%, 91% 98.2%, 60% 98.2%, 50% 100%, 40% 98.2%, 9% 98.2%, 0 92%, 0 55%, 3.5% 50%, 0 45%, 0 8%)';

const FRAME_STYLES: Record<Rarity, FrameStyle> = {
  comun: {
    frame: 'linear-gradient(160deg, #e7e5e4 0%, #a8a29e 30%, #57534e 65%, #a8a29e 100%)',
    accent: '#d6d3d1',
    glow: 'rgba(214, 211, 209, 0)',
    pad: 3.5,
  },
  raro: {
    frame: 'linear-gradient(160deg, #dbeafe 0%, #3b82f6 30%, #1e3a8a 62%, #60a5fa 100%)',
    accent: '#93c5fd',
    glow: 'rgba(59, 130, 246, 0.55)',
    pad: 4.5,
    outerClip: CHAMFER,
    innerClip: CHAMFER,
  },
  epico: {
    frame: 'linear-gradient(150deg, #fae8ff 0%, #c084fc 25%, #6b21a8 55%, #3b0764 75%, #e879f9 100%)',
    accent: '#f0abfc',
    glow: 'rgba(192, 132, 252, 0.65)',
    pad: 5,
    outerClip: NOTCHED,
    innerClip: CHAMFER,
  },
  legendario: {
    frame: 'conic-gradient(from var(--frame-angle), #fde68a, #f59e0b, #fffbeb, #b45309, #fcd34d, #92400e, #fde68a)',
    accent: '#fde68a',
    glow: 'rgba(251, 191, 36, 0.75)',
    pad: 5.5,
    outerClip: CRESTED,
    innerClip: CHAMFER,
  },
};

interface CardFrameProps {
  card: CardInstance;
  /** On the table: plays the landing burst and shows the "already acted" state. */
  onBoard?: boolean;
}

const NAME_H = 13;

/** Image card with a rarity frame; full text lives in the inspector. */
export default function CardFrame({ card, onBoard = false }: CardFrameProps) {
  const { cardName } = useI18n();
  const { definition } = card;
  const name = cardName(definition);
  const rarity = getRarity(definition);
  const style = FRAME_STYLES[rarity];
  const isConsumible = definition.tipo === 'consumible';
  const hasCordura = !isConsumible && (definition.corduraMax ?? 0) > 0;
  const power = calcularPotenciaReal(card);
  const basePower = definition.potencia ?? 0;
  const exhausted = onBoard && !card.disponible;

  // Floating +/- number and shake whenever cordura changes
  const [prevCordura, setPrevCordura] = useState(card.cordura);
  const [pulse, setPulse] = useState<{ delta: number; key: number } | null>(null);
  if (card.cordura !== prevCordura) {
    setPulse({ delta: card.cordura - prevCordura, key: (pulse?.key ?? 0) + 1 });
    setPrevCordura(card.cordura);
  }
  const shake = useAnimationControls();
  useEffect(() => {
    if (pulse && pulse.delta < 0) {
      void shake.start({ x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.4 } });
    }
  }, [pulse, shake]);

  const shadow = rarity === 'comun'
    ? 'drop-shadow(0 1cqw 2.5cqw rgba(0,0,0,0.65))'
    : `drop-shadow(0 1cqw 2.5cqw rgba(0,0,0,0.65)) drop-shadow(0 0 3cqw ${style.glow})`;
  const pad = `${style.pad}cqw`;
  const plateInset = `${style.pad + 2.5}cqw`;
  const nameBottom = style.pad + 1.5;

  return (
    <motion.div animate={shake} className="absolute inset-0 pointer-events-none">
      {/* Frame + art (clipped together, glow via filter on the wrapper) */}
      <div className="absolute inset-0" style={{ filter: shadow }}>
        <div
          className={`absolute inset-0 overflow-hidden ${rarity === 'legendario' ? 'frame-legendary' : ''}`}
          style={{
            background: style.frame,
            clipPath: style.outerClip,
            borderRadius: style.outerClip ? undefined : '7cqw',
          }}
        >
          {(rarity === 'epico' || rarity === 'legendario') && <div aria-hidden className="absolute inset-0 frame-sheen" />}
          <div
            className="absolute overflow-hidden bg-stone-900"
            style={{
              inset: pad,
              clipPath: style.innerClip,
              borderRadius: style.innerClip ? undefined : '4.5cqw',
              boxShadow: `inset 0 0 0 0.9cqw ${style.accent}66, inset 0 0 6cqw rgba(0,0,0,0.6)`,
            }}
          >
            <img
              src={resolveCardImage(definition.image)}
              alt={name}
              className="w-full h-full object-cover transition-[filter] duration-500"
              style={{ filter: exhausted ? 'grayscale(0.75) brightness(0.6)' : undefined }}
              onError={(event) => {
                const img = event.currentTarget;
                if (img.dataset.fallbackApplied === 'true') return;
                img.dataset.fallbackApplied = 'true';
                img.src = DEFAULT_CARD_IMAGE;
              }}
              draggable={false}
            />
            {/* Bottom shade keeps the cordura plate readable over any art */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
            {rarity === 'legendario' && <div aria-hidden className="absolute inset-0 card-holo" />}
            <AnimatePresence>
              {pulse && (
                <motion.div
                  key={pulse.key}
                  initial={{ opacity: 0.75 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.7 }}
                  className={`absolute inset-0 ${pulse.delta < 0 ? 'bg-red-600' : 'bg-emerald-400'}`}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <FrameOrnaments rarity={rarity} accent={style.accent} />

      {/* Exhausted marker */}
      {exhausted && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/60 border border-white/15 p-[3cqw]">
            <Hourglass className="w-[14cqw] h-[14cqw] text-stone-200/85" />
          </div>
        </div>
      )}

      {/* Cost — top left; already paid once on the table */}
      {!onBoard && (
        <div className="absolute -top-[4cqw] -left-[4cqw] w-[29cqw] h-[29cqw] z-10">
          <div
            className="w-full h-full rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_35%_30%,#fef3c7,#f59e0b_50%,#78350f)] shadow-[0_1cqw_3cqw_rgba(0,0,0,0.7)]"
            style={{ border: `1.6cqw solid ${style.accent}` }}
          >
            <span className="font-display font-black text-[length:15cqw] leading-none text-amber-950 tabular-nums">{definition.coste}</span>
          </div>
          <Zap className="absolute -bottom-[1.5cqw] -right-[1.5cqw] w-[12cqw] h-[12cqw] p-[1.5cqw] rounded-full bg-amber-950 text-amber-300 fill-amber-300 border border-amber-400/60" />
        </div>
      )}

      {/* Power / type — top right */}
      <div className="absolute -top-[4cqw] -right-[4cqw] w-[29cqw] h-[29cqw] z-10">
        {isConsumible ? (
          <div
            className="w-full h-full rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_35%_30%,#cffafe,#06b6d4_50%,#164e63)] shadow-[0_1cqw_3cqw_rgba(0,0,0,0.7)]"
            style={{ border: `1.6cqw solid ${style.accent}` }}
          >
            <FlaskConical className="w-[14cqw] h-[14cqw] text-cyan-950" />
          </div>
        ) : (
          <>
            <div
              className={`w-full h-full rounded-full flex items-center justify-center shadow-[0_1cqw_3cqw_rgba(0,0,0,0.7)] ${
                definition.tipo === 'qa'
                  ? 'bg-[radial-gradient(circle_at_35%_30%,#ccfbf1,#0d9488_50%,#134e4a)]'
                  : 'bg-[radial-gradient(circle_at_35%_30%,#fecaca,#dc2626_50%,#7f1d1d)]'
              }`}
              style={{ border: `1.6cqw solid ${style.accent}` }}
            >
              <motion.span
                key={power}
                initial={{ scale: 1.6 }}
                animate={{ scale: 1 }}
                className={`font-display font-black text-[length:15cqw] leading-none tabular-nums drop-shadow-[0_0.5cqw_0.5cqw_rgba(0,0,0,0.6)] ${
                  power > basePower ? 'text-emerald-200' : power < basePower ? 'text-red-200' : 'text-white'
                }`}
              >
                {power}
              </motion.span>
            </div>
            {definition.tipo === 'qa' ? (
              <Crosshair className="absolute -bottom-[1.5cqw] -left-[1.5cqw] w-[12cqw] h-[12cqw] p-[1.5cqw] rounded-full bg-teal-950 text-teal-200 border border-teal-400/60" />
            ) : (
              <Swords className="absolute -bottom-[1.5cqw] -left-[1.5cqw] w-[12cqw] h-[12cqw] p-[1.5cqw] rounded-full bg-red-950 text-red-200 border border-red-400/60" />
            )}
          </>
        )}
      </div>

      {/* Active effects */}
      {card.efectosActivos.length > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-[27cqw] right-[1cqw] z-10 rounded-full bg-fuchsia-950/90 border border-fuchsia-300/70 p-[1.8cqw] shadow-[0_0_3cqw_rgba(232,121,249,0.7)]"
        >
          <Sparkles className="w-[9cqw] h-[9cqw] text-fuchsia-200 animate-pulse" />
        </motion.div>
      )}

      {/* Name ribbon — bottom */}
      <div
        className="absolute z-10 flex items-center justify-center px-[2cqw] rounded-[2cqw] shadow-[0_1cqw_2cqw_rgba(0,0,0,0.6)]"
        style={{
          left: `${style.pad * 0.4}cqw`,
          right: `${style.pad * 0.4}cqw`,
          bottom: `${nameBottom}cqw`,
          height: `${NAME_H}cqw`,
          background: 'linear-gradient(180deg, rgba(28,25,23,0.82), rgba(12,10,9,0.95))',
          borderTop: `0.7cqw solid ${style.accent}`,
          borderBottom: `0.7cqw solid ${style.accent}`,
        }}
      >
        <span
          className="font-display font-bold uppercase text-center leading-[1.05] tracking-wide text-amber-50 line-clamp-2 break-words drop-shadow-[0_0.5cqw_0.5cqw_rgba(0,0,0,0.9)]"
          style={{ fontSize: name.length > 13 ? '5.8cqw' : '7.5cqw' }}
        >
          {name}
        </span>
      </div>

      {/* Cordura plate — above the name */}
      {hasCordura && (
        <CorduraPlate
          current={card.cordura}
          max={definition.corduraMax ?? 0}
          style={{ left: plateInset, right: plateInset, bottom: `${nameBottom + NAME_H + 1.5}cqw` }}
        />
      )}

      {/* Floating delta */}
      <AnimatePresence>
        {pulse && (
          <motion.span
            key={pulse.key}
            initial={{ opacity: 0, x: '-50%', y: '0cqw', scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], x: '-50%', y: '-22cqw', scale: 1.15 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className={`absolute left-1/2 top-[45%] z-20 font-display font-black text-[length:20cqw] leading-none drop-shadow-[0_1cqw_1.5cqw_rgba(0,0,0,0.9)] ${
              pulse.delta < 0 ? 'text-red-400' : 'text-emerald-300'
            }`}
          >
            {pulse.delta > 0 ? `+${pulse.delta}` : pulse.delta}
          </motion.span>
        )}
      </AnimatePresence>

      {onBoard && <SummonBurst accent={style.accent} big={rarity === 'epico' || rarity === 'legendario'} />}
    </motion.div>
  );
}

function CorduraPlate({ current, max, style }: { current: number; max: number; style: CSSProperties }) {
  const ratio = max > 0 ? current / max : 0;
  const color = current >= max ? '#34d399' : ratio <= 0.34 || current <= 1 ? '#ef4444' : '#f59e0b';
  return (
    <div
      className="absolute z-10 flex items-center gap-[2cqw] rounded-full bg-black/75 border border-white/15 px-[2.5cqw] py-[1.6cqw] shadow-[0_1cqw_2cqw_rgba(0,0,0,0.6)]"
      style={style}
    >
      <Brain className="shrink-0 w-[10cqw] h-[10cqw]" style={{ color }} />
      <span className="shrink-0 font-display font-black text-[length:11cqw] leading-none tabular-nums" style={{ color }}>
        {current}
      </span>
      {max <= 8 ? (
        <div className="flex-1 flex gap-[1.2cqw]">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className="flex-1 h-[3.6cqw] rounded-full transition-colors duration-300"
              style={{ backgroundColor: i < current ? color : 'rgba(120,113,108,0.45)', boxShadow: i < current ? `0 0 1.5cqw ${color}` : undefined }}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 h-[3.6cqw] rounded-full bg-stone-600/50 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  );
}

function Gem({ className, color, size }: { className: string; color: string; size: number }) {
  return (
    <span
      aria-hidden
      className={`absolute rotate-45 rounded-[1cqw] ${className}`}
      style={{
        width: `${size}cqw`,
        height: `${size}cqw`,
        background: `radial-gradient(circle at 30% 30%, #fff, ${color} 45%, rgba(0,0,0,0.6))`,
        border: '0.8cqw solid rgba(255,255,255,0.55)',
        boxShadow: `0 0 2.5cqw ${color}`,
      }}
    />
  );
}

function FrameOrnaments({ rarity, accent }: { rarity: Rarity; accent: string }) {
  if (rarity === 'comun') return null;
  if (rarity === 'raro') {
    return <Gem color={accent} size={7} className="-top-[2.5cqw] left-1/2 -ml-[3.5cqw]" />;
  }
  if (rarity === 'epico') {
    return (
      <>
        <Gem color="#e879f9" size={10} className="-top-[4cqw] left-1/2 -ml-[5cqw]" />
        <Gem color="#c084fc" size={6} className="top-1/2 -mt-[3cqw] -left-[1.5cqw]" />
        <Gem color="#c084fc" size={6} className="top-1/2 -mt-[3cqw] -right-[1.5cqw]" />
      </>
    );
  }
  return (
    <>
      <Crown
        aria-hidden
        className="absolute -top-[11cqw] left-1/2 -ml-[8cqw] w-[16cqw] h-[16cqw] text-amber-200 fill-amber-400 drop-shadow-[0_0_2.5cqw_rgba(251,191,36,0.95)]"
      />
      <Gem color="#fbbf24" size={7} className="top-1/2 -mt-[3.5cqw] -left-[2cqw]" />
      <Gem color="#fbbf24" size={7} className="top-1/2 -mt-[3.5cqw] -right-[2cqw]" />
      <Gem color="#f59e0b" size={6} className="-bottom-[2.5cqw] left-1/2 -ml-[3cqw]" />
      {[
        'top-[18%] left-[6%]',
        'top-[62%] right-[5%]',
        'bottom-[24%] left-[10%]',
      ].map((pos, i) => (
        <span
          key={pos}
          aria-hidden
          className={`absolute ${pos} w-[3cqw] h-[3cqw] rounded-full bg-amber-100 card-twinkle`}
          style={{ animationDelay: `${i * 0.7}s`, boxShadow: '0 0 3cqw 1cqw rgba(253,230,138,0.9)' }}
        />
      ))}
    </>
  );
}

function SummonBurst({ accent, big }: { accent: string; big: boolean }) {
  return (
    <>
      <motion.span
        aria-hidden
        initial={{ opacity: 0.9, scale: 0.8 }}
        animate={{ opacity: 0, scale: big ? 1.9 : 1.5 }}
        transition={{ duration: big ? 0.9 : 0.6, ease: 'easeOut' }}
        className="absolute inset-0 rounded-[10cqw]"
        style={{ border: `2cqw solid ${accent}`, boxShadow: `0 0 6cqw ${accent}` }}
      />
      {big && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute -inset-[10cqw] rounded-full"
          style={{ background: `radial-gradient(circle, ${accent}aa, transparent 65%)` }}
        />
      )}
    </>
  );
}
