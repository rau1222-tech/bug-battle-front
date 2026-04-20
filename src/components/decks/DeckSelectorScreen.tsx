import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Copy, Trash2, Play, ArrowLeft, Loader2, Check } from 'lucide-react';
import { useAnonAuth } from '@/hooks/useAnonAuth';
import {
  useDecks,
  deleteDeckRecord,
  duplicateDeck,
  setActiveDeckId,
  getActiveDeckId,
  type DeckSummary,
} from '@/hooks/useDecks';
import { toast } from 'sonner';
import boardBg from '@/assets/game-board-bg.png';

interface Props {
  onBack: () => void;
  onPlay: (deckId: string) => void;
  onCreate: () => void;
  onEdit: (deck: DeckSummary) => void;
}

export default function DeckSelectorScreen({ onBack, onPlay, onCreate, onEdit }: Props) {
  const { user, loading: authLoading } = useAnonAuth();
  const { decks, loading, refresh } = useDecks(user?.id);
  const [activeId, setActiveId] = useState<string | null>(getActiveDeckId());
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDuplicate = async (deck: DeckSummary) => {
    if (!user) return;
    setBusyId(deck.id);
    try {
      await duplicateDeck(deck, user.id);
      toast.success(`${deck.name} duplicado`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al duplicar');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (deck: DeckSummary) => {
    if (!confirm(`¿Eliminar "${deck.name}"?`)) return;
    setBusyId(deck.id);
    try {
      await deleteDeckRecord(deck.id);
      if (activeId === deck.id) {
        setActiveDeckId(null);
        setActiveId(null);
      }
      toast.success('Mazo eliminado');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const handlePlay = (deck: DeckSummary) => {
    setActiveDeckId(deck.id);
    setActiveId(deck.id);
    onPlay(deck.id);
  };

  const handleSetActive = (deck: DeckSummary) => {
    setActiveDeckId(deck.id);
    setActiveId(deck.id);
    toast.success(`"${deck.name}" seleccionado`);
  };

  const presets = decks.filter((d) => d.is_preset);
  const mine = decks.filter((d) => !d.is_preset);

  return (
    <div
      className="min-h-[100dvh] w-full relative"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-amber-200/80 hover:text-amber-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-display text-xs tracking-wider">VOLVER</span>
          </button>
          <h1 className="font-display text-lg sm:text-2xl text-amber-100 tracking-wider">
            🃏 MIS MAZOS
          </h1>
          <div className="w-16" />
        </div>

        {(authLoading || loading) && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-300/70 animate-spin" />
          </div>
        )}

        {!authLoading && !loading && (
          <>
            {/* Presets */}
            <Section title="Mazos predefinidos" subtitle="Listos para jugar — no se pueden editar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence>
                  {presets.map((d) => (
                    <DeckCard
                      key={d.id}
                      deck={d}
                      isActive={activeId === d.id}
                      busy={busyId === d.id}
                      onPlay={() => handlePlay(d)}
                      onSetActive={() => handleSetActive(d)}
                      onDuplicate={() => handleDuplicate(d)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </Section>

            {/* User decks */}
            <Section title="Mis mazos personalizados" subtitle={`${mine.length} mazo${mine.length === 1 ? '' : 's'} creado${mine.length === 1 ? '' : 's'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <button
                  onClick={onCreate}
                  className="group min-h-[120px] rounded-xl border-2 border-dashed border-amber-700/40 bg-stone-900/30 hover:bg-stone-900/50 hover:border-amber-500/60 transition-all flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
                >
                  <Plus className="w-8 h-8 text-amber-300/60 group-hover:text-amber-200 transition-colors" />
                  <span className="font-display text-xs tracking-wider text-amber-200/70 group-hover:text-amber-100">
                    CREAR MAZO NUEVO
                  </span>
                </button>
                <AnimatePresence>
                  {mine.map((d) => (
                    <DeckCard
                      key={d.id}
                      deck={d}
                      isActive={activeId === d.id}
                      busy={busyId === d.id}
                      onPlay={() => handlePlay(d)}
                      onSetActive={() => handleSetActive(d)}
                      onEdit={() => onEdit(d)}
                      onDuplicate={() => handleDuplicate(d)}
                      onDelete={() => handleDelete(d)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="font-display text-sm sm:text-base text-amber-200 tracking-[0.2em] uppercase">{title}</h2>
        <p className="text-[10px] sm:text-xs font-body text-amber-200/50">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

interface DeckCardProps {
  deck: DeckSummary;
  isActive: boolean;
  busy: boolean;
  onPlay: () => void;
  onSetActive: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

function DeckCard({ deck, isActive, busy, onPlay, onSetActive, onEdit, onDuplicate, onDelete }: DeckCardProps) {
  const isValid = deck.total === 20;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative rounded-xl border-2 backdrop-blur-sm overflow-hidden transition-all ${
        isActive
          ? 'border-amber-400 bg-amber-950/40 shadow-lg shadow-amber-500/20'
          : 'border-amber-900/40 bg-stone-900/60 hover:border-amber-700/60'
      }`}
    >
      {isActive && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded text-[9px] font-display font-bold tracking-wider">
          <Check className="w-3 h-3" /> ACTIVO
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="text-4xl sm:text-5xl shrink-0">{deck.cover_emoji}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm text-amber-100 truncate">{deck.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-body">
              <span className="text-amber-200/60">
                ⚡ {deck.programadores} <span className="text-amber-200/40">prog</span>
              </span>
              <span className="text-emerald-300/70">
                🛡 {deck.qas} <span className="text-emerald-300/50">qa</span>
              </span>
              <span className={`ml-auto font-display font-bold ${isValid ? 'text-amber-300' : 'text-red-400'}`}>
                {deck.total}/20
              </span>
            </div>
            <span
              className={`inline-block mt-1.5 text-[8px] font-display tracking-wider px-1.5 py-0.5 rounded uppercase ${
                deck.is_preset
                  ? 'bg-stone-700/70 text-amber-200/80'
                  : 'bg-emerald-900/60 text-emerald-200/90'
              }`}
            >
              {deck.is_preset ? 'Preset' : 'Mío'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={onPlay}
            disabled={!isValid || busy}
            className="flex-1 min-w-[80px] flex items-center justify-center gap-1 h-8 rounded-md bg-amber-700/80 hover:bg-amber-600 text-amber-50 font-display text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-3 h-3" /> JUGAR
          </button>
          {!isActive && (
            <button
              onClick={onSetActive}
              disabled={!isValid || busy}
              className="px-2 h-8 rounded-md bg-stone-700/70 hover:bg-stone-600/70 text-amber-200/90 font-display text-[10px] tracking-wider disabled:opacity-40 transition-colors"
              title="Marcar como activo"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-stone-700/70 hover:bg-stone-600/70 text-amber-200/90 transition-colors disabled:opacity-40"
              title="Editar"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-stone-700/70 hover:bg-stone-600/70 text-amber-200/90 transition-colors disabled:opacity-40"
              title="Duplicar"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-red-900/60 hover:bg-red-800/70 text-red-100 transition-colors disabled:opacity-40"
              title="Eliminar"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
