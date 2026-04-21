import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GameBoard from '@/components/game/GameBoard';
import DeckSelectorScreen from '@/components/decks/DeckSelectorScreen';
import DeckBuilderScreen from '@/components/decks/DeckBuilderScreen';
import GachaScreen from '@/components/gacha/GachaScreen';
import AuthScreen from '@/components/auth/AuthScreen';
import ProfileMenu from '@/components/auth/ProfileMenu';
import PickNameScreen from '@/components/auth/PickNameScreen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useDecks, getActiveDeckId, type DeckSummary } from '@/hooks/useDecks';
import boardBg from '@/assets/game-board-bg.png';

type Screen = 'menu' | 'deck-selector' | 'deck-builder' | 'game-bot' | 'gacha';

export default function Index() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [editing, setEditing] = useState<DeckSummary | null>(null);
  const [activeComposition, setActiveComposition] = useState<{ card_id: string; quantity: number }[] | undefined>(undefined);

  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } = useAuth();
  const { profile, needsSetup, loading: profileLoading, createProfile } = useProfile(user);
  const { decks, refresh } = useDecks(user?.id);

  const playerName = profile?.display_name ?? 'Jugador';

  // Resolve active deck composition before launching game
  const launchGame = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (deck) {
      setActiveComposition(deck.cards);
      setScreen('game-bot');
    }
  };

  // From "Debug Local": go to selector if no active deck, else launch directly
  const handleDebugLocal = () => {
    const activeId = getActiveDeckId();
    const active = activeId ? decks.find((d) => d.id === activeId) : null;
    if (active) {
      setActiveComposition(active.cards);
      setScreen('game-bot');
    } else {
      setScreen('deck-selector');
    }
  };

  // Show loading spinner while checking auth or profile
  if (authLoading || (user && profileLoading)) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-stone-950">
        <div className="text-amber-200/50 font-display text-sm animate-pulse">Cargando...</div>
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return (
      <AuthScreen
        onSignInEmail={async (email, password) => {
          const err = await signInWithEmail(email, password);
          return { error: err?.message ?? null };
        }}
        onSignUpEmail={async (email, password) => {
          const err = await signUpWithEmail(email, password);
          return { error: err?.message ?? null };
        }}
        onSignInGoogle={async () => {
          const err = await signInWithGoogle();
          return { error: err?.message ?? null };
        }}
      />
    );
  }

  // Show name picker for new users (Google sign-in without profile)
  if (needsSetup) {
    const meta = user.user_metadata ?? {};
    const suggestedName = meta.full_name ?? meta.name ?? '';
    const avatarUrl = meta.avatar_url ?? meta.picture ?? null;
    return (
      <PickNameScreen
        suggestedName={suggestedName}
        avatarUrl={avatarUrl}
        onConfirm={createProfile}
      />
    );
  }

  if (screen === 'game-bot') {
    return <GameBoard deckComposition={activeComposition} onExit={() => setScreen('menu')} playerName={playerName} />;  
  }

  if (screen === 'gacha') {
    return <GachaScreen onBack={() => setScreen('menu')} />;
  }

  if (screen === 'deck-selector') {
    return (
      <DeckSelectorScreen
        onBack={() => setScreen('menu')}
        onPlay={launchGame}
        onCreate={() => {
          setEditing(null);
          setScreen('deck-builder');
        }}
        onEdit={(deck) => {
          setEditing(deck);
          setScreen('deck-builder');
        }}
      />
    );
  }

  if (screen === 'deck-builder') {
    if (!user) {
      return (
        <div className="h-[100dvh] flex items-center justify-center bg-stone-950 text-amber-200 font-display flex-col gap-4">
          <p>Se necesita conexión para crear/editar mazos.</p>
          <button
            onClick={() => setScreen('deck-selector')}
            className="px-4 py-2 rounded-lg bg-amber-700/70 text-amber-100 hover:bg-amber-600/70 border border-amber-500/30 font-display text-sm"
          >
            ← Volver a mazos
          </button>
        </div>
      );
    }
    return (
      <DeckBuilderScreen
        userId={user.id}
        editing={editing}
        onBack={() => setScreen('deck-selector')}
        onSaved={async () => {
          await refresh();
          setScreen('deck-selector');
        }}
      />
    );
  }

  return (
    <div
      className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-8 z-10 px-6"
      >
        {/* Logo */}
        <div className="text-center">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-7xl mb-4"
          >
            🐛
          </motion.div>
          <h1 className="text-4xl font-display font-bold text-amber-100 tracking-wider drop-shadow-lg">
            BUG HUNTERS
          </h1>
          <p className="text-sm font-body text-amber-200/50 mt-2">
            Juego de Cartas Coleccionables
          </p>
        </div>

        {/* Play buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleDebugLocal}
            className="h-14 font-display text-sm tracking-wide rounded-xl bg-amber-700/70 text-amber-100 hover:bg-amber-600/70 border border-amber-500/30 backdrop-blur-sm shadow-lg shadow-black/30 transition-all hover:shadow-amber-500/10"
          >
            🤖 DEBUG LOCAL (VS IA)
          </button>
          <button
            disabled
            className="h-14 font-display text-sm tracking-wide rounded-xl bg-stone-800/50 text-amber-200/30 border border-amber-900/20 backdrop-blur-sm cursor-not-allowed"
          >
            🌐 ONLINE PvP (Próximamente)
          </button>
        </div>

        <p className="text-[11px] text-amber-200/30 font-body text-center max-w-xs">
          Arrastra tus Programadores al Bug para reducir su complejidad. Usa cartas QA contra los programadores rivales. ¡El golpe final gana el punto!
        </p>
      </motion.div>

      {/* Deck button — bottom right */}
      <motion.button
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        onClick={() => setScreen('deck-selector')}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-stone-900/80 text-amber-100 hover:bg-stone-800/90 border border-amber-700/40 backdrop-blur-md shadow-lg shadow-black/40 transition-all hover:border-amber-500/50 hover:shadow-amber-900/20 group"
      >
        <span className="text-lg group-hover:scale-110 transition-transform">🃏</span>
        <span className="font-display text-xs tracking-[0.15em] uppercase">Mis Mazos</span>
      </motion.button>

      {/* Gacha button — bottom left */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        onClick={() => setScreen('gacha')}
        className="fixed bottom-5 left-5 z-20 flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-gradient-to-r from-purple-900/70 to-indigo-900/70 text-purple-100 hover:from-purple-800/80 hover:to-indigo-800/80 border border-purple-500/30 backdrop-blur-md shadow-lg shadow-purple-900/30 transition-all hover:border-purple-400/50 hover:shadow-purple-500/20 group"
      >
        <span className="text-lg group-hover:scale-110 transition-transform">📦</span>
        <span className="font-display text-xs tracking-[0.15em] uppercase">Reclutar</span>
      </motion.button>

      {/* Profile menu — top right */}
      {profile && <ProfileMenu profile={profile} email={user?.email} onSignOut={signOut} />}
    </div>
  );
}
