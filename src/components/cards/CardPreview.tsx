import { DEFAULT_CARD_IMAGE, resolveCardImage, type CardTemplate } from '@/constants';
import cardBase from '@/assets/Base-Carta.png';

interface Props {
  card: CardTemplate;
}

export default function CardPreview({ card }: Props) {
  const isProgramador = card.tipo === 'programador';

  return (
    <div className="relative select-none w-[10rem] h-[14rem] sm:w-[12rem] sm:h-[16.8rem] mx-auto">
      <img
        src={cardBase}
        alt=""
        className="absolute inset-0 w-full h-full object-fill pointer-events-none drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]"
        draggable={false}
      />

      <div className="absolute top-[4%] left-[10%] right-[18%] h-[7%] flex items-center justify-center pointer-events-none overflow-hidden">
        <span className={`text-[8px] font-display font-bold tracking-wide text-center leading-none px-1 ${
          card.tipo === 'consumible' ? 'text-cyan-700' : isProgramador ? 'text-stone-900' : 'text-red-600'
        }`}>
          {card.nombre.toUpperCase() || 'NUEVA CARTA'}
        </span>
      </div>

      <div className="absolute top-[13%] left-[8%] right-[8%] bottom-[45%] flex items-center justify-center pointer-events-none">
        <img
          src={resolveCardImage(card.image)}
          alt={card.nombre || 'preview'}
          className="w-full h-full object-contain rounded-sm"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.dataset.fallbackApplied === 'true') return;
            img.dataset.fallbackApplied = 'true';
            img.src = DEFAULT_CARD_IMAGE;
          }}
          draggable={false}
        />
      </div>

      <div className="absolute top-[59%] left-[10%] right-[10%] bottom-[14%] flex items-center justify-center p-1 pointer-events-none overflow-hidden">
        <p className="text-[7px] font-body text-stone-600 text-center leading-tight">
          {card.descripcion || 'Descripción de la carta'}
        </p>
      </div>

      <div className="absolute bottom-[3%] left-[10%] w-[28%] h-[8%] flex items-center justify-center pointer-events-none">
        {card.tipo === 'consumible' ? (
          <span className="text-[12px] font-display font-bold">🧪</span>
        ) : card.tipo === 'programador' ? (
          <span className="text-[11px] font-display font-bold text-stone-800">{card.potencia ?? 0}</span>
        ) : (
          <span className="text-[11px] font-display font-bold text-red-600">QA</span>
        )}
      </div>

      <div className="absolute bottom-[2%] right-[8%] w-[30%] h-[10%] flex items-center justify-center pointer-events-none">
        <div className="flex items-center justify-center gap-[1px] bg-gradient-to-b from-amber-700/80 to-amber-900/90 rounded-[3px] px-1.5 py-0.5 border border-amber-400/50">
          <span className="text-[9px] leading-none">⚡</span>
          <span className="text-[11px] font-display font-black text-amber-100 leading-none tabular-nums">{card.coste}</span>
        </div>
      </div>
    </div>
  );
}
