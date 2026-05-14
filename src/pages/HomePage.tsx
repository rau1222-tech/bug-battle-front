import { motion } from 'framer-motion';
import ProfileMenu from '@/components/auth/ProfileMenu';
import { getActiveDeckId, useDecks } from '@/hooks/useDecks';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuthContext();
  const { decks } = useDecks(user.id);

  const handleDebugLocal = () => {
    const activeId = getActiveDeckId();
    const active = activeId ? decks.find((d) => d.id === activeId) : null;
    if (active) {
      navigate(ROUTES.PLAY, { state: { composition: active.cards } });
    } else {
      navigate(ROUTES.DECKS);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-60 h-60 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="z-10 w-full max-w-sm px-4"
      >
        {/* Logo section */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-6xl mb-3 inline-block"
          >
            🐛
          </motion.div>
          <h1 className="text-3xl font-display font-bold text-cyan-100 tracking-[0.2em] text-glow-blue">
            BUG HUNTERS
          </h1>
          <p className="text-xs font-body text-cyan-300/40 mt-1 tracking-wider uppercase">
            Collectible Card Game
          </p>
        </div>

        {/* Terminal-style panel */}
        <div className="rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.15)] overflow-hidden">
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-cyan-500/10 bg-[hsl(220,18%,10%)]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="ml-2 text-[10px] font-body text-cyan-400/50 tracking-wider uppercase">
              ~/bug-hunters/main-menu
            </span>
          </div>

          {/* Panel content */}
          <div className="p-4 flex flex-col gap-3">
            {/* Primary action: Play */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDebugLocal}
              className="w-full h-14 font-display text-sm tracking-wider rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 shadow-[0_0_20px_-5px_hsl(200,100%,50%,0.3)] transition-all hover:shadow-[0_0_25px_-5px_hsl(200,100%,50%,0.5)] flex items-center justify-center gap-2"
            >
              <span className="text-lg">▶</span>
              <span>JUGAR VS IA</span>
            </motion.button>

            {/* Disabled PvP */}
            <button
              disabled
              className="w-full h-12 font-display text-xs tracking-wider rounded-md bg-[hsl(220,15%,12%)] text-cyan-200/20 border border-cyan-900/20 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="text-sm">🌐</span>
              <span>ONLINE PvP — PRÓXIMAMENTE</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
              <span className="text-[9px] font-body text-cyan-500/30 uppercase tracking-widest">Colección</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            </div>

            {/* Secondary actions row */}
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(ROUTES.GACHA)}
                className="h-14 flex flex-col items-center justify-center gap-1 rounded-md bg-gradient-to-b from-purple-600/30 to-purple-900/30 text-purple-200 hover:from-purple-500/40 hover:to-purple-800/40 border border-purple-500/25 shadow-[0_0_15px_-5px_hsl(260,80%,60%,0.2)] transition-all hover:shadow-[0_0_20px_-5px_hsl(260,80%,60%,0.4)] hover:border-purple-400/40"
              >
                <span className="text-xl">📦</span>
                <span className="font-display text-[10px] tracking-[0.15em] uppercase">Reclutar</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(ROUTES.DECKS)}
                className="h-14 flex flex-col items-center justify-center gap-1 rounded-md bg-gradient-to-b from-emerald-600/30 to-emerald-900/30 text-emerald-200 hover:from-emerald-500/40 hover:to-emerald-800/40 border border-emerald-500/25 shadow-[0_0_15px_-5px_hsl(150,80%,45%,0.2)] transition-all hover:shadow-[0_0_20px_-5px_hsl(150,80%,45%,0.4)] hover:border-emerald-400/40"
              >
                <span className="text-xl">🃏</span>
                <span className="font-display text-[10px] tracking-[0.15em] uppercase">Mis Mazos</span>
              </motion.button>
            </div>
          </div>

          {/* Terminal footer */}
          <div className="px-4 py-2 border-t border-cyan-500/10 bg-[hsl(220,18%,10%)]">
            <p className="text-[10px] font-body text-cyan-400/30 flex items-center gap-1">
              <span className="text-green-400/60">❯</span> Arrastra Programadores al Bug. Usa QA contra rivales. ¡El golpe final gana!
            </p>
          </div>
        </div>
      </motion.div>

      {/* Profile menu - top right */}
      <ProfileMenu profile={profile} email={user.email} onSignOut={() => { void signOut(); }} />
    </div>
  );
}
