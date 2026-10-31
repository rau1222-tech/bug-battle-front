import { useState } from 'react';
import { motion } from 'framer-motion';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import BrandHero from '@/components/layout/BrandHero';
import FeatureList from '@/components/layout/FeatureList';
import TerminalPanel from '@/components/layout/TerminalPanel';
import { useI18n } from '@/i18n';

interface PickNameScreenProps {
  suggestedName?: string;
  avatarUrl?: string | null;
  onConfirm: (name: string) => Promise<void>;
}

export default function PickNameScreen({ suggestedName, avatarUrl, onConfirm }: PickNameScreenProps) {
  const { t } = useI18n();
  const [name, setName] = useState(suggestedName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setError(t('auth.nameTooShort', { min: 2 }));
      return;
    }
    if (trimmed.length > 40) {
      setError(t('auth.nameTooLong', { max: 40 }));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onConfirm(trimmed);
    } catch {
      setError(t('auth.saveError'));
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
        <BrandHero>
          <FeatureList />
        </BrandHero>

        {/* Terminal-style panel */}
        <TerminalPanel
          path="~/bug-hunters/new-hunter"
          footer={t('auth.nameChangeLater')}
          className="w-full max-w-sm mx-auto lg:max-w-md lg:mr-0"
          bodyClassName="p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4">
            <h2 className="text-center font-display text-lg text-cyan-100 tracking-wide">
              {t('auth.welcome')}
            </h2>
            <p className="text-center text-[11px] text-cyan-300/40 font-body -mt-2">
              {t('auth.pickNameSubtitle')}
            </p>

            {avatarUrl && (
              <div className="flex justify-center">
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border-2 border-cyan-400/30 shadow-[0_0_15px_-3px_hsl(200,100%,50%,0.2)]"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder={t('auth.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoFocus
                className="h-11 px-4 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 focus:shadow-[0_0_10px_-3px_hsl(200,100%,50%,0.2)] transition-all text-center"
              />

              {error && (
                <p className="text-xs text-red-400 font-body text-center">{error}</p>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="h-11 rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 font-display text-sm tracking-wider transition-all shadow-[0_0_20px_-5px_hsl(200,100%,50%,0.3)] hover:shadow-[0_0_25px_-5px_hsl(200,100%,50%,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '...' : t('auth.confirm')}
              </motion.button>
            </form>
          </div>
        </TerminalPanel>
      </motion.div>
    </div>
  );
}
