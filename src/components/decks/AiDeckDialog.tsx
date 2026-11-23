import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { STRATEGIES, type AiSetupError, type DownloadProgress, type LocalAiHealth, type Strategy } from '@/game/deckGenerator/contract';
import { isGeneratorBusy, type DeckGeneratorError, type DeckGeneratorStatus } from '@/hooks/useDeckGenerator';
import { useI18n } from '@/i18n';

export interface AiStatusView {
  health: LocalAiHealth | null;
  unreachable: boolean;
  /** A setup/cancel request is in flight. */
  busy: boolean;
  prepare: () => void;
  cancel: () => void;
  refresh: () => void;
}

interface Props {
  open: boolean;
  status: DeckGeneratorStatus;
  error: DeckGeneratorError | null;
  /** Cards currently in the builder; > 0 asks for confirmation before replacing them. */
  replaceCount: number;
  initialStrategy: Strategy;
  ai: AiStatusView;
  /** `useModel` false = deterministic backup generator. */
  onGenerate: (strategy: Strategy, useModel: boolean) => void;
  /** Closes the dialog, aborting any generation in progress (a download keeps running in the service). */
  onClose: () => void;
}

/** Small, cheap activity indicator: three CSS dots, disabled under reduced motion. Only mounted while needed. */
function ActivityDots() {
  return (
    <span className="flex gap-1" aria-hidden="true" data-testid="ai-thinking-dots">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ai-thinking-dot w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}

export function AiThinkingIndicator({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-body text-emerald-200/80">
      <ActivityDots />
      <span>{label}</span>
    </div>
  );
}

const formatBytes = (n: number, locale: string) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toLocaleString(locale, { maximumFractionDigits: 2 })} GB`
    : `${Math.round(n / 1024 ** 2).toLocaleString(locale)} MB`;

const ERROR_DETAIL: Record<AiSetupError, string> = {
  PORT_IN_USE: 'portInUse',
  CHECKSUM_MISMATCH: 'checksum',
  UNSUPPORTED_PLATFORM: 'unsupported',
  RUNTIME_DOWNLOAD_FAILED: 'download',
  MODEL_DOWNLOAD_FAILED: 'download',
  EXTRACT_FAILED: 'start',
  OLLAMA_START_FAILED: 'start',
  OLLAMA_UNAVAILABLE: 'start',
  MODEL_LOAD_FAILED: 'start',
};

function DownloadBar({ download, locale }: { download: DownloadProgress; locale: string }) {
  const { t } = useI18n();
  const done = download.downloadedBytes ?? 0;
  if (download.progress === null) {
    // No reliable total: activity indicator plus downloaded size, never an invented percentage
    return (
      <div className="flex items-center gap-2 text-[11px] font-body text-emerald-200/70">
        <ActivityDots />
        {t('decks.builder.ai.progressDone', { done: formatBytes(done, locale) })}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={t('decks.builder.ai.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={download.progress}
        className="h-1.5 w-full rounded-full bg-[hsl(220,15%,14%)] overflow-hidden"
      >
        <div className="h-full bg-emerald-400 transition-[width] motion-reduce:transition-none" style={{ width: `${download.progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-body text-emerald-200/60 tabular-nums">
        <span>{download.progress}%</span>
        <span>{t('decks.builder.ai.progressBytes', { done: formatBytes(done, locale), total: formatBytes(download.totalBytes ?? 0, locale) })}</span>
      </div>
    </div>
  );
}

const smallButton =
  'h-8 px-3 rounded-md border border-emerald-500/30 text-emerald-100 hover:bg-emerald-900/40 font-display text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed';

