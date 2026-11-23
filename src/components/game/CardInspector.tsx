import { useEffect, useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Brain, Bug, Crosshair, Shield, Sparkles, Swords, Target, Users, Zap } from 'lucide-react';
import { SKILLS, calcularPotenciaReal, type CardInstance, type SkillTarget } from '@/constants';
import { getRarity, RARITY_COLORS, RARITY_LABELS, type Rarity } from '@/hooks/useCollection';
import { useI18n } from '@/i18n';
import CardFrame from './CardFrame';

interface CardInspectorProps {
  card: CardInstance;
  side: 'ally' | 'enemy';
  onClose: () => void;
}

const PANEL_TINT: Record<Rarity, string> = {
  comun: 'from-stone-500/25 border-stone-400/40',
  raro: 'from-blue-600/30 border-blue-400/50',
  epico: 'from-purple-600/35 border-purple-400/55',
  legendario: 'from-amber-500/30 border-amber-300/60',
};

const TARGET_ICON: Record<SkillTarget, typeof Bug> = {
  bug: Bug,
  carta_aliada: Users,
  carta_enemiga: Target,
};

/** Ignore the click produced by releasing the long press that opened us. */
const CLOSE_GUARD_MS = 250;

export default function CardInspector({ card, side, onClose }: CardInspectorProps) {
  const { t, cardName, cardDescription, skillName, skillDescription } = useI18n();
  const openedAt = useRef(Date.now());
  const { definition } = card;
  const rarity = getRarity(definition);
  const isConsumible = definition.tipo === 'consumible';
  const power = calcularPotenciaReal(card);
  const basePower = definition.potencia ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleClose = () => {
    if (Date.now() - openedAt.current < CLOSE_GUARD_MS) return;
    onClose();
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={cardName(definition)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={handleClose}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 p-3 sm:p-6 bg-black/75 backdrop-blur-sm cursor-pointer"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="relative w-full max-w-3xl min-h-0 flex flex-col sm:flex-row items-center sm:items-stretch gap-4 sm:gap-6"
      >
        <div className="shrink-0 self-center pt-7 px-3 pb-2">
          <motion.div
            initial={{ rotateY: 80, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.05 }}
            className="game-card relative"
            style={{ '--card-w': 'clamp(7rem, min(32vw, 30dvh), 15rem)' } as CSSProperties}
          >
            <CardFrame card={card} />
          </motion.div>
        </div>

        <div
          className={`flex-1 min-w-0 min-h-0 max-h-[55dvh] sm:max-h-[85dvh] overflow-y-auto rounded-2xl border bg-gradient-to-b via-stone-950/95 to-stone-950/95 p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] ${PANEL_TINT[rarity]}`}
        >
          {/* Header */}
          <h2 className="font-display font-black text-xl sm:text-2xl tracking-wide text-amber-50 leading-tight">
            {cardName(definition)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] sm:text-xs font-display tracking-wider uppercase">
            <span className={`rounded-full border bg-black/40 px-2 py-0.5 ${RARITY_COLORS[rarity]}`}>{RARITY_LABELS[rarity]}</span>
            <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-stone-200">{t(`common.cardType.${definition.tipo}`)}</span>
            <span
              className={`rounded-full border px-2 py-0.5 ${
                side === 'ally' ? 'border-emerald-400/50 bg-emerald-900/40 text-emerald-200' : 'border-red-400/50 bg-red-900/40 text-red-200'
              }`}
            >
              {side === 'ally' ? t('game.inspect.ally') : t('game.inspect.enemy')}
            </span>
            {!card.disponible && (
              <span className="rounded-full border border-stone-400/40 bg-stone-800/60 px-2 py-0.5 text-stone-300">{t('game.inspect.used')}</span>
            )}
          </div>

          <p className="mt-3 text-sm sm:text-base font-body italic text-stone-300 leading-snug">{cardDescription(definition)}</p>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={<Zap className="w-4 h-4 text-amber-300 fill-amber-300" />} label={t('game.inspect.cost')} value={definition.coste} />
            {!isConsumible && (
              <>
                <Stat
                  icon={<Swords className="w-4 h-4 text-red-300" />}
                  label={t('game.inspect.power')}
                  value={power}
                  tone={power > basePower ? 'up' : power < basePower ? 'down' : undefined}
                  extra={power !== basePower ? `(${basePower})` : undefined}
                />
                <Stat
                  icon={<Brain className="w-4 h-4 text-pink-300" />}
                  label={t('game.inspect.sanity')}
                  value={`${card.cordura}/${definition.corduraMax ?? 0}`}
                />
                <Stat icon={<Zap className="w-4 h-4 text-orange-300" />} label={t('game.inspect.attackCost')} value={definition.ataqueCoste ?? 0} />
              </>
            )}
          </div>

          {/* Basic attack */}
          {!isConsumible && basePower > 0 && (
            <Section title={t('game.inspect.attack')}>
              <Ability
                icon={definition.tipo === 'qa' ? Crosshair : Swords}
                name={definition.tipo === 'qa' ? t('game.inspect.attackEnemy') : t('game.inspect.attackBug')}
                description={definition.tipo === 'qa' ? t('game.action.attackEnemyDesc') : t('game.action.attackBugDesc')}
                chips={[
                  t('game.inspect.powerChip', { value: power }),
                  `⚡ ${definition.ataqueCoste ?? 0}`,
                ]}
              />
            </Section>
          )}

          {/* Skills */}
          <Section title={isConsumible ? t('game.inspect.effect') : t('game.inspect.skills')}>
            {definition.habilidades.length === 0 ? (
              <p className="text-xs text-stone-500 italic">{t('game.inspect.noSkills')}</p>
            ) : (
              definition.habilidades.map(([skillId, potencia, coste, duracion], i) => {
                const skill = SKILLS[skillId];
                if (!skill) return null;
                const chips = [
                  ...(potencia > 0 ? [t('game.inspect.powerChip', { value: potencia })] : []),
                  `⚡ ${coste}`,
                  ...(duracion > 0 ? [t('game.inspect.duration', { turns: duracion })] : []),
                  t(`game.inspect.target.${skill.objetivo}`),
                ];
                return (
                  <Ability
                    key={`${skillId}-${i}`}
                    icon={TARGET_ICON[skill.objetivo]}
                    name={skillName(skill)}
                    description={skillDescription(skill)}
                    chips={chips}
                  />
                );
              })
            )}
          </Section>

          {/* Active effects */}
          {card.efectosActivos.length > 0 && (
            <Section title={t('game.inspect.activeEffects')}>
              <div className="flex flex-wrap gap-1.5">
                {card.efectosActivos.map((effect, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/50 bg-fuchsia-900/40 px-2 py-0.5 text-xs text-fuchsia-100"
                  >
                    {effect.tipo === 'escudo' ? <Shield className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    {t(`game.inspect.effectType.${effect.tipo}`, { value: effect.valor })}
                    {effect.turnosRestantes > 0 && (
                      <span className="text-fuchsia-300/80">· {t('game.inspect.turnsLeft', { turns: effect.turnosRestantes })}</span>
                    )}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </motion.div>

      <p className="shrink-0 text-[10px] sm:text-xs font-display tracking-widest uppercase text-amber-100/50">{t('game.inspect.close')}</p>
    </motion.div>
  );
}

function Stat({ icon, label, value, tone, extra }: { icon: React.ReactNode; label: string; value: number | string; tone?: 'up' | 'down'; extra?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-display tracking-wider uppercase text-stone-400">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`mt-0.5 font-display font-black text-lg sm:text-xl leading-none tabular-nums ${
          tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-red-300' : 'text-amber-50'
        }`}
      >
        {value}
        {extra && <span className="ml-1 text-xs font-bold text-stone-500">{extra}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[10px] sm:text-xs font-display tracking-[0.2em] uppercase text-amber-300/70">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Ability({ icon: Icon, name, description, chips }: { icon: typeof Bug; name: string; description: string; chips: string[] }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2.5">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
        <Icon className="w-4 h-4 text-amber-200" />
      </div>
      <div className="min-w-0">
        <p className="font-display font-bold text-sm text-amber-50 leading-tight">{name}</p>
        <p className="mt-0.5 text-xs sm:text-sm text-stone-300 leading-snug">{description}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span key={chip} className="rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] sm:text-xs text-stone-200">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
