import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CardTemplate } from '@/constants';
import { getRarity, RARITY_COLORS, RARITY_LABELS } from '@/hooks/useCollection';
import {
  appearanceProbabilities,
  BANNER_CARDS_PER_PACK_MAX,
  BANNER_CARDS_PER_PACK_MIN,
  BANNER_DEFAULT_CARDS_PER_PACK,
  BANNER_DEFAULT_COST,
  BANNER_TITLE_MAX,
  fromDateTimeLocal,
  toDateTimeLocal,
  validateBannerDraft,
  type Banner,
  type BannerCard,
  type BannerDraft,
} from '@/lib/banners';

interface BannerEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new banner. */
  banner: Banner | null;
  cards: CardTemplate[];
  onSave: (draft: BannerDraft) => Promise<unknown>;
}

const DEFAULT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const inputClass =
  'h-10 w-full px-3 rounded-md bg-[hsl(220,15%,12%)] border border-purple-500/15 text-purple-100 text-sm font-body placeholder:text-purple-300/20 focus:outline-none focus:border-purple-400/40 transition-all';
const labelClass = 'text-[10px] font-display uppercase tracking-widest text-purple-300/50';

export default function BannerEditorModal({ open, onOpenChange, banner, cards, onSave }: BannerEditorModalProps) {
  const [titulo, setTitulo] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [coste, setCoste] = useState(BANNER_DEFAULT_COST);
  const [cartasPorSobre, setCartasPorSobre] = useState(BANNER_DEFAULT_CARDS_PER_PACK);
  const [entries, setEntries] = useState<BannerCard[]>([]);
  const [cardToAdd, setCardToAdd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (banner) {
      setTitulo(banner.titulo);
      setInicio(toDateTimeLocal(banner.fechaInicio));
      setFin(toDateTimeLocal(banner.fechaFin));
      setCoste(banner.coste);
      setCartasPorSobre(banner.cartasPorSobre);
      setEntries(banner.cards.map((c) => ({ ...c })));
    } else {
      const now = Date.now();
      setTitulo('');
      setInicio(toDateTimeLocal(new Date(now).toISOString()));
      setFin(toDateTimeLocal(new Date(now + DEFAULT_DURATION_MS).toISOString()));
      setCoste(BANNER_DEFAULT_COST);
      setCartasPorSobre(BANNER_DEFAULT_CARDS_PER_PACK);
      setEntries([]);
    }
    setCardToAdd('');
    setError(null);
  }, [open, banner]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const availableCards = useMemo(
    () => cards.filter((c) => !entries.some((e) => e.cardId === c.id)),
    [cards, entries],
  );
  const probabilities = useMemo(() => appearanceProbabilities(entries), [entries]);

  const handleAddCard = () => {
    const card = cardsById.get(cardToAdd);
    if (!card || entries.some((e) => e.cardId === card.id)) return;
    // The appearance weight starts as a copy of the card's own weight; the admin can change it afterwards.
    setEntries((current) => [...current, { cardId: card.id, pesoAparicion: card.gachaPeso ?? 1 }]);
    setCardToAdd('');
  };

  const updateWeight = (cardId: string, value: string) => {
    const peso = value === '' ? 0 : Number(value);
    setEntries((current) => current.map((e) => (e.cardId === cardId ? { ...e, pesoAparicion: peso } : e)));
  };

  const removeCard = (cardId: string) => {
    setEntries((current) => current.filter((e) => e.cardId !== cardId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const draft: BannerDraft = {
      titulo,
      fechaInicio: fromDateTimeLocal(inicio),
      fechaFin: fromDateTimeLocal(fin),
      coste,
      cartasPorSobre,
      cards: entries,
    };
    const validation = validateBannerDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el banner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto border-purple-500/20 bg-[hsl(220,20%,8%)] text-purple-100 shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.25)] [&>button]:text-purple-300">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-purple-100">
            {banner ? 'Editar banner' : 'Nuevo banner'}
          </DialogTitle>
          <DialogDescription className="text-[11px] font-body text-purple-300/40">
            El peso de aparición solo afecta al sorteo dentro de este banner. La rareza sigue dependiendo del peso de la carta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Título</span>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={BANNER_TITLE_MAX}
              autoFocus
              required
              className={inputClass}
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Fecha de inicio</span>
              <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Fecha de fin</span>
              <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} required className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Coste por sobre (🪙)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={coste}
                onChange={(e) => setCoste(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Cartas por sobre</span>
              <input
                type="number"
                min={BANNER_CARDS_PER_PACK_MIN}
                max={BANNER_CARDS_PER_PACK_MAX}
                step={1}
                value={cartasPorSobre}
                onChange={(e) => setCartasPorSobre(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className={labelClass}>Cartas del banner ({entries.length})</span>

            <div className="flex gap-2">
              <select
                value={cardToAdd}
                onChange={(e) => setCardToAdd(e.target.value)}
                className={`${inputClass} flex-1`}
                aria-label="Carta a añadir"
              >
                <option value="">Selecciona una carta…</option>
                {availableCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {RARITY_LABELS[getRarity(c)]} (peso {c.gachaPeso ?? 1})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddCard}
                disabled={!cardToAdd}
                className="h-10 px-4 rounded-md bg-purple-600/40 border border-purple-500/30 text-purple-100 font-display text-xs tracking-wider hover:bg-purple-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                AÑADIR
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="text-xs font-body text-purple-300/40">Añade al menos una carta al banner.</p>
            ) : (
              <div className="rounded-md border border-purple-500/15 divide-y divide-purple-500/10">
                <div className="grid grid-cols-[1fr_5.5rem_4rem_2rem] gap-2 px-3 py-1.5 text-[9px] font-display uppercase tracking-widest text-purple-300/40">
                  <span>Carta</span>
                  <span>Peso aparición</span>
                  <span className="text-right">Prob.</span>
                  <span />
                </div>
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId);
                  const rarity = card ? getRarity(card) : 'comun';
                  const invalid = !Number.isInteger(entry.pesoAparicion) || entry.pesoAparicion <= 0;
                  return (
                    <div key={entry.cardId} className="grid grid-cols-[1fr_5.5rem_4rem_2rem] gap-2 items-center px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-display truncate">{card?.nombre ?? entry.cardId}</p>
                        <p className={`text-[9px] font-body ${RARITY_COLORS[rarity].split(' ')[0]}`}>
                          {RARITY_LABELS[rarity]} · peso carta {card?.gachaPeso ?? '—'}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={entry.pesoAparicion || ''}
                        onChange={(e) => updateWeight(entry.cardId, e.target.value)}
                        aria-label={`Peso de aparición de ${card?.nombre ?? entry.cardId}`}
                        className={`${inputClass} h-8 px-2 ${invalid ? 'border-red-500/60' : ''}`}
                      />
                      <span className="text-right text-xs font-display tabular-nums text-purple-200/70">
                        {((probabilities[entry.cardId] ?? 0) * 100).toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCard(entry.cardId)}
                        aria-label={`Quitar ${card?.nombre ?? entry.cardId}`}
                        className="h-8 w-8 rounded-md text-red-300/70 hover:text-red-200 hover:bg-red-500/10 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400 font-body text-center">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-10 px-4 rounded-md border border-purple-500/15 text-purple-200/60 hover:text-purple-100 hover:border-purple-400/30 font-display text-xs tracking-wider transition-colors disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-md bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white hover:from-purple-500/90 hover:to-indigo-500/90 border border-purple-400/30 font-display text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'GUARDANDO...' : 'GUARDAR'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
