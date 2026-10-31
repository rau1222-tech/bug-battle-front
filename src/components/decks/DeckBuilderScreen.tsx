import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Loader2, Plus, Minus, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import BackButton from '@/components/ui/BackButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DECK_SIZE, MAX_COPIES, type CardTemplate, type CardType } from '@/constants';
import { saveDeckRecord, type DeckCardEntry, type DeckSummary } from '@/hooks/useDecks';
import { useCollection, getRarity, type Rarity } from '@/hooks/useCollection';
import { useCards } from '@/hooks/useCards';
import { ROUTES } from '@/routes';
import DeckCardThumb from './DeckCardThumb';
import { toast } from 'sonner';

interface Props {
  userId: string;
  editing: DeckSummary | null;
  onBack: () => void;
  onSaved: () => void;
}

const EMOJI_OPTIONS = ['🃏', '⚔️', '🛡️', '⚖️', '🚀', '🐛', '💻', '🔥', '⭐', '🎯', '🧠', '⚡', '🧪', '☕', '🤖', '👾', '🦾', '🏆'];
const DEFAULT_EMOJI = '⚔️';
const TYPE_ORDER: CardType[] = ['programador', 'qa', 'consumible'];
const TYPE_LABELS: Record<CardType, string> = { programador: 'Programadores', qa: 'QA', consumible: 'Consumibles' };
const RARITY_ORDER: Record<Rarity, number> = { legendario: 0, epico: 1, raro: 2, comun: 3 };
const COST_BUCKETS = ['1', '2', '3+'];
type SortKey = 'coste' | 'nombre' | 'rareza';

function countsFrom(deck: DeckSummary | null): Record<string, number> {
  const init: Record<string, number> = {};
  for (const c of deck?.cards ?? []) init[c.card_id] = c.quantity;
  return init;
}

function sameCounts(a: Record<string, number>, b: Record<string, number>) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

