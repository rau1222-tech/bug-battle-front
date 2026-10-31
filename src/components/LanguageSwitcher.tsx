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
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-stone-900/70 border border-amber-700/30 backdrop-blur-md p-0.5', className)}
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
              active ? 'bg-amber-600/80 text-stone-950 font-bold' : 'text-amber-100/60 hover:text-amber-100 hover:bg-amber-700/20',
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
