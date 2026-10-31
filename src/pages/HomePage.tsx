import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import ProfileMenu from '@/components/auth/ProfileMenu';
import BrandHero from '@/components/layout/BrandHero';
import TerminalPanel from '@/components/layout/TerminalPanel';
import { deckDisplayName, getActiveDeckId, useDecks } from '@/hooks/useDecks';
import { useCollection } from '@/hooks/useCollection';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, profile, signOut, updateProfile } = useAuthContext();
  const { decks } = useDecks(user.id);
  const { coins, loading: coinsLoading } = useCollection(user.id);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getActiveDeckId(user.id).then((id) => {
      if (!cancelled) setActiveId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const activeDeck = activeId ? decks.find((d) => d.id === activeId) ?? null : null;

  const handleDebugLocal = () => {
    if (activeDeck) {
      navigate(ROUTES.PLAY, { state: { composition: activeDeck.cards } });
    } else {
      navigate(ROUTES.DECKS);
    }
  };

  const initials = profile.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-[100dvh] w-full flex items-center relative overflow-hidden bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-[15%] w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-[15%] w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 pt-20 pb-10 lg:py-16 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-12 items-center"
      >
        {/* Left column: brand + player summary */}
        <div className="flex flex-col gap-6 lg:gap-8">
          <BrandHero tagline={t('home.tagline')} />

          <div className="rounded-lg border border-cyan-500/15 bg-[hsl(220,20%,8%)]/80 backdrop-blur-md p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border-2 border-cyan-400/30 shadow-[0_0_15px_-3px_hsl(200,100%,50%,0.25)]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-cyan-900/50 border-2 border-cyan-400/30 flex items-center justify-center font-display text-sm font-bold text-cyan-100">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-display text-base text-cyan-100 tracking-wide truncate">{profile.display_name}</p>
                <p className="text-[11px] font-body text-cyan-300/40 truncate">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('home.coins')} value={coinsLoading ? '—' : coins} icon="🪙" />
              <Stat label={t('home.decksCount')} value={decks.length} icon="🃏" />
            </div>

            <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
              <span className="text-2xl shrink-0">{activeDeck?.cover_emoji ?? '❔'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-body uppercase tracking-widest text-emerald-300/50">{t('home.activeDeck')}</p>
                <p className="font-display text-xs text-emerald-100 truncate">
                  {activeDeck ? deckDisplayName(activeDeck) : t('home.noActiveDeck')}
                </p>
              </div>
              <button
                onClick={() => navigate(ROUTES.DECKS)}
                className="shrink-0 px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-200/80 hover:text-emerald-100 hover:bg-emerald-500/10 font-display text-[10px] tracking-wider uppercase transition-colors"
              >
                {t('home.change')}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: main menu */}
        <TerminalPanel path="~/bug-hunters/main-menu" footer={t('home.tip')} bodyClassName="p-4 sm:p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MenuTile
              onClick={handleDebugLocal}
              icon="▶"
              title={t('home.playVsAi')}
              desc={t('home.playVsAiDesc')}
              className="col-span-2 sm:row-span-2 min-h-[150px] sm:min-h-[230px] bg-gradient-to-br from-cyan-600/80 to-blue-700/80 hover:from-cyan-500/90 hover:to-blue-600/90 border-cyan-400/30 text-white shadow-[0_0_25px_-5px_hsl(200,100%,50%,0.35)] hover:shadow-[0_0_35px_-5px_hsl(200,100%,50%,0.55)]"
              large
            />
            <MenuTile
              onClick={() => navigate(ROUTES.ONLINE)}
              icon="🌐"
              title="ONLINE PvP"
              desc={t('home.onlineDesc')}
              className="col-span-2 min-h-[110px] bg-gradient-to-br from-emerald-700/60 to-teal-800/60 hover:from-emerald-600/70 hover:to-teal-700/70 border-emerald-400/30 text-emerald-50"
            />
            <MenuTile
              onClick={() => navigate(ROUTES.GACHA)}
              icon="📦"
              title={t('home.recruit')}
              desc={t('home.recruitDesc')}
              className="min-h-[110px] bg-gradient-to-b from-purple-600/30 to-purple-900/30 hover:from-purple-500/40 hover:to-purple-800/40 border-purple-500/25 hover:border-purple-400/40 text-purple-100 shadow-[0_0_15px_-5px_hsl(260,80%,60%,0.2)] hover:shadow-[0_0_20px_-5px_hsl(260,80%,60%,0.4)]"
            />
            <MenuTile
              onClick={() => navigate(ROUTES.DECKS)}
              icon="🃏"
              title={t('home.myDecks')}
              desc={t('home.myDecksDesc')}
              className="min-h-[110px] bg-gradient-to-b from-emerald-600/30 to-emerald-900/30 hover:from-emerald-500/40 hover:to-emerald-800/40 border-emerald-500/25 hover:border-emerald-400/40 text-emerald-100 shadow-[0_0_15px_-5px_hsl(150,80%,45%,0.2)] hover:shadow-[0_0_20px_-5px_hsl(150,80%,45%,0.4)]"
            />
            {profile.admin && (
              <MenuTile
                onClick={() => navigate(ROUTES.CARD_CREATE)}
                icon="🧪"
                title={t('home.createCard')}
                desc={t('home.createCardDesc')}
                className="col-span-2 sm:col-span-4 min-h-[64px] bg-gradient-to-r from-cyan-600/25 to-cyan-900/25 hover:from-cyan-500/35 hover:to-cyan-800/35 border-cyan-500/25 hover:border-cyan-400/40 text-cyan-100"
                inline
              />
            )}
          </div>
        </TerminalPanel>
      </motion.div>

      {/* Profile menu - top right */}
      <ProfileMenu
        profile={profile}
        email={user.email}
        onSignOut={() => { void signOut(); }}
        onSaveProfile={updateProfile}
      />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: ReactNode; icon: string }) {
  return (
    <div className="rounded-md bg-[hsl(220,15%,11%)] border border-cyan-900/40 px-3 py-2 flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-body uppercase tracking-widest text-cyan-300/40">{label}</p>
        <p className="font-display text-sm text-cyan-100 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

interface MenuTileProps {
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
  className?: string;
  large?: boolean;
  inline?: boolean;
}

function MenuTile({ onClick, icon, title, desc, className, large, inline }: MenuTileProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'group relative rounded-md border p-4 text-left flex transition-all overflow-hidden',
        inline ? 'flex-row items-center gap-3' : 'flex-col justify-between gap-2',
        className,
      )}
    >
      <span className={cn('leading-none', large ? 'text-4xl sm:text-5xl' : 'text-2xl')}>{icon}</span>
      <span className={cn('flex flex-col gap-1', inline && 'flex-1')}>
        <span className={cn('font-display tracking-[0.15em] uppercase', large ? 'text-base sm:text-xl' : 'text-[11px] sm:text-xs')}>
          {title}
        </span>
        <span className={cn('font-body leading-snug opacity-60', large ? 'text-sm' : 'text-[11px]')}>{desc}</span>
      </span>
    </motion.button>
  );
}
