import { LANGUAGES, useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
}

/** Compact ES/EN/FR toggle; the choice is persisted and applies app-wide immediately. */
export default function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t('common.language')}
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-[hsl(220,20%,8%)]/80 border border-cyan-500/20 backdrop-blur-md p-0.5', className)}
    >
      {LANGUAGES.map((l) => {
        const active = l.code === language;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={active}
            title={l.label}
            onClick={() => setLanguage(l.code)}
            className={cn(
              'px-2 py-1 rounded-full text-[10px] font-display tracking-wider uppercase transition-colors',
              active ? 'bg-cyan-500/80 text-[hsl(220,20%,6%)] font-bold' : 'text-cyan-100/60 hover:text-cyan-100 hover:bg-cyan-500/15',
            )}
          >
            <span aria-hidden className="mr-1">{l.flag}</span>
            {l.code}
          </button>
        );
      })}
    </div>
  );
}
