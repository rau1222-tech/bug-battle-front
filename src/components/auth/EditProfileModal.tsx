import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Profile, ProfileUpdate } from '@/hooks/useProfile';
import { AVATAR_URL_MAX, DISPLAY_NAME_MAX, validateAvatarUrl, validateDisplayName } from '@/lib/profile';
import { useI18n } from '@/i18n';

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  email?: string;
  onSave: (changes: ProfileUpdate) => Promise<unknown>;
}

const inputClass =
  'h-10 w-full px-3 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 transition-all';

export default function EditProfileModal({ open, onOpenChange, profile, email, onSave }: EditProfileModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(profile.display_name);
    setAvatarUrl(profile.avatar_url ?? '');
    setPreviewFailed(false);
    setError(null);
  }, [open, profile.display_name, profile.avatar_url]);

  const trimmedUrl = avatarUrl.trim();
  const urlError = validateAvatarUrl(avatarUrl);
  const showPreview = trimmedUrl && !urlError && !previewFailed;
  const initials = (name.trim() || profile.display_name)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDisplayName(name) ?? urlError;
    if (validation) {
      setError(validation);
      return;
    }
    if (trimmedUrl && previewFailed) {
      setError(t('auth.imageLoadError'));
      return;
    }

    const changes: ProfileUpdate = {};
    if (name.trim() !== profile.display_name) changes.display_name = name.trim();
    const nextAvatar = trimmedUrl || null;
    if (nextAvatar !== profile.avatar_url) changes.avatar_url = nextAvatar;

    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(changes);
      onOpenChange(false);
    } catch {
      setError(t('auth.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-sm border-cyan-500/20 bg-[hsl(220,20%,8%)] text-cyan-100 shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.25)] [&>button]:text-cyan-300">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider           text-cyan-100">{t('auth.editTitle')}</DialogTitle>
          <DialogDescription className="text-[11px] font-body text-cyan-300/40">
                      {email ?? t('auth.editDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex justify-center">
            {showPreview ? (
              <img
                src={trimmedUrl}
                alt={t('auth.avatarPreviewAlt')}
                className="w-20 h-20 rounded-full object-cover border-2 border-cyan-400/30"
                referrerPolicy="no-referrer"
                onLoad={() => setPreviewFailed(false)}
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-cyan-800/40 border-2 border-cyan-400/30 flex items-center justify-center text-xl font-display font-bold text-cyan-100">
                {initials}
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-display uppercase tracking-widest text-cyan-300/50">{t('auth.usernameLabel')}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
              autoFocus
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-display uppercase tracking-widest text-cyan-300/50">{t('auth.avatarUrlLabel')}</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setPreviewFailed(false);
              }}
              maxLength={AVATAR_URL_MAX}
              className={inputClass}
            />
            <span className="text-[10px] font-body text-cyan-300/30">
              {t('auth.avatarUrlHint')}
            </span>
            {trimmedUrl && urlError && <span className="text-[11px] font-body text-red-400">{urlError}</span>}
            {trimmedUrl && !urlError && previewFailed && (
              <span className="text-[11px] font-body text-red-400">{t('auth.imageLoadError')}</span>
            )}
          </label>

          {error && <p className="text-xs text-red-400 font-body text-center">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-10 px-4 rounded-md border border-cyan-500/15 text-cyan-200/60 hover:text-cyan-100 hover:border-cyan-400/30 font-display text-xs tracking-wider transition-colors disabled:opacity-50"
            >
              {t('auth.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 font-display text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('auth.saving') : t('auth.save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
