import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { THEMES, updateSettings, useSettings } from '@/lib/settings';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { dialogContentClass, sectionTitleClass } from './dialogStyles';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'game' hides the appearance section (the board has its own look). */
  scope?: 'all' | 'game';
  /** Shows the "replay intro" button when provided. */
  onReplayIntro?: () => void;
}

export default function SettingsDialog({ open, onOpenChange, scope = 'all', onReplayIntro }: SettingsDialogProps) {
  const { t } = useI18n();
  const settings = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-cyan-100 flex items-center gap-2">
            <span aria-hidden>⚙️</span> {t('settings.title')}
          </DialogTitle>
          <DialogDescription className="text-[11px] font-body text-cyan-300/50">{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {scope === 'all' && (
            <>
              <section className="flex flex-col gap-3">
                <h3 className={sectionTitleClass}>{t('settings.appearance')}</h3>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-body text-cyan-100/80">{t('settings.theme')}</span>
                  <div role="radiogroup" aria-label={t('settings.theme')} className="grid grid-cols-5 gap-2">
                    {THEMES.map((theme) => {
                      const active = settings.theme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => updateSettings({ theme: theme.id })}
                          className={cn(
                            'flex flex-col items-center gap-1.5 rounded-md border py-2 transition-all',
                            active ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/5 hover:border-white/15 hover:bg-white/5',
                          )}
                        >
                          <span
                            className={cn('h-6 w-6 rounded-full transition-transform', active && 'scale-110')}
                            style={{ background: theme.swatch, boxShadow: active ? `0 0 12px ${theme.swatch}` : undefined }}
                          />
                          <span className="text-[9px] font-display tracking-wider text-cyan-100/70">{t(`settings.theme.${theme.id}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Row label={t('common.language')}>
                  <LanguageSwitcher />
                </Row>
              </section>

              <Divider />
            </>
          )}

          <section className="flex flex-col gap-3">
            <h3 className={sectionTitleClass}>{t('settings.sound')}</h3>
            <Row label={t('settings.soundEffects')}>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(soundEnabled) => updateSettings({ soundEnabled })}
                aria-label={t('settings.soundEffects')}
              />
            </Row>
            <div className={cn('flex items-center gap-3', !settings.soundEnabled && 'opacity-40')}>
              <span className="text-xs font-body text-cyan-100/80 w-16 shrink-0">{t('settings.volume')}</span>
              <Slider
                value={[Math.round(settings.volume * 100)]}
                onValueChange={([v]) => updateSettings({ volume: v / 100 })}
                max={100}
                step={5}
                disabled={!settings.soundEnabled}
                aria-label={t('settings.volume')}
                className="flex-1 [&_.bg-secondary]:bg-cyan-950"
              />
              <span className="w-9 text-right text-[11px] font-display tabular-nums text-cyan-200/70">
                {Math.round(settings.volume * 100)}
              </span>
            </div>
          </section>

          <Divider />

          <section className="flex flex-col gap-3">
            <h3 className={sectionTitleClass}>{t('settings.accessibility')}</h3>
            <Row label={t('settings.reduceMotion')} hint={t('settings.reduceMotionHint')}>
              <Switch
                checked={settings.reduceMotion}
                onCheckedChange={(reduceMotion) => updateSettings({ reduceMotion })}
                aria-label={t('settings.reduceMotion')}
              />
            </Row>
          </section>

          {onReplayIntro && (
            <>
              <Divider />
              <section className="flex flex-col gap-3">
                <h3 className={sectionTitleClass}>{t('settings.guide')}</h3>
                <Row label={t('settings.replayIntro')} hint={t('settings.replayIntroHint')}>
                  <button
                    type="button"
                    onClick={onReplayIntro}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-500/30 text-cyan-200/80 hover:text-cyan-50 hover:bg-cyan-500/10 hover:border-cyan-400/50 font-display text-[10px] tracking-wider uppercase transition-colors"
                  >
                    <span aria-hidden>▶</span> {t('settings.replayIntro')}
                  </button>
                </Row>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-body text-cyan-100/80">{label}</p>
        {hint && <p className="text-[10px] font-body text-cyan-300/35">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const Divider = () => <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />;
