import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GameBoardView } from '@/components/game/GameBoard';
import { useAuthContext } from '@/contexts/AuthContext';
import { deleteMatch, leaveMatch, useOnlineMatch } from '@/hooks/useOnlineMatch';
import { ROUTES } from '@/routes';

const shell = 'min-h-[100dvh] w-full flex flex-col items-center justify-center gap-4 bg-[hsl(220,20%,6%)] bg-grid-pattern px-4 text-center';
const panel = 'w-full max-w-sm rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 p-6 flex flex-col items-center gap-4';
const ghostBtn = 'font-display text-xs tracking-wider text-cyan-300/60 hover:text-cyan-200';

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  if (!matchId) return <Navigate to={ROUTES.ONLINE} replace />;
  return <MatchScreen matchId={matchId} />;
}

function MatchScreen({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
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
          <button className={ghostBtn} onClick={() => navigate(ROUTES.ONLINE)}>← VOLVER</button>
        </div>
      </div>
    );
  }

  if (!match) {
    return <div className={`${shell} text-cyan-300/60 font-display text-sm tracking-wider`}>Conectando…</div>;
  }

  if (match.status === 'waiting') {
    const link = `${window.location.origin}${ROUTES.ONLINE}?code=${match.code}`;
    return (
      <div className={shell}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={panel}>
          <p className="text-[10px] font-body text-cyan-400/50 uppercase tracking-widest">Comparte este código</p>
          <button
            onClick={() => copy('code', match.code)}
            className="font-display text-4xl tracking-[0.35em] text-cyan-100 bg-cyan-500/10 border border-cyan-400/40 rounded-lg px-5 py-3"
            title="Copiar código"
          >
            {match.code}
          </button>
          <div className="flex gap-4">
            <button className={ghostBtn} onClick={() => copy('code', match.code)}>{copied === 'code' ? '✔ COPIADO' : '📋 COPIAR CÓDIGO'}</button>
            <button className={ghostBtn} onClick={() => copy('link', link)}>{copied === 'link' ? '✔ COPIADO' : '🔗 COPIAR ENLACE'}</button>
          </div>
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-sm font-body text-cyan-200/70"
          >
            Esperando a que se una tu rival…
          </motion.p>
          <button className="font-display text-xs tracking-wider text-red-300/70 hover:text-red-200" onClick={() => void exit()}>
            CANCELAR
          </button>
        </motion.div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className={shell}>
        <div className={panel}>
          <p className="text-cyan-200/70 font-body text-sm">Esta partida ya no está disponible.</p>
          <button className={ghostBtn} onClick={() => navigate(ROUTES.ONLINE)}>← VOLVER</button>
        </div>
      </div>
    );
  }

  const rival = opponentName ?? 'Rival';
  const ended = match.status === 'abandoned' && game.gamePhase !== 'game-over';
  const banner = match.status === 'active' && opponentOnline === false && game.gamePhase !== 'game-over' ? (
    <div className="text-[11px] font-body text-amber-100 bg-black/70 border border-amber-500/40 rounded-lg px-3 py-2">
      📡 {rival} se ha desconectado. Si no vuelve y lleva 2 min sin jugar su turno, puedes salir sin perder.
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
              {match.winner_id === user.id ? '¡VICTORIA!' : 'PARTIDA TERMINADA'}
            </h2>
            <p className="text-sm font-body text-amber-200/60">
              {match.winner_id === user.id ? `${rival} ha abandonado la partida.` : 'La partida se ha cerrado.'}
            </p>
            <button className={ghostBtn} onClick={() => navigate(ROUTES.HOME)}>VOLVER AL MENÚ</button>
          </div>
        </div>
      )}
    </>
  );
}
