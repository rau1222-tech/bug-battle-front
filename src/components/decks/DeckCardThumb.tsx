import { Lock } from 'lucide-react';
import { CardTemplate, CardType, DEFAULT_CARD_IMAGE, resolveCardImage } from '@/constants';
import { getRarity, type Rarity } from '@/hooks/useCollection';
import { useI18n } from '@/i18n';

interface Props {
  def: CardTemplate;
  quantity?: number;
  /** Copies the player owns; when provided, shows availability and lock state */
  owned?: number;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}

const TYPE_STYLES: Record<CardType, { border: string; tag: string }> = {
  programador: { border: 'border-cyan-500/40', tag: 'bg-cyan-800/60 text-cyan-100' },
  qa: { border: 'border-emerald-500/40', tag: 'bg-emerald-800/60 text-emerald-100' },
  consumible: { border: 'border-violet-500/40', tag: 'bg-violet-800/60 text-violet-100' },
};

const RARITY_TEXT: Record<Rarity, string> = {
  comun: 'text-stone-300/70',
  raro: 'text-blue-300',
  epico: 'text-purple-300',
  legendario: 'text-yellow-300',
};

export default function DeckCardThumb({ def, quantity, owned, onClick, disabled, small }: Props) {
  const { t, cardName, cardDescription } = useI18n();
  const tipo = TYPE_STYLES[def.tipo] ? def.tipo : 'programador';
  const style = TYPE_STYLES[tipo];
  const rarity = getRarity(def);
  const locked = owned !== undefined && owned === 0;
  const interactive = !!onClick && !disabled;
  const Root = onClick ? 'button' : 'div';

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick, disabled } : {})}
      title={locked ? t('decks.thumb.lockedTitle') : cardDescription(def)}
      className={`relative w-full ${small ? 'p-1.5' : 'p-2'} rounded-lg border-2 ${style.border} bg-[hsl(220,18%,10%)]/80 backdrop-blur-sm text-left transition-all
        ${locked ? 'grayscale opacity-45' : ''}
        ${interactive ? 'hover:border-emerald-300/70 hover:bg-[hsl(220,18%,13%)] active:scale-[0.98]' : ''}
        ${onClick && disabled ? 'cursor-not-allowed' : ''}
        ${disabled && !locked ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <img
            src={resolveCardImage(def.image)}
            alt={cardName(def)}
            className={`${small ? 'w-8 h-8' : 'w-10 h-10'} object-contain rounded`}
            onError={(event) => {
              const img = event.currentTarget;
              if (img.dataset.fallbackApplied === 'true') return;
              img.dataset.fallbackApplied = 'true';
              img.src = DEFAULT_CARD_IMAGE;
            }}
            draggable={false}
          />
          {locked && <Lock className="absolute inset-0 m-auto w-4 h-4 text-stone-200" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-display font-semibold text-emerald-50 truncate ${small ? 'text-[11px]' : 'text-xs'}`}>
            {cardName(def)}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className={`text-[9px] font-display tracking-wider px-1 py-px rounded ${style.tag} uppercase`}>
              {t(`decks.typeShort.${tipo}`)}
            </span>
            <span className="inline-flex items-center gap-px text-[10px] font-display font-bold text-amber-100 bg-amber-700/50 rounded px-1 py-px">
              ⚡{def.coste}
            </span>
            {def.potencia !== undefined && (
              <span className="text-[10px] font-display text-rose-200/80">⚔️{def.potencia}</span>
            )}
            {!small && (
              <span className={`text-[9px] font-body ${RARITY_TEXT[rarity]}`}>{t(`common.rarity.${rarity}`)}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          {quantity !== undefined && quantity > 0 && (
            <div className="bg-emerald-600/90 text-emerald-50 font-display text-xs font-bold rounded-md px-1.5 py-0.5">
              ×{quantity}
            </div>
          )}
          {owned !== undefined && (
            <span className={`text-[10px] font-body tabular-nums ${locked ? 'text-stone-300' : 'text-emerald-200/60'}`}>
              {locked ? t('decks.thumb.noCopies') : t('decks.thumb.owned', { count: owned })}
            </span>
          )}
        </div>
      </div>
      {!small && (
        <p className="mt-1 text-[10px] font-body text-emerald-100/50 leading-tight line-clamp-2">{cardDescription(def)}</p>
      )}
    </Root>
  );
}
