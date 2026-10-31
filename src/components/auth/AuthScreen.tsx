import { useState } from 'react';
import { motion } from 'framer-motion';
import { translateAuthError } from '@/constants/authErrors';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import BrandHero from '@/components/layout/BrandHero';
import FeatureList from '@/components/layout/FeatureList';
import TerminalPanel from '@/components/layout/TerminalPanel';
import { useI18n } from '@/i18n';

interface AuthScreenProps {
  onSignInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignUpEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignInGoogle: () => Promise<{ error: string | null }>;
}

export default function AuthScreen({ onSignInEmail, onSignUpEmail, onSignInGoogle }: AuthScreenProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError(t('auth.errors.fillAllFields'));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t('auth.errors.invalidEmail'));
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.errors.passwordsMismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.errors.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await onSignInEmail(email, password);
        if (err) setError(translateAuthError(err));
      } else {
        const { error: err } = await onSignUpEmail(email, password);
        if (err) setError(translateAuthError(err));
        else setSuccess(t('auth.accountCreated'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await onSignInGoogle();
    if (err) {
      setError(translateAuthError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center relative overflow-hidden bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-[15%] w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-[15%] w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <LanguageSwitcher className="fixed top-4 right-4 z-30" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="z-10 w-full max-w-5xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-2 gap-8 lg:gap-16 items-center"
      >
        <BrandHero tagline={t('auth.tagline')}>
          <FeatureList />
        </BrandHero>

        {/* Terminal-style panel */}
        <TerminalPanel
          path="~/bug-hunters/auth"
          footer={t('auth.googleFooter')}
          className="w-full max-w-sm mx-auto lg:max-w-md lg:mr-0"
          bodyClassName="sm:p-6"
        >
          <div className="flex flex-col gap-3">
            {/* Tabs */}
            <div className="flex gap-1 bg-[hsl(220,15%,10%)] rounded-md p-1">
              <button
                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2 text-xs font-display tracking-wider rounded transition-all ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-cyan-600/60 to-blue-600/60 text-cyan-100 shadow-md border border-cyan-400/20'
                    : 'text-cyan-300/30 hover:text-cyan-300/50'
                }`}
              >
                {t('auth.tabLogin')}
              </button>
              <button
                onClick={() => { setMode('register'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2 text-xs font-display tracking-wider rounded transition-all ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-cyan-600/60 to-blue-600/60 text-cyan-100 shadow-md border border-cyan-400/20'
                    : 'text-cyan-300/30 hover:text-cyan-300/50'
                }`}
              >
                {t('auth.tabRegister')}
              </button>
            </div>

            {/* Google button */}
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-3 rounded-md bg-white/90 hover:bg-white text-stone-800 font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {mode === 'login' ? t('auth.googleContinue') : t('auth.googleRegister')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
              <span className="text-[9px] font-body text-cyan-500/30 uppercase tracking-widest">{t('auth.orWithEmail')}</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 px-3 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 focus:shadow-[0_0_10px_-3px_hsl(200,100%,50%,0.2)] transition-all"
              />
              <input
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 px-3 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 focus:shadow-[0_0_10px_-3px_hsl(200,100%,50%,0.2)] transition-all"
              />
              {mode === 'register' && (
                <input
                  type="password"
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 px-3 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 focus:shadow-[0_0_10px_-3px_hsl(200,100%,50%,0.2)] transition-all"
                />
              )}

              {error && (
                <p className="text-xs text-red-400 font-body text-center">{error}</p>
              )}
              {success && (
                <p className="text-xs text-emerald-400 font-body text-center">{success}</p>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="h-10 rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 font-display text-xs tracking-wider transition-all shadow-[0_0_20px_-5px_hsl(200,100%,50%,0.3)] hover:shadow-[0_0_25px_-5px_hsl(200,100%,50%,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? '...'
                  : mode === 'login'
                    ? t('auth.submitLogin')
                    : t('auth.submitRegister')}
              </motion.button>
            </form>
          </div>
        </TerminalPanel>
      </motion.div>
    </div>
  );
}
