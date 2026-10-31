import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { translateAuthError } from '@/constants/authErrors';
import { useI18n } from '@/i18n';
import { dialogContentClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './dialogStyles';

const PASSWORD_MIN = 6;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  hasPassword: boolean;
}

export default function ChangePasswordDialog({ open, onOpenChange, email, hasPassword }: ChangePasswordDialogProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('password');
    setPassword('');
    setConfirm('');
    setCode('');
    setError(null);
  }, [open]);

  // Server-side proof of identity: the email code (nonce) is required to change the password.
  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.reauthenticate();
    setBusy(false);
    if (err) {
      setError(translateAuthError(err.message));
      return false;
    }
    return true;
  };

  const handlePasswordStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(t('auth.errors.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.errors.passwordsMismatch'));
    if (await sendCode()) setStep('code');
  };

  const handleCodeStep = async (e: React.FormEvent) => {
    e.preventDefault();
    const nonce = code.trim();
    if (!nonce) return setError(t('auth.errors.fillAllFields'));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password, nonce, data: { has_password: true } });
    setBusy(false);
    if (err) {
      setError(translateAuthError(err.message));
      return;
    }
    toast.success(hasPassword ? t('auth.passwordUpdated') : t('auth.passwordCreated'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-cyan-100 flex items-center gap-2">
            <span aria-hidden>🔒</span> {hasPassword ? t('auth.changePassword') : t('auth.setPassword')}
          </DialogTitle>
          <DialogDescription className="text-[11px] font-body text-cyan-300/50">
            {!hasPassword && <>{t('auth.setPasswordDesc')} </>}
            {t('auth.changePasswordDesc', { email })}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === 'password' ? (
          <form onSubmit={handlePasswordStep} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t('auth.newPasswordLabel')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={PASSWORD_MIN}
                autoFocus
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t('auth.confirmPasswordLabel')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </label>

            {error && <p className="text-xs text-red-400 font-body text-center">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButtonClass}>
                {t('auth.cancel')}
              </button>
              <button type="submit" disabled={busy || !password || !confirm} className={primaryButtonClass}>
                {busy ? t('auth.sendingCode') : t('auth.sendCode')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCodeStep} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t('auth.codeLabel')}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                maxLength={10}
                autoFocus
                className={`${inputClass} text-center font-display text-lg tracking-[0.5em]`}
              />
              <span className="text-[10px] font-body text-cyan-300/30">{t('auth.codeHint')}</span>
            </label>

            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy}
              className="self-start text-[11px] font-body text-cyan-300/60 hover:text-cyan-200 underline underline-offset-2 disabled:opacity-50"
            >
              {t('auth.resendCode')}
            </button>

            {error && <p className="text-xs text-red-400 font-body text-center">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setStep('password'); setError(null); }} disabled={busy} className={secondaryButtonClass}>
                {t('auth.back')}
              </button>
              <button type="submit" disabled={busy || !code.trim()} className={primaryButtonClass}>
                {busy ? t('auth.saving') : hasPassword ? t('auth.updatePassword') : t('auth.createPassword')}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: 'password' | 'code' }) {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="h-1 flex-1 rounded-full bg-cyan-400/70" />
      <span className={`h-1 flex-1 rounded-full transition-colors ${step === 'code' ? 'bg-cyan-400/70' : 'bg-cyan-900/60'}`} />
    </div>
  );
}
