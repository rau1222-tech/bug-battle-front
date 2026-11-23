import type { CSSProperties } from 'react';
import { Hourglass, Swords, Zap } from 'lucide-react';
import { SKILLS, type CardInstance, type CardTemplate } from '@/constants';
import CardFrame from '@/components/game/CardFrame';
import { useI18n } from '@/i18n';

interface Props {
  card: CardTemplate;
}

/** Same frame the card gets in a match, plus the text that the frame leaves out. */
export default function CardPreview({ card }: Props) {
  const { t, cardName, cardDescription, skillName, skillNameById } = useI18n();
  const instance: CardInstance = {
    instanceId: 'preview',
    definition: { ...card, nombre: cardName(card) || t('cards.previewNewCard') },
    cordura: card.corduraMax ?? 0,
    efectosActivos: [],
    disponible: true,
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Padding leaves room for the badges and crown that stick out of the frame */}
      <div className="pt-7 px-4 pb-2">
        <div className="game-card relative select-none" style={{ '--card-w': 'clamp(9rem, 40vw, 13rem)' } as CSSProperties}>
          <CardFrame card={instance} />
        </div>
      </div>

      <div className="w-full rounded-lg border border-cyan-500/20 bg-black/30 p-3 space-y-2">
        <p className="text-xs font-body italic text-cyan-100/80 leading-snug">
          {cardDescription(card) || t('cards.descriptionPlaceholder')}
        </p>
        {card.habilidades.length > 0 && (
          <ul className="space-y-1">
            {card.habilidades.map(([skillId, potencia, coste, duracion], i) => (
              <li key={`${skillId}-${i}`} className="flex items-center gap-2 text-[11px] text-cyan-100">
                <span className="flex-1 min-w-0 truncate font-display font-bold">
                  {SKILLS[skillId] ? skillName(SKILLS[skillId]) : skillNameById(skillId)}
                </span>
                {potencia > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-red-300">
                    <Swords className="w-3 h-3" />
                    {potencia}
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 text-amber-300">
                  <Zap className="w-3 h-3 fill-current" />
                  {coste}
                </span>
                {duracion > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-sky-300">
                    <Hourglass className="w-3 h-3" />
                    {duracion}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
