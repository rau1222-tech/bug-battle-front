import { CardDefinition } from '@/constants/cards';

interface Props {
  def: CardDefinition;
  quantity?: number;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}

export default function DeckCardThumb({ def, quantity, onClick, disabled, small }: Props) {
  const isProg = def.tipo === 'programador';
  const accent = isProg ? 'border-amber-500/50' : 'border-emerald-500/50';
  const tag = isProg ? 'bg-amber-700/60 text-amber-100' : 'bg-emerald-700/60 text-emerald-100';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full ${small ? 'p-1.5' : 'p-2'} rounded-lg border-2 ${accent} bg-stone-900/70 backdrop-blur-sm text-left transition-all
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-300/80 active:scale-[0.97]'}`}
    >
      <div className="flex items-center gap-2">
        <div className={`${small ? 'text-2xl' : 'text-3xl'} shrink-0`}>{def.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-display font-semibold text-amber-100 truncate ${small ? 'text-[11px]' : 'text-xs'}`}>
            {def.nombre}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[8px] font-display tracking-wider px-1 py-px rounded ${tag} uppercase`}>
              {def.tipo}
            </span>
            <span className="text-[10px] font-body text-amber-200/70">⚡{def.potencia}</span>
          </div>
        </div>
        {quantity !== undefined && quantity > 0 && (
          <div className="shrink-0 bg-amber-600/90 text-amber-50 font-display text-xs font-bold rounded-md px-1.5 py-0.5">
            ×{quantity}
          </div>
        )}
      </div>
      {!small && (
        <p className="mt-1 text-[9px] font-body text-amber-200/55 leading-tight line-clamp-2">{def.descripcion}</p>
      )}
    </button>
  );
}
