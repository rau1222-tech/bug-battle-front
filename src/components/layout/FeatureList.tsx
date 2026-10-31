import { useI18n } from '@/i18n';

/** Short game pitch shown under the logo on wide screens (login / onboarding). */
export default function FeatureList() {
  const { t } = useI18n();
  const items = [
    { icon: '📦', text: t('auth.feature.collect') },
    { icon: '🃏', text: t('auth.feature.decks') },
    { icon: '⚔️', text: t('auth.feature.battle') },
  ];
  return (
    <ul className="hidden lg:flex flex-col gap-3 mt-10 w-full max-w-md">
      {items.map((item) => (
        <li
          key={item.icon}
          className="flex items-center gap-3 rounded-md border border-cyan-500/10 bg-[hsl(220,20%,8%)]/60 backdrop-blur-sm px-4 py-3"
        >
          <span className="text-xl">{item.icon}</span>
          <span className="font-body text-sm text-cyan-100/70">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
