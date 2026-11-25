import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import AiSetupPanel, { AiThinkingIndicator, type AiStatusView } from '@/components/ai/AiSetupPanel';
import { STRATEGIES, type Strategy } from '@/game/deckGenerator/contract';
import { isGeneratorBusy, type DeckGeneratorError, type DeckGeneratorStatus } from '@/hooks/useDeckGenerator';
import { useI18n } from '@/i18n';

export { AiThinkingIndicator, type AiStatusView };

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

export default function AiDeckDialog({ open, status, error, replaceCount, initialStrategy, ai, onGenerate, onClose }: Props) {
  const { t } = useI18n();
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);
  const busy = isGeneratorBusy(status);
  const aiReady = ai.health?.status === 'ready';

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
            <AiSetupPanel ai={ai} />
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
