import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EditProfileModal from '@/components/auth/EditProfileModal';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { Profile, ProfileUpdate } from '@/hooks/useProfile';
import { useI18n } from '@/i18n';

interface ProfileMenuProps {
  profile: Profile;
  email?: string;
  onSignOut: () => void;
  onSaveProfile: (changes: ProfileUpdate) => Promise<unknown>;
}

export default function ProfileMenu({ profile, email, onSignOut, onSaveProfile }: ProfileMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = profile.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="fixed top-4 right-4 z-30">
      {/* Avatar bubble + name */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-stone-900/70 hover:bg-stone-800/80 border border-amber-700/30 backdrop-blur-md shadow-lg shadow-black/30 transition-all hover:border-amber-500/40 group"
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full object-cover border border-amber-600/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-amber-700/60 border border-amber-500/40 flex items-center justify-center text-[10px] font-display text-amber-100 font-bold">
            {initials}
          </div>
        )}
        <span className="font-display text-xs text-amber-100/80 tracking-wide group-hover:text-amber-100 transition-colors max-w-[120px] truncate">
          {profile.display_name}
        </span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 rounded-xl bg-stone-900/95 border border-amber-700/30 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="px-4 py-2.5 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs font-display text-amber-100/70 flex items-center gap-2">
                <span className="text-sm">🌐</span> {t('common.language')}
              </span>
              <LanguageSwitcher />
            </div>
            <div className="h-px bg-amber-700/15" />
            <button
              onClick={() => { setOpen(false); setEditing(true); }}
              className="w-full text-left px-4 py-3 text-xs font-display text-amber-100/70 hover:text-amber-100 hover:bg-amber-700/20 transition-colors flex items-center gap-2"
            >
              <span className="text-sm">👤</span> {t('auth.myData')}
            </button>
            <div className="h-px bg-amber-700/15" />
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full text-left px-4 py-3 text-xs font-display text-red-400/70 hover:text-red-300 hover:bg-red-900/20 transition-colors flex items-center gap-2"
            >
              <span className="text-sm">🚪</span> {t('auth.signOut')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <EditProfileModal
        open={editing}
        onOpenChange={setEditing}
        profile={profile}
        email={email}
        onSave={onSaveProfile}
      />
    </div>
  );
}