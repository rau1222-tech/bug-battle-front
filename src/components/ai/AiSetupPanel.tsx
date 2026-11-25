import type { AiSetupError, DownloadProgress, LocalAiHealth } from '@/game/deckGenerator/contract';
import { useI18n } from '@/i18n';

/** Local AI state and actions shared by every AI feature (deck generation, banner chat). */
export interface AiStatusView {
  health: LocalAiHealth | null;
  unreachable: boolean;
  /** A setup/cancel request is in flight. */
  busy: boolean;
  prepare: () => void;
  cancel: () => void;
  refresh: () => void;
}

/** Small, cheap activity indicator: three CSS dots, disabled under reduced motion. Only mounted while needed. */
export function ActivityDots() {
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

/** Real state of the local AI (shared runtime and model) with prepare / cancel / retry actions. */
export default function AiSetupPanel({ ai }: { ai: AiStatusView }) {
  const { t, locale } = useI18n();
  const health = ai.health;
  const aiStatus = health?.status;
  const aiReady = aiStatus === 'ready';
  const downloading = aiStatus === 'runtime_downloading' || aiStatus === 'model_downloading';
  const missing = aiStatus === 'runtime_missing' || aiStatus === 'model_missing';
  const download = aiStatus === 'runtime_downloading' ? health?.runtime : aiStatus === 'model_downloading' ? health?.model : null;
  const aiText = ai.unreachable
    ? t('decks.builder.ai.status.unreachable')
    : !health
      ? t('decks.builder.ai.status.checking')
      : t(`decks.builder.ai.status.${health.status}`);
  const aiDetail = health?.status === 'error' && health.lastError ? t(`decks.builder.ai.errorDetail.${ERROR_DETAIL[health.lastError]}`) : null;
  const aiFailed = ai.unreachable || aiStatus === 'error';

  return (
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
  );
}
