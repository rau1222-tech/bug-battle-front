import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Profile } from '@/hooks/useProfile';

interface ProfileMenuProps {
  profile: Profile;
  email?: string;
  onSignOut: () => void;
}

export default function ProfileMenu({ profile, email, onSignOut }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowDetails(false);
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
        onClick={() => { setOpen(!open); setShowDetails(false); }}
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
            {!showDetails ? (
              <>
                <button
                  onClick={() => setShowDetails(true)}
                  className="w-full text-left px-4 py-3 text-xs font-display text-amber-100/70 hover:text-amber-100 hover:bg-amber-700/20 transition-colors flex items-center gap-2"
                >
                  <span className="text-sm">👤</span> Mis datos
                </button>
                <div className="h-px bg-amber-700/15" />
                <button
                  onClick={() => { setOpen(false); onSignOut(); }}
                  className="w-full text-left px-4 py-3 text-xs font-display text-red-400/70 hover:text-red-300 hover:bg-red-900/20 transition-colors flex items-center gap-2"
                >
                  <span className="text-sm">🚪</span> Cerrar sesión
                </button>
              </>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-amber-600/40" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-amber-700/60 border border-amber-500/40 flex items-center justify-center text-sm font-display text-amber-100 font-bold">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-sm text-amber-100 truncate">{profile.display_name}</p>
                    {email && <p className="text-[10px] text-amber-200/40 font-body truncate">{email}</p>}
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-[10px] font-display text-amber-200/40 hover:text-amber-200/60 transition-colors self-start"
                >
                  ← Volver
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
