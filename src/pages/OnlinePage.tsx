import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthContext } from '@/contexts/AuthContext';
import { getActiveDeckId, useDecks } from '@/hooks/useDecks';
import { cancelRandomMatch, createMatch, findRandomMatch, joinMatch } from '@/hooks/useOnlineMatch';
import { DECK_SIZE, MAX_COPIES } from '@/constants';
import { matchPath, ROUTES } from '@/routes';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const QUEUE_POLL_MS = 2000;

export default function OnlinePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuthContext();
  const { decks, loading } = useDecks(user.id);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const searching = searchStartedAt !== null;

  // Poll the random queue; leaving the queue (cancel/unmount) still follows a pairing made at the last moment
  useEffect(() => {
    if (!searching || !deckId) return;
    let stopped = false;
    let found = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const id = await findRandomMatch(deckId);
        if (stopped) return;
        if (id) {
          found = true;
          navigate(matchPath(id));
          return;
        }
        timer = setTimeout(() => void poll(), QUEUE_POLL_MS);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : 'Error inesperado');
        setSearchStartedAt(null);
      }
    };
    void poll();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
      if (found) return;
      cancelRandomMatch()
        .then((id) => {
          if (id && mountedRef.current) navigate(matchPath(id));
        })
        .catch((e) => console.error('Failed to leave the queue:', e));
    };
  }, [searching, deckId, navigate]);

  const validDecks = useMemo(
    () => decks.filter((d) => d.total === DECK_SIZE && d.cards.every((c) => c.quantity <= MAX_COPIES)),
    [decks],
  );

  useEffect(() => {
    if (deckId || validDecks.length === 0) return;
    let cancelled = false;
    void getActiveDeckId(user.id).then((active) => {
      if (cancelled) return;
      setDeckId(validDecks.some((d) => d.id === active) ? active : validDecks[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [validDecks, deckId, user.id]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      navigate(matchPath(await fn()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      setBusy(false);
    }
  };

  const handleCreate = () => deckId && run(async () => (await createMatch(deckId)).id);
  const handleJoin = () => deckId && run(() => joinMatch(code, deckId));
  const codeValid = CODE_RE.test(code);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.15)] p-5 flex flex-col gap-5"
      >
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(ROUTES.HOME)} className="text-xs font-display text-cyan-300/60 hover:text-cyan-200">
            ← VOLVER
          </button>
          <h1 className="font-display text-cyan-100 tracking-[0.2em] text-lg">🌐 ONLINE PvP</h1>
          <span className="w-12" />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">1. Elige tu mazo</h2>
          {loading ? (
            <p className="text-xs text-cyan-200/40 font-body">Cargando mazos…</p>
          ) : validDecks.length === 0 ? (
            <p className="text-xs text-amber-300/80 font-body">
              Necesitas un mazo de {DECK_SIZE} cartas (máx. {MAX_COPIES} copias).{' '}
              <button className="underline" onClick={() => navigate(ROUTES.DECKS)}>Ir a mis mazos</button>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {validDecks.map((d) => (
                <button
                  key={d.id}
                  disabled={searching}
                  onClick={() => setDeckId(d.id)}
                  className={`h-12 px-3 rounded-md border text-left flex items-center gap-2 transition-colors ${
                    deckId === d.id
                      ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100'
                      : 'border-cyan-900/40 bg-[hsl(220,15%,12%)] text-cyan-200/60 hover:border-cyan-600/50'
                  }`}
                >
                  <span className="text-lg">{d.cover_emoji}</span>
                  <span className="font-display text-[11px] tracking-wide truncate">{d.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">2. Juega contra un rival aleatorio…</h2>
          {searchStartedAt !== null ? (
            <div className="h-12 flex items-center justify-between gap-3 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-3">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="font-display text-xs tracking-wider text-fuchsia-100"
              >
                🔎 BUSCANDO RIVAL… {Math.max(0, Math.floor((now - searchStartedAt) / 1000))}s
              </motion.span>
              <button
                onClick={() => setSearchStartedAt(null)}
                className="font-display text-xs tracking-wider text-red-300/80 hover:text-red-200"
              >
                CANCELAR
              </button>
            </div>
          ) : (
            <button
              disabled={!deckId || busy}
              onClick={() => {
                setError(null);
                setNow(Date.now());
                setSearchStartedAt(Date.now());
              }}
              className="h-12 font-display text-sm tracking-wider rounded-md bg-gradient-to-r from-fuchsia-600/80 to-purple-600/80 text-white border border-fuchsia-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🎲 BUSCAR PARTIDA ALEATORIA
            </button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">…o crea una partida privada…</h2>
          <button
            disabled={!deckId || busy || searching}
            onClick={handleCreate}
            className="h-12 font-display text-sm tracking-wider rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white border border-cyan-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            CREAR PARTIDA
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">…o únete con un código</h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter' && codeValid) void handleJoin(); }}
              placeholder="ABC123"
              aria-label="Código de partida"
              className="flex-1 h-12 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-900/40 text-center font-display text-xl tracking-[0.4em] text-cyan-100 placeholder:text-cyan-200/15 focus:outline-none focus:border-cyan-400/60"
            />
            <button
              disabled={!deckId || !codeValid || busy || searching}
              onClick={handleJoin}
              className="h-12 px-5 font-display text-sm tracking-wider rounded-md bg-emerald-600/70 text-white border border-emerald-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              UNIRSE
            </button>
          </div>
        </section>

        {error && <p role="alert" className="text-xs text-red-300 font-body">⚠️ {error}</p>}
      </motion.div>
    </div>
  );
}
