import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import BackButton from '@/components/ui/BackButton';
import TerminalPanel from '@/components/layout/TerminalPanel';
import { useAuthContext } from '@/contexts/AuthContext';
import { deckDisplayName, getActiveDeckId, useDecks } from '@/hooks/useDecks';
import { cancelRandomMatch, createMatch, findRandomMatch, joinMatch } from '@/hooks/useOnlineMatch';
import { DECK_SIZE, MAX_COPIES } from '@/constants';
import { matchPath, ROUTES } from '@/routes';
import { useI18n } from '@/i18n';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const QUEUE_POLL_MS = 2000;
const UNEXPECTED_ERROR = 'online.unexpectedError';

/** Known errors raised by the database RPCs (in Spanish) mapped to translation keys. */
const ERROR_KEYS: Record<string, string> = {
  [UNEXPECTED_ERROR]: UNEXPECTED_ERROR,
  'No autenticado': 'online.db.notAuthenticated',
  'Perfil no encontrado': 'online.db.profileNotFound',
  'Mazo no encontrado': 'online.db.deckNotFound',
  'El mazo debe tener 20 cartas y máximo 2 copias (edítalo y guárdalo de nuevo)': 'online.db.invalidDeck',
  'No se pudo generar un código, inténtalo de nuevo': 'online.db.codeGenerationFailed',
  'No se pudo crear la partida, inténtalo de nuevo': 'online.db.createFailed',
  'No existe ninguna partida con ese código': 'online.db.codeNotFound',
  'La partida ya ha terminado': 'online.db.matchFinished',
  'La partida ya no está disponible': 'online.db.matchUnavailable',
};

export default function OnlinePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
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
        setError(e instanceof Error ? e.message : UNEXPECTED_ERROR);
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
      setError(e instanceof Error ? e.message : UNEXPECTED_ERROR);
      setBusy(false);
    }
  };

  const handleCreate = () => deckId && run(async () => (await createMatch(deckId)).id);
  const handleJoin = () => deckId && run(() => joinMatch(code, deckId));
  const codeValid = CODE_RE.test(code);

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="fixed top-1/4 left-1/4 w-80 h-80 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-72 h-72 bg-fuchsia-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center justify-between mb-6 gap-2">
          <BackButton onClick={() => navigate(ROUTES.HOME)} color="cyan" />
          <h1 className="font-display text-lg sm:text-2xl text-cyan-100 tracking-[0.2em] text-glow-blue">{t('online.title')}</h1>
          <div className="w-20" />
        </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4 items-start"
      >
        <TerminalPanel path="~/bug-hunters/online/deck" bodyClassName="sm:p-5">
        <section className="flex flex-col gap-3">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">{t('online.chooseDeck')}</h2>
          {loading ? (
            <p className="text-xs text-cyan-200/40 font-body">{t('online.loadingDecks')}</p>
          ) : validDecks.length === 0 ? (
            <p className="text-xs text-amber-300/80 font-body">
              {t('online.needDeck', { size: DECK_SIZE, copies: MAX_COPIES })}{' '}
              <button className="underline" onClick={() => navigate(ROUTES.DECKS)}>{t('online.goToDecks')}</button>
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {validDecks.map((d) => (
                <button
                  key={d.id}
                  disabled={searching}
                  onClick={() => setDeckId(d.id)}
                  className={`p-3 rounded-md border text-left flex items-center gap-3 transition-colors disabled:cursor-not-allowed ${
                    deckId === d.id
                      ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100 shadow-[0_0_15px_-5px_hsl(200,100%,50%,0.4)]'
                      : 'border-cyan-900/40 bg-[hsl(220,15%,12%)] text-cyan-200/60 hover:border-cyan-600/50'
                  }`}
                >
                  <span className="text-3xl shrink-0">{d.cover_emoji}</span>
                  <span className="min-w-0 flex flex-col gap-1">
                    <span className="font-display text-[11px] tracking-wide truncate">{deckDisplayName(d)}</span>
                    <span className="flex gap-2 text-[10px] font-body opacity-70">
                      <span>⚡ {d.programadores}</span>
                      <span>🛡 {d.qas}</span>
                      {d.consumibles > 0 && <span>🧪 {d.consumibles}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        </TerminalPanel>

        <TerminalPanel path="~/bug-hunters/online/lobby" bodyClassName="sm:p-5 flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">{t('online.randomTitle')}</h2>
          {searchStartedAt !== null ? (
            <div className="h-12 flex items-center justify-between gap-3 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-3">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="font-display text-xs tracking-wider text-fuchsia-100"
              >
                {t('online.searching', { seconds: Math.max(0, Math.floor((now - searchStartedAt) / 1000)) })}
              </motion.span>
              <button
                onClick={() => setSearchStartedAt(null)}
                className="font-display text-xs tracking-wider text-red-300/80 hover:text-red-200"
              >
                {t('online.cancel')}
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
              {t('online.findRandom')}
            </button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">{t('online.privateTitle')}</h2>
          <button
            disabled={!deckId || busy || searching}
            onClick={handleCreate}
            className="h-12 font-display text-sm tracking-wider rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white border border-cyan-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('online.createMatch')}
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">{t('online.joinTitle')}</h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter' && codeValid) void handleJoin(); }}
              placeholder="ABC123"
              aria-label={t('online.codeLabel')}
              className="flex-1 h-12 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-900/40 text-center font-display text-xl tracking-[0.4em] text-cyan-100 placeholder:text-cyan-200/15 focus:outline-none focus:border-cyan-400/60"
            />
            <button
              disabled={!deckId || !codeValid || busy || searching}
              onClick={handleJoin}
              className="h-12 px-5 font-display text-sm tracking-wider rounded-md bg-emerald-600/70 text-white border border-emerald-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('online.join')}
            </button>
          </div>
        </section>

        {error && <p role="alert" className="text-xs text-red-300 font-body">⚠️ {ERROR_KEYS[error] ? t(ERROR_KEYS[error]) : error}</p>}
        </TerminalPanel>
      </motion.div>
      </div>
    </div>
  );
}