export default function DeckBuilderScreen({ userId, editing, onBack, onSaved }: Props) {
  const { cards } = useCards();
  const {
    collection,
    loading: collectionLoading,
    error: collectionError,
    refresh: refreshCollection,
  } = useCollection(userId);
  const [name, setName] = useState(editing?.name ?? '');
  const [emoji, setEmoji] = useState(editing?.cover_emoji ?? DEFAULT_EMOJI);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | CardType>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('coste');
  const [onlyOwned, setOnlyOwned] = useState(true);
  const [tab, setTab] = useState<'catalog' | 'deck'>('catalog');
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>(() => countsFrom(editing));

  const collectionReady = !collectionLoading && !collectionError;
  const ownedOf = (id: string) => collection[id] ?? 0;
  const maxFor = (id: string) => Math.min(MAX_COPIES, ownedOf(id));

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const dirty =
    name !== (editing?.name ?? '') ||
    emoji !== (editing?.cover_emoji ?? DEFAULT_EMOJI) ||
    !sameCounts(counts, countsFrom(editing));

  const stats = useMemo(() => {
    const byType: Record<CardType, number> = { programador: 0, qa: 0, consumible: 0 };
    const curve = [0, 0, 0];
    for (const [id, q] of Object.entries(counts)) {
      const def = cardById.get(id);
      if (!def) continue;
      byType[def.tipo] += q;
      curve[Math.min(Math.max(def.coste, 1), 3) - 1] += q;
    }
    return { byType, curve };
  }, [counts, cardById]);

  // Cards in the deck the player doesn't own enough copies of (e.g. legacy decks)
  const missing = useMemo(() => {
    if (!collectionReady) return [];
    return Object.entries(counts)
      .filter(([id, q]) => q > Math.min(MAX_COPIES, collection[id] ?? 0))
      .map(([id]) => id);
  }, [collectionReady, counts, collection]);

  const blocker = collectionLoading
    ? 'Cargando tu colección…'
    : collectionError
      ? 'No se pudo cargar tu colección'
      : !name.trim()
        ? 'Ponle un nombre al mazo'
        : missing.length > 0
          ? `No tienes suficientes copias de: ${missing.map((id) => cardById.get(id)?.nombre ?? id).join(', ')}`
          : total < DECK_SIZE
            ? `Faltan ${DECK_SIZE - total} carta${DECK_SIZE - total === 1 ? '' : 's'}`
            : null;
  const isValid = blocker === null;

  const ownedDistinct = useMemo(
    () => cards.filter((c) => (collection[c.id] ?? 0) > 0).length,
    [cards, collection],
  );

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => filter === 'all' || c.tipo === filter)
      .filter((c) => !q || c.nombre.toLowerCase().includes(q))
      .filter((c) => !onlyOwned || (collection[c.id] ?? 0) > 0 || (counts[c.id] ?? 0) > 0)
      .sort((a, b) => {
        if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
        if (sort === 'rareza') {
          return RARITY_ORDER[getRarity(a)] - RARITY_ORDER[getRarity(b)] || a.coste - b.coste;
        }
        return a.coste - b.coste || a.nombre.localeCompare(b.nombre);
      });
  }, [cards, filter, search, onlyOwned, collection, counts, sort]);

  const deckGroups = useMemo(
    () =>
      TYPE_ORDER.map((tipo) => ({
        tipo,
        items: cards
          .filter((c) => c.tipo === tipo && (counts[c.id] ?? 0) > 0)
          .sort((a, b) => a.coste - b.coste || a.nombre.localeCompare(b.nombre)),
      })).filter((g) => g.items.length > 0),
    [cards, counts],
  );

  const inc = (def: CardTemplate) => {
    if (!collectionReady) return;
    const cur = counts[def.id] ?? 0;
    const owned = ownedOf(def.id);
    if (owned === 0) {
      toast.info(`No tienes "${def.nombre}". Consíguela en Reclutamiento.`, { id: 'deck-limit' });
      return;
    }
    if (cur >= maxFor(def.id)) {
      toast.error(
        owned < MAX_COPIES
          ? `Solo tienes ${owned} copia${owned > 1 ? 's' : ''} de "${def.nombre}"`
          : `Máximo ${MAX_COPIES} copias por carta`,
        { id: 'deck-limit' },
      );
      return;
    }
    if (total >= DECK_SIZE) {
      toast.error(`Mazo completo (${DECK_SIZE} cartas)`, { id: 'deck-limit' });
      return;
    }
    setCounts((c) => ({ ...c, [def.id]: (c[def.id] ?? 0) + 1 }));
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

  const handleBack = () => {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir igualmente?')) return;
    onBack();
  };

  const handleSave = async () => {
    if (!isValid) {
      toast.error(blocker);
      return;
    }
    setSaving(true);
    try {
      const entries: DeckCardEntry[] = Object.entries(counts).map(([card_id, quantity]) => ({
        card_id,
        quantity,
      }));
      await saveDeckRecord(editing?.id ?? null, name.trim(), emoji, entries);
      toast.success(editing ? 'Mazo actualizado' : 'Mazo creado');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/4 w-72 h-72 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/3 w-60 h-60 bg-teal-500/4 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col h-[100dvh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <BackButton onClick={handleBack} color="emerald" />
          <h1 className="font-display text-sm sm:text-lg text-emerald-100 tracking-wider truncate text-glow-green">
            {editing ? '✏️ EDITAR MAZO' : '🛠️ NUEVO MAZO'}
          </h1>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            title={blocker ?? undefined}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md bg-emerald-600/70 hover:bg-emerald-500/80 text-emerald-50 font-display text-[11px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 border border-emerald-400/30 shadow-[0_0_15px_-5px_hsl(150,80%,45%,0.2)]"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            GUARDAR
          </button>
        </div>

        {/* Name + emoji + counter — terminal-style panel */}
        <div className="rounded-lg border border-emerald-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-emerald-500/10 bg-[hsl(220,18%,10%)]">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
              <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
              <div className="w-2 h-2 rounded-full bg-green-500/60" />
            </div>
            <span className="ml-2 text-[10px] font-body text-emerald-400/50 tracking-wider uppercase">
              ~/mazos/editor
            </span>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Elegir icono del mazo"
                    className="text-2xl w-12 h-10 shrink-0 bg-[hsl(220,15%,12%)] border border-emerald-800/30 rounded-md hover:border-emerald-600/40 focus:outline-none focus:border-emerald-500/50"
                  >
                    {emoji}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto p-2 bg-[hsl(220,18%,10%)] border-emerald-500/20"
                >
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          setEmoji(e);
                          setEmojiOpen(false);
                        }}
                        className={`text-xl w-9 h-9 rounded-md transition-colors ${
                          e === emoji ? 'bg-emerald-600/50 ring-1 ring-emerald-400/50' : 'hover:bg-[hsl(220,15%,16%)]'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <input
                type="text"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del mazo"
                className="flex-1 min-w-0 bg-[hsl(220,15%,12%)] border border-emerald-800/30 rounded-md px-3 py-2 text-emerald-100 font-display text-sm placeholder:text-emerald-200/25 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-body">
              <span className="text-cyan-300/70">⚡ {stats.byType.programador} prog</span>
              <span className="text-emerald-300/70">🛡 {stats.byType.qa} qa</span>
              <span className="text-violet-300/70">🧪 {stats.byType.consumible} cons</span>
              <div className="flex items-end gap-1 h-6" title="Curva de coste">
                {stats.curve.map((n, i) => (
                  <div key={COST_BUCKETS[i]} className="flex flex-col items-center gap-px">
                    <div className="w-3 bg-[hsl(220,15%,14%)] rounded-sm h-4 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-amber-500/70 transition-all"
                        style={{ height: `${(n / Math.max(1, ...stats.curve)) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] leading-none text-amber-200/50">{COST_BUCKETS[i]}</span>
                  </div>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-24 sm:w-40 h-2 bg-[hsl(220,15%,12%)] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${total === DECK_SIZE ? 'bg-emerald-400' : 'bg-emerald-700'}`}
                    style={{ width: `${Math.min(100, (total / DECK_SIZE) * 100)}%` }}
                  />
                </div>
                <span
                  className={`font-display font-bold text-sm tabular-nums ${
                    total === DECK_SIZE ? 'text-emerald-300' : 'text-emerald-200/80'
                  }`}
                >
                  {total}/{DECK_SIZE}
                </span>
              </div>
            </div>
            {collectionError ? (
              <div className="mt-2 flex items-center gap-2 text-[11px] font-body text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No se pudo cargar tu colección.
                <button
                  type="button"
                  onClick={refreshCollection}
                  className="inline-flex items-center gap-1 underline hover:text-red-200"
                >
                  <RefreshCw className="w-3 h-3" /> Reintentar
                </button>
              </div>
            ) : (
              blocker && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-body text-amber-200/70">
                  {collectionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{blocker}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="sm:hidden flex gap-1 mb-2 bg-[hsl(220,18%,10%)] border border-emerald-500/15 rounded-md p-1">
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
          <div className={`${tab === 'catalog' ? 'flex' : 'hidden'} sm:flex flex-col rounded-lg border border-emerald-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden`}>
            <div className="px-3 py-2 border-b border-emerald-500/10 bg-[hsl(220,18%,10%)] space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[10px] tracking-[0.2em] text-emerald-300/60 uppercase mr-auto">
                  Catálogo
                </span>
                <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>Todas</FilterBtn>
                <FilterBtn active={filter === 'programador'} onClick={() => setFilter('programador')}>Prog</FilterBtn>
                <FilterBtn active={filter === 'qa'} onClick={() => setFilter('qa')}>QA</FilterBtn>
                <FilterBtn active={filter === 'consumible'} onClick={() => setFilter('consumible')}>Cons</FilterBtn>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-200/30" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar carta…"
                    className="w-full bg-[hsl(220,15%,12%)] border border-emerald-800/30 rounded-md pl-7 pr-2 py-1 text-xs text-emerald-100 placeholder:text-emerald-200/25 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Ordenar por"
                  className="bg-[hsl(220,15%,12%)] border border-emerald-800/30 rounded-md px-1.5 py-1 text-[11px] text-emerald-100 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="coste">Coste</option>
                  <option value="rareza">Rareza</option>
                  <option value="nombre">Nombre</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] font-body text-emerald-200/70 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={onlyOwned}
                    onChange={(e) => setOnlyOwned(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Mis cartas
                </label>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {collectionLoading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-emerald-300/60 animate-spin" />
                </div>
              )}
              {!collectionLoading && catalog.length === 0 && (
                <div className="text-center py-8 text-emerald-200/40 font-body text-xs">
                  {onlyOwned && ownedDistinct === 0
                    ? 'Aún no tienes cartas en tu colección.'
                    : 'Ninguna carta coincide con los filtros.'}
                </div>
              )}
              {!collectionLoading &&
                catalog.map((def) => {
                  const q = counts[def.id] ?? 0;
                  const owned = ownedOf(def.id);
                  const atMax = q >= maxFor(def.id) || total >= DECK_SIZE;
                  return (
                    <div key={def.id} className="flex items-stretch gap-1.5">
                      <div className="flex-1 min-w-0">
                        <DeckCardThumb
                          def={def}
                          quantity={q || undefined}
                          owned={collectionReady ? owned : undefined}
                          onClick={() => inc(def)}
                          disabled={!collectionReady || owned === 0 || atMax}
                        />
                      </div>
                      <div className="flex flex-col w-9 gap-1">
                        <button
                          type="button"
                          onClick={() => inc(def)}
                          disabled={!collectionReady || owned === 0 || atMax}
                          className="flex-1 w-full rounded-md bg-emerald-600/50 hover:bg-emerald-500/60 text-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center border border-emerald-500/20"
                          aria-label={`Añadir ${def.nombre}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => dec(def.id)}
                          disabled={q === 0}
                          className="flex-1 w-full rounded-md bg-[hsl(220,15%,15%)] hover:bg-[hsl(220,15%,20%)] text-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center border border-emerald-800/30"
                          aria-label={`Quitar ${def.nombre}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              {!collectionLoading && (
                <Link
                  to={ROUTES.GACHA}
                  onClick={(e) => {
                    if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir igualmente?')) e.preventDefault();
                  }}
                  className="block text-center py-3 text-[11px] font-body text-purple-300/70 hover:text-purple-200 underline-offset-2 hover:underline"
                >
                  📦 Consigue más cartas en Reclutamiento →
                </Link>
              )}
            </div>
          </div>

          {/* Current deck */}
          <div className={`${tab === 'deck' ? 'flex' : 'hidden'} sm:flex flex-col rounded-lg border border-emerald-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden`}>
            <div className="px-3 py-2 border-b border-emerald-500/10 bg-[hsl(220,18%,10%)] flex items-center">
              <span className="font-display text-[10px] tracking-[0.2em] text-emerald-300/60 uppercase">
                Mi mazo
              </span>
              <span className="ml-auto text-[10px] font-body text-emerald-200/50">
                {Object.keys(counts).length} cartas únicas
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {deckGroups.length === 0 ? (
                <div className="text-center py-10 text-emerald-200/30 font-body text-xs italic">
                  Aún no has añadido cartas. Toca una carta del catálogo.
                </div>
              ) : (
                deckGroups.map((group) => (
                  <div key={group.tipo} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1 text-[10px] font-display tracking-[0.15em] uppercase text-emerald-300/50">
                      <span>{TYPE_LABELS[group.tipo]}</span>
                      <span className="tabular-nums">{stats.byType[group.tipo]}</span>
                    </div>
                    {group.items.map((def) => {
                      const q = counts[def.id];
                      const short = missing.includes(def.id);
                      return (
                        <div key={def.id} className="flex items-stretch gap-1.5">
                          <div className={`flex-1 min-w-0 rounded-lg ${short ? 'ring-1 ring-red-500/60' : ''}`}>
                            <DeckCardThumb def={def} quantity={q} small />
                            {short && (
                              <p className="px-2 pb-1 text-[10px] font-body text-red-300">
                                Solo tienes {ownedOf(def.id)} — quita {q - maxFor(def.id)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col w-8 gap-1">
                            <button
                              type="button"
                              onClick={() => inc(def)}
                              disabled={!collectionReady || q >= maxFor(def.id) || total >= DECK_SIZE}
                              className="flex-1 rounded-md bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center border border-emerald-600/20"
                              aria-label={`Añadir ${def.nombre}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => dec(def.id)}
                              className="flex-1 rounded-md bg-red-900/40 hover:bg-red-800/60 text-red-200 transition-colors flex items-center justify-center border border-red-700/20"
                              aria-label={`Quitar ${def.nombre}`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
        active ? 'bg-emerald-600/60 text-emerald-50 border border-emerald-500/20' : 'text-emerald-200/50 hover:text-emerald-100'
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
        active ? 'bg-emerald-600/60 text-emerald-50 border border-emerald-500/20' : 'bg-[hsl(220,15%,15%)] text-emerald-200/60 hover:text-emerald-100 border border-emerald-800/20'
      }`}
    >
      {children}
    </button>
  );
}
