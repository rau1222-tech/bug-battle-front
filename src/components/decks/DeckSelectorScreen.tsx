import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Copy, Trash2, Play, Loader2, Check } from 'lucide-react';
import BackButton from '@/components/ui/BackButton';
import { useAuth } from '@/hooks/useAuth';
import {
  useDecks,
  deleteDeckRecord,
  duplicateDeck,
  setActiveDeckId,
  getActiveDeckId,
  type DeckSummary,
} from '@/hooks/useDecks';
import { toast } from 'sonner';

interface Props {
  onBack: () => void;
  onPlay: (deckId: string) => void;
  onCreate: () => void;
  onEdit: (deck: DeckSummary) => void;
}

export default function DeckSelectorScreen({ onBack, onPlay, onCreate, onEdit }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { decks, loading, refresh } = useDecks(user?.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setActiveId(null);
      return;
    }
    void getActiveDeckId(user.id).then((id) => {
      if (!cancelled) setActiveId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
        await setActiveDeckId(user?.id, null);
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

  const handlePlay = async (deck: DeckSummary) => {
    await setActiveDeckId(user?.id, deck.id);
    setActiveId(deck.id);
    onPlay(deck.id);
  };

  const handleSetActive = async (deck: DeckSummary) => {
    await setActiveDeckId(user?.id, deck.id);
    setActiveId(deck.id);
    toast.success(`"${deck.name}" seleccionado`);
  };

  const presets = decks.filter((d) => d.is_preset);
  const mine = decks.filter((d) => !d.is_preset);

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow */}
      <div className="fixed top-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/3 left-1/3 w-60 h-60 bg-teal-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} color="emerald" />
          <h1 className="font-display text-lg sm:text-2xl text-emerald-100 tracking-wider text-glow-green">
            🃏 MIS MAZOS
          </h1>
          <div className="w-20" />
        </div>

        {(authLoading || loading) && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-300/70 animate-spin" />
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
                      onPlay={() => { void handlePlay(d); }}
                      onSetActive={() => { void handleSetActive(d); }}
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
                  className="group min-h-[120px] rounded-lg border-2 border-dashed border-emerald-600/30 bg-[hsl(220,20%,8%)]/60 hover:bg-[hsl(220,20%,10%)]/70 hover:border-emerald-400/50 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <Plus className="w-8 h-8 text-emerald-300/50 group-hover:text-emerald-200 transition-colors" />
                  <span className="font-display text-xs tracking-wider text-emerald-200/60 group-hover:text-emerald-100">
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
                      onPlay={() => { void handlePlay(d); }}
                      onSetActive={() => { void handleSetActive(d); }}
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
      <div className="rounded-lg border border-emerald-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden">
        {/* Section title bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-emerald-500/10 bg-[hsl(220,18%,10%)]">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
            <div className="w-2 h-2 rounded-full bg-green-500/60" />
          </div>
          <div className="ml-2">
            <span className="text-[10px] font-body text-emerald-400/50 tracking-wider uppercase">{title}</span>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs font-body text-emerald-200/40 mb-3">{subtitle}</p>
          {children}
        </div>
      </div>
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
      className={`relative rounded-lg border overflow-hidden transition-all ${
        isActive
          ? 'border-emerald-400/60 bg-emerald-950/30 shadow-[0_0_20px_-5px_hsl(150,80%,45%,0.2)]'
          : 'border-emerald-900/30 bg-[hsl(220,15%,11%)] hover:border-emerald-600/40'
      }`}
    >
      {isActive && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-emerald-500/90 text-emerald-950 px-1.5 py-0.5 rounded text-[9px] font-display font-bold tracking-wider">
          <Check className="w-3 h-3" /> ACTIVO
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="text-4xl sm:text-5xl shrink-0">{deck.cover_emoji}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm text-emerald-100 truncate">{deck.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-body">
              <span className="text-cyan-300/60">
                ⚡ {deck.programadores} <span className="text-cyan-300/40">prog</span>
              </span>
              <span className="text-emerald-300/70">
                🛡 {deck.qas} <span className="text-emerald-300/50">qa</span>
              </span>
              <span className={`ml-auto font-display font-bold ${isValid ? 'text-emerald-300' : 'text-red-400'}`}>
                {deck.total}/20
              </span>
            </div>
            <span
              className={`inline-block mt-1.5 text-[8px] font-display tracking-wider px-1.5 py-0.5 rounded uppercase ${
                deck.is_preset
                  ? 'bg-[hsl(220,15%,15%)] text-emerald-200/60'
                  : 'bg-emerald-900/40 text-emerald-200/90 border border-emerald-600/20'
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
            className="flex-1 min-w-[80px] flex items-center justify-center gap-1 h-8 rounded-md bg-emerald-600/60 hover:bg-emerald-500/70 text-emerald-50 font-display text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-emerald-500/20"
          >
            <Play className="w-3 h-3" /> JUGAR
          </button>
          {!isActive && (
            <button
              onClick={onSetActive}
              disabled={!isValid || busy}
              className="px-2 h-8 rounded-md bg-[hsl(220,15%,15%)] hover:bg-[hsl(220,15%,20%)] text-emerald-200/80 font-display text-[10px] tracking-wider disabled:opacity-40 transition-colors border border-emerald-800/30"
              title="Marcar como activo"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-[hsl(220,15%,15%)] hover:bg-[hsl(220,15%,20%)] text-emerald-200/80 transition-colors disabled:opacity-40 border border-emerald-800/30"
              title="Editar"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-[hsl(220,15%,15%)] hover:bg-[hsl(220,15%,20%)] text-emerald-200/80 transition-colors disabled:opacity-40 border border-emerald-800/30"
              title="Duplicar"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="px-2 h-8 rounded-md bg-red-900/40 hover:bg-red-800/60 text-red-200 transition-colors disabled:opacity-40 border border-red-700/20"
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