export default function AiDeckDialog({ open, status, error, replaceCount, initialStrategy, ai, onGenerate, onClose }: Props) {
  const { t, locale } = useI18n();
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);
  const busy = isGeneratorBusy(status);
  const health = ai.health;
  const aiStatus = health?.status;
  const aiReady = aiStatus === 'ready';
  const downloading = aiStatus === 'runtime_downloading' || aiStatus === 'model_downloading';
  const missing = aiStatus === 'runtime_missing' || aiStatus === 'model_missing';
  const download = aiStatus === 'runtime_downloading' ? health?.runtime : aiStatus === 'model_downloading' ? health?.model : null;

  useEffect(() => {
    if (open) setStrategy(initialStrategy);
  }, [open, initialStrategy]);

  const busyLabel =
    status === 'validating' || status === 'repairing'
      ? t('decks.builder.ai.checking')
      : status === 'fallback'
        ? t('decks.builder.ai.fallbackRunning')
        : t('decks.builder.ai.thinking');

  const errorText = !error
    ? null
    : error.code === 'INSUFFICIENT_COLLECTION'
      ? t('decks.builder.ai.error.insufficient', { available: error.available, required: error.required })
      : error.code === 'COLLECTION_ERROR'
        ? t('decks.builder.ai.error.collection')
        : t('decks.builder.ai.error.failed');

  const aiText = ai.unreachable
    ? t('decks.builder.ai.status.unreachable')
    : !health
      ? t('decks.builder.ai.status.checking')
      : t(`decks.builder.ai.status.${health.status}`);
  const aiDetail = health?.status === 'error' && health.lastError ? t(`decks.builder.ai.errorDetail.${ERROR_DETAIL[health.lastError]}`) : null;
  const aiFailed = ai.unreachable || aiStatus === 'error';

  const primaryLabel =
    error && error.code !== 'INSUFFICIENT_COLLECTION'
      ? t('decks.builder.ai.retry')
      : replaceCount > 0
        ? t('decks.builder.ai.replaceAndGenerate')
        : t('decks.builder.ai.generate');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm max-h-[100dvh] overflow-y-auto border-emerald-500/20 bg-[hsl(220,20%,8%)] text-emerald-100 [&>button]:text-emerald-300">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-emerald-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-300" aria-hidden="true" />
            {t('decks.builder.ai.title')}
          </DialogTitle>
          <DialogDescription className="text-emerald-200/60 text-xs font-body">
            {t('decks.builder.ai.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onGenerate(strategy, aiReady);
          }}
          className="space-y-4"
        >
          <fieldset disabled={busy} className="space-y-2">
            <legend className="text-[10px] font-display uppercase tracking-widest text-emerald-300/60 mb-2">
              {t('decks.builder.ai.strategyLabel')}
            </legend>
            <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as Strategy)} disabled={busy}>
              {STRATEGIES.map((s) => (
                <label
                  key={s}
                  htmlFor={`ai-strategy-${s}`}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    strategy === s ? 'border-emerald-400/50 bg-emerald-600/15' : 'border-emerald-800/30 hover:border-emerald-600/40'
                  }`}
                >
                  <RadioGroupItem id={`ai-strategy-${s}`} value={s} className="mt-0.5 border-emerald-400 text-emerald-300" />
                  <span className="flex flex-col">
                    <span className="font-display text-xs tracking-wider text-emerald-100">{t(`decks.builder.ai.strategy.${s}`)}</span>
                    <span className="text-[11px] font-body text-emerald-200/50">{t(`decks.builder.ai.strategyDesc.${s}`)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {replaceCount > 0 && !busy && (
            <p className="flex items-start gap-1.5 text-[11px] font-body text-amber-200/80">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
              {t('decks.builder.ai.replaceWarning', { count: replaceCount })}
            </p>
          )}

          {busy ? (
            <AiThinkingIndicator label={busyLabel} />
          ) : (
            <section className="rounded-md border border-emerald-800/30 bg-[hsl(220,18%,10%)] p-3 space-y-2" data-testid="ai-status-panel">
              <div role="status" aria-live="polite" className="space-y-0.5">
                <p className={`text-xs font-body ${aiFailed ? 'text-red-300' : aiReady ? 'text-emerald-300' : 'text-emerald-100/80'}`}>{aiText}</p>
                {aiDetail && <p className="text-[11px] font-body text-red-200/70">{aiDetail}</p>}
              </div>
              {download && <DownloadBar download={download} locale={locale} />}
              {(missing || downloading) && <p className="text-[10px] font-body text-emerald-200/50">{t('decks.builder.ai.firstRunNote')}</p>}
              {(missing || downloading || aiFailed) && (
                <div className="flex flex-wrap gap-2">
                  {missing && (
                    <button type="button" className={smallButton} onClick={ai.prepare} disabled={ai.busy}>
                      {t('decks.builder.ai.prepare')}
                    </button>
                  )}
                  {downloading && (
                    <button type="button" className={smallButton} onClick={ai.cancel} disabled={ai.busy}>
                      {t('decks.builder.ai.cancelDownload')}
                    </button>
                  )}
                  {aiFailed && (
                    <button type="button" className={smallButton} onClick={ai.unreachable ? ai.refresh : ai.prepare} disabled={ai.busy}>
                      {t('decks.builder.ai.retry')}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {errorText && !busy && (
            <p role="alert" className="text-[11px] font-body text-red-300">
              {errorText}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-md border border-emerald-500/15 text-emerald-200/70 hover:text-emerald-100 font-display text-[11px] tracking-wider"
            >
              {t('decks.builder.ai.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="h-9 px-4 rounded-md bg-emerald-600/70 hover:bg-emerald-500/80 text-emerald-50 border border-emerald-400/30 font-display text-[11px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiReady ? primaryLabel : t('decks.builder.ai.useFallback')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
