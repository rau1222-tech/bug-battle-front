import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { clearCachedProfile } from '@/hooks/useProfile';
import { useI18n } from '@/i18n';
import { dangerButtonClass, inputClass, secondaryButtonClass } from './dialogStyles';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  displayName: string;
}

export default function DeleteAccountDialog({ open, onOpenChange, userId, displayName }: DeleteAccountDialogProps) {
  const { t } = useI18n();
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmText('');
    setError(null);
  }, [open]);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText.trim() !== displayName) return;
    setDeleting(true);
    setError(null);
    const { error: err } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (err) {
      setDeleting(false);
      setError(t('auth.deleteError'));
      return;
    }
    clearCachedProfile(userId);
    // The user no longer exists server-side, so only the local session can be cleared.
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-sm border-red-500/30 bg-[hsl(220,20%,8%)] text-red-50 shadow-[0_0_40px_-10px_hsl(0,80%,55%,0.35)] [&>button]:text-red-300">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-red-200 flex items-center gap-2">
            <span aria-hidden>⚠️</span> {t('auth.deleteAccount')}
          </DialogTitle>
          <DialogDescription className="text-[11px] font-body text-red-200/60">{t('auth.deleteAccountDesc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDelete} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-display uppercase tracking-widest text-red-300/60">
              {t('auth.deleteAccountConfirmLabel', { name: displayName })}
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
              className={`${inputClass} border-red-500/20 focus:border-red-400/50`}
            />
          </label>

          {error && <p className="text-xs text-red-400 font-body text-center">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => onOpenChange(false)} disabled={deleting} className={secondaryButtonClass}>
              {t('auth.cancel')}
            </button>
            <button type="submit" disabled={deleting || confirmText.trim() !== displayName} className={dangerButtonClass}>
              {deleting ? t('auth.deleting') : t('auth.deleteForever')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
