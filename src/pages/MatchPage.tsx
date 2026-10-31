import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GameBoardView } from '@/components/game/GameBoard';
import { useAuthContext } from '@/contexts/AuthContext';
import { deleteMatch, leaveMatch, useOnlineMatch } from '@/hooks/useOnlineMatch';
import { ROUTES } from '@/routes';
import { useI18n } from '@/i18n';

const shell = 'min-h-[100dvh] w-full flex flex-col items-center justify-center gap-4 bg-[hsl(220,20%,6%)] bg-grid-pattern px-4 text-center';
const panel = 'w-full max-w-sm rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 p-6 flex flex-col items-center gap-4';
const ghostBtn = 'font-display text-xs tracking-wider text-cyan-300/60 hover:text-cyan-200';

function MatchLoading({ rival }: { rival: string | null }) {
  const { t } = useI18n();
  return (
    <div className={shell}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={panel}>
        <div className="relative w-24 h-24 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-cyan-500/20 border-t-cyan-300"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="text-4xl"
            animate={{ scale: [1, 1.15, 1], rotate: [-8, 8, -8] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            🐛
          </motion.span>
        </div>
        <h2 className="font-display text-xl tracking-wider text-cyan-100">
          {rival ? t('game.match.rivalFound') : t('game.match.preparing')}
        </h2>
        {rival && <p className="font-body text-sm text-cyan-200/80">{t('game.match.youVs')} <span className="text-amber-200">{rival}</span></p>}
        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="text-xs font-body text-cyan-300/70"
        >
          {t('game.match.startingSoon')}
        </motion.p>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-cyan-400"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  if (!matchId) return <Navigate to={ROUTES.ONLINE} replace />;
  return <MatchScreen matchId={matchId} />;
}

function MatchScreen({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, profile } = useAuthContext();
  const { match, loadError, game, opponentName, opponentOnline } = useOnlineMatch(matchId, user.id);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const exit = async () => {
    const stillPlaying = match?.status === 'waiting' || (match?.status === 'active' && game?.gamePhase !== 'game-over');
    if (stillPlaying) {
      try {
        await leaveMatch(matchId);
      } catch (e) {
        console.error('Failed to leave match:', e);
      }
    }
    await deleteMatch(matchId);
    navigate(ROUTES.ONLINE);
  };

  const copy = async (what: 'code' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be blocked (non-HTTPS / permissions); the code stays visible anyway
    }
  };

  if (loadError) {
    return (
      <div className={shell}>
        <div className={panel}>
          <p className="text-red-300 font-body text-sm">⚠️ {loadError}</p>
          <button className={ghostBtn} onClick={() => navigate(ROUTES.ONLINE)}>{t('game.match.back')}</button>
        </div>
      </div>
    );
  }

  if (!match) {
    return <MatchLoading rival={null} />;
  }

  if (match.status === 'waiting') {
    const link = `${window.location.origin}${ROUTES.ONLINE}?code=${match.code}`;
    return (
      <div className={shell}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={panel}>
          <p className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">{t('game.match.shareCode')}</p>
          <button
            onClick={() => copy('code', match.code)}
            className="font-display text-4xl tracking-[0.35em] text-cyan-100 bg-cyan-500/10 border border-cyan-400/40 rounded-lg px-5 py-3"
            title={t('game.match.copyCodeTitle')}
          >
            {match.code}
          </button>
          <div className="flex gap-4">
            <button className={ghostBtn} onClick={() => copy('code', match.code)}>            {copied === 'code' ? t('game.match.copied') : t('game.match.copyCode')}</button>
                        <button className={ghostBtn} onClick={() => copy('link', link)}>{copied === 'link' ? t('game.match.copied') : t('game.match.copyLink')}</button>
          </div>
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-sm font-body text-cyan-200/70"
          >
            {t('game.match.waiting')}
          </motion.p>
          <button className="font-display text-xs tracking-wider text-red-300/70 hover:text-red-200" onClick={() => void exit()}>
            {t('game.match.cancel')}
          </button>
        </motion.div>
      </div>
    );
  }

  if (!game) {
    // The server is still dealing the first hand
    if (match.status === 'active') return <MatchLoading rival={opponentName} />;
    return (
      <div className={shell}>
        <div className={panel}>
          <p className="text-cyan-200/70 font-body text-sm">{t('game.match.unavailable')}</p>
          <button className={ghostBtn} onClick={() => navigate(ROUTES.ONLINE)}>{t('game.match.back')}</button>
        </div>
      </div>
    );
  }

  const rival = opponentName ?? t('game.rival');
  const ended = (match.status === 'abandoned' || match.status === 'finished') && game.gamePhase !== 'game-over';
  const banner = match.status === 'active' && opponentOnline === false && game.gamePhase !== 'game-over' ? (
    <div className="text-[11px] font-body text-amber-100 bg-black/70 border border-amber-500/40 rounded-lg px-3 py-2">
      {t('game.match.opponentDisconnected', { name: rival })}
    </div>
  ) : null;

  return (
    <>
      <GameBoardView
        game={game}
        online
        onExit={() => void exit()}
        playerName={profile.display_name}
        opponentName={rival}
        banner={banner}
      />
      {ended && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center">
          <div className={panel}>
            <div className="text-6xl">{match.winner_id === user.id ? '🏆' : '🚪'}</div>
            <h2 className="font-display text-2xl text-amber-100">
              {match.winner_id === user.id ? t('game.victory') : t('game.match.finished')}
            </h2>
            <p className="text-sm font-body text-amber-200/60">
              {match.winner_id === user.id ? t('game.match.rivalLeft', { name: rival }) : t('game.match.closed')}
            </p>
            <button className={ghostBtn} onClick={() => navigate(ROUTES.HOME)}>{t('game.backToMenu')}</button>
          </div>
        </div>
      )}
    </>
  );
}
