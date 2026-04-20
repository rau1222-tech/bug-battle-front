import { useMemo, useState } from 'react';
import { ArrowLeft, Save, Loader2, Plus, Minus } from 'lucide-react';
import { CARD_DEFINITIONS, DECK_SIZE, type CardType } from '@/constants/cards';
import {
  createDeckRecord,
  updateDeckRecord,
  type DeckCardEntry,
  type DeckSummary,
} from '@/hooks/useDecks';
import { useCollection, getRarity, RARITY_LABELS, RARITY_COLORS } from '@/hooks/useCollection';
import DeckCardThumb from './DeckCardThumb';
import { toast } from 'sonner';
import boardBg from '@/assets/game-board-bg.png';

interface Props {
  userId: string;
  editing: DeckSummary | null;
  onBack: () => void;
  onSaved: () => void;
}

const EMOJI_OPTIONS = ['🃏', '⚔️', '🛡️', '⚖️', '🚀', '🐛', '💻', '🔥', '⭐', '🎯', '🧠', '⚡'];

export default function DeckBuilderScreen({ userId, editing, onBack, onSaved }: Props) {
  const { collection } = useCollection();
  const [name, setName] = useState(editing?.name ?? 'Mi nuevo mazo');
  const [emoji, setEmoji] = useState(editing?.cover_emoji ?? '🃏');
  const [filter, setFilter] = useState<'all' | CardType>('all');
  const [tab, setTab] = useState<'catalog' | 'deck'>('catalog');
  const [saving, setSaving] = useState(false);

  // map cardId -> quantity
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of editing?.cards ?? []) init[c.card_id] = c.quantity;
    return init;
  });

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const isValid = total === DECK_SIZE && name.trim().length > 0;

  const stats = useMemo(() => {
    let progs = 0;
    let qas = 0;
    for (const def of CARD_DEFINITIONS) {
      const q = counts[def.id] ?? 0;
      if (def.tipo === 'programador') progs += q;
      else if (def.tipo === 'qa') qas += q;
    }
    return { progs, qas };
  }, [counts]);

  const filteredCatalog = useMemo(() => {
    return CARD_DEFINITIONS.filter((c) => filter === 'all' || c.tipo === filter);
  }, [filter]);

  const inDeck = CARD_DEFINITIONS.filter((c) => (counts[c.id] ?? 0) > 0);

  const inc = (id: string) => {
    setCounts((c) => {
      const cur = c[id] ?? 0;
      const owned = collection[id] ?? 0;
      if (cur >= 2) {
        toast.error('Máximo 2 copias por carta en un mazo');
        return c;
      }
      if (owned > 0 && cur >= owned) {
        toast.error(`Solo tienes ${owned} copia${owned > 1 ? 's' : ''} de esta carta`);
        return c;
      }
      if (total >= DECK_SIZE) {
        toast.error(`Mazo completo (${DECK_SIZE} cartas)`);
        return c;
      }
      return { ...c, [id]: cur + 1 };
    });
  };
  const dec = (id: string) => {
    setCounts((c) => {
      const cur = c[id] ?? 0;
      if (cur <= 1) {
        const { [id]: _, ...rest } = c;
        return rest;
      }
      return { ...c, [id]: cur - 1 };
    });
  };

  const handleSave = async () => {
    if (!isValid) {
      toast.error(`El mazo debe tener exactamente ${DECK_SIZE} cartas`);
      return;
    }
    setSaving(true);
    try {
      const cards: DeckCardEntry[] = Object.entries(counts).map(([card_id, quantity]) => ({
        card_id,
        quantity,
      }));
      if (editing) {
        await updateDeckRecord(editing.id, name.trim(), emoji, cards);
        toast.success('Mazo actualizado');
      } else {
        await createDeckRecord(userId, name.trim(), emoji, cards);
        toast.success('Mazo creado');
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] w-full relative"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative z-10 max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col h-[100dvh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-amber-200/80 hover:text-amber-100 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-display text-xs tracking-wider hidden sm:inline">VOLVER</span>
          </button>
          <h1 className="font-display text-sm sm:text-lg text-amber-100 tracking-wider truncate">
            {editing ? '✏️ EDITAR MAZO' : '🛠️ NUEVO MAZO'}
          </h1>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md bg-amber-600 hover:bg-amber-500 text-amber-50 font-display text-[11px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            GUARDAR
          </button>
        </div>

        {/* Name + emoji + counter */}
        <div className="bg-stone-900/70 backdrop-blur-sm border border-amber-900/40 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <select
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="text-2xl bg-stone-800/70 border border-amber-900/40 rounded-md px-2 py-1 cursor-pointer hover:border-amber-700/60"
            >
              {EMOJI_OPTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <input
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del mazo"
              className="flex-1 bg-stone-800/70 border border-amber-900/40 rounded-md px-3 py-2 text-amber-100 font-display text-sm placeholder:text-amber-200/30 focus:outline-none focus:border-amber-500/70"
            />
          </div>
          <div className="flex items-center gap-3 text-xs font-body">
            <span className="text-amber-200/70">⚡ {stats.progs} prog</span>
            <span className="text-emerald-300/80">🛡 {stats.qas} qa</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-24 sm:w-40 h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    total === DECK_SIZE
                      ? 'bg-amber-400'
                      : total > DECK_SIZE
                        ? 'bg-red-500'
                        : 'bg-amber-700'
                  }`}
                  style={{ width: `${Math.min(100, (total / DECK_SIZE) * 100)}%` }}
                />
              </div>
              <span
                className={`font-display font-bold text-sm ${
                  total === DECK_SIZE ? 'text-amber-300' : total > DECK_SIZE ? 'text-red-400' : 'text-amber-200/80'
                }`}
              >
                {total}/{DECK_SIZE}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="sm:hidden flex gap-1 mb-2 bg-stone-900/60 border border-amber-900/40 rounded-md p-1">
          <TabBtn active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            Catálogo
          </TabBtn>
          <TabBtn active={tab === 'deck'} onClick={() => setTab('deck')}>
            Mazo ({total})
          </TabBtn>
        </div>

        {/* Two columns desktop / tabs mobile */}
        <div className="flex-1 grid sm:grid-cols-2 gap-3 min-h-0">
          {/* Catalog */}
          <div className={`${tab === 'catalog' ? 'flex' : 'hidden'} sm:flex flex-col bg-stone-900/60 backdrop-blur-sm border border-amber-900/40 rounded-lg overflow-hidden`}>
            <div className="px-3 py-2 border-b border-amber-900/40 flex items-center gap-1.5">
              <span className="font-display text-[10px] tracking-[0.2em] text-amber-300/80 uppercase mr-auto">
                Catálogo
              </span>
              <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>Todas</FilterBtn>
              <FilterBtn active={filter === 'programador'} onClick={() => setFilter('programador')}>Prog</FilterBtn>
              <FilterBtn active={filter === 'qa'} onClick={() => setFilter('qa')}>QA</FilterBtn>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredCatalog.map((def) => {
                const q = counts[def.id] ?? 0;
                const owned = collection[def.id] ?? 0;
                const maxForCard = owned > 0 ? Math.min(2, owned) : 2;
                const atMax = q >= maxForCard || total >= DECK_SIZE;
                return (
                  <div key={def.id} className="flex items-stretch gap-1.5">
                    <div className="flex-1">
                      <DeckCardThumb def={def} quantity={q || undefined} />
                    </div>
                    <div className="flex flex-col items-center justify-center w-9 gap-0.5">
                      {owned > 0 && (
                        <span className="text-[8px] font-body text-amber-200/40">×{owned}</span>
                      )}
                      <button
                        onClick={() => inc(def.id)}
                        disabled={atMax}
                        className="flex-1 w-full rounded-md bg-amber-700/70 hover:bg-amber-600 text-amber-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                        aria-label="Añadir"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => dec(def.id)}
                        disabled={q === 0}
                        className="flex-1 rounded-md bg-stone-700/70 hover:bg-stone-600 text-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                        aria-label="Quitar"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current deck */}
          <div className={`${tab === 'deck' ? 'flex' : 'hidden'} sm:flex flex-col bg-stone-900/60 backdrop-blur-sm border border-amber-900/40 rounded-lg overflow-hidden`}>
            <div className="px-3 py-2 border-b border-amber-900/40 flex items-center">
              <span className="font-display text-[10px] tracking-[0.2em] text-amber-300/80 uppercase">
                Mi mazo
              </span>
              <span className="ml-auto text-[10px] font-body text-amber-200/60">
                {inDeck.length} cartas únicas
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {inDeck.length === 0 ? (
                <div className="text-center py-10 text-amber-200/40 font-body text-xs italic">
                  Aún no has añadido cartas. Toca "+" en el catálogo.
                </div>
              ) : (
                inDeck.map((def) => (
                  <div key={def.id} className="flex items-stretch gap-1.5">
                    <div className="flex-1">
                      <DeckCardThumb def={def} quantity={counts[def.id]} small />
                    </div>
                    <button
                      onClick={() => dec(def.id)}
                      className="w-8 rounded-md bg-red-900/50 hover:bg-red-800/70 text-red-100 transition-colors flex items-center justify-center"
                      aria-label="Quitar 1"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded font-display text-[11px] tracking-wider transition-colors ${
        active ? 'bg-amber-700/80 text-amber-50' : 'text-amber-200/60 hover:text-amber-100'
      }`}
    >
      {children}
    </button>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[9px] font-display tracking-wider uppercase transition-colors ${
        active ? 'bg-amber-600/80 text-amber-50' : 'bg-stone-700/60 text-amber-200/70 hover:text-amber-100'
      }`}
    >
      {children}
    </button>
  );
}
