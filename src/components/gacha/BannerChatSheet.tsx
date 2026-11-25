import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, X, Eraser } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AiSetupPanel, { AiThinkingIndicator, type AiStatusView } from '@/components/ai/AiSetupPanel';
import { CHAT_LIMITS, type BannerChatRequest, type BannerChatResponse, type ChatHistoryEntry } from '@/game/bannerChat/contract';
import { buildBannerChatRequest } from '@/game/bannerChat/facts';
import { useBannerChat, type ChatMessage } from '@/hooks/useBannerChat';
import { getRarity, RARITY_COLORS } from '@/hooks/useCollection';
import { useIsMobile } from '@/hooks/use-mobile';
import { useI18n } from '@/i18n';
import type { CardTemplate } from '@/constants';
import { appearanceProbabilities } from '@/lib/bannerOdds';
import { isBannerActive, type Banner } from '@/lib/banners';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ai: AiStatusView;
  /** Banners loaded for the screen; only active ones are ever sent to the AI. */
  banners: Banner[];
  cards: CardTemplate[];
  collection: Record<string, number>;
  gold: number;
  onSelectBanner: (bannerId: string) => void;
  /** Overridable for tests. */
  client?: (request: BannerChatRequest, signal: AbortSignal) => Promise<BannerChatResponse>;
}

const chipClass = 'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-display tracking-wide bg-[hsl(220,15%,12%)]';

export default function BannerChatSheet({ open, onOpenChange, ai, banners, cards, collection, gold, onSelectBanner, client }: Props) {
  const { t, cardName, language } = useI18n();
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const bannersById = useMemo(() => new Map(banners.map((b) => [b.id, b])), [banners]);
  const aiReady = ai.health?.status === 'ready';
  const cardLocations = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const b of banners.filter((x) => isBannerActive(x))) {
      const odds = appearanceProbabilities(b.cards);
      for (const c of b.cards) out.set(c.cardId, [...(out.get(c.cardId) ?? []), `${b.titulo} ${((odds[c.cardId] ?? 0) * 100).toFixed(1)}%`]);
    }
    return out;
  }, [banners]);

  const build = useCallback(
    (message: string, history: ChatHistoryEntry[], seed: number) =>
      buildBannerChatRequest({ message, language, seed, history, banners, cards, collection, gold, rarityOf: getRarity, nameOf: cardName }),
    [language, banners, cards, collection, gold, cardName],
  );
  const chat = useBannerChat({ build, client });

  // Keep the newest message visible without scrolling the page
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.pending]);

  const suggestedCard = useMemo(() => {
    const ids = banners.flatMap((b) => b.cards.map((c) => c.cardId));
    const id = ids.find((cid) => !(collection[cid] > 0)) ?? ids[0];
    const def = id ? cardsById.get(id) : undefined;
    return def ? cardName(def) : null;
  }, [banners, collection, cardsById, cardName]);

  const suggestions = [
    t('gacha.chat.suggestion.best'),
    t('gacha.chat.suggestion.aggressive'),
    ...(suggestedCard ? [t('gacha.chat.suggestion.card', { card: suggestedCard })] : []),
    t('gacha.chat.suggestion.missing'),
    t('gacha.chat.suggestion.compare'),
  ];

  const submit = async (text: string) => {
    if (!aiReady || chat.sending || !text.trim()) return;
    const outcome = await chat.send(text);
    if (outcome === 'sent' || outcome === 'rejected') setDraft('');
  };

  const close = (next: boolean) => {
    if (!next) chat.cancel();
    onOpenChange(next);
  };

  const errorText = chat.error === 'TIMEOUT' ? t('gacha.chat.error.timeout') : chat.error === 'UNAVAILABLE' ? t('gacha.chat.error.unavailable') : chat.error ? t('gacha.chat.error.failed') : null;

  const renderMessage = (m: ChatMessage) => {
    if (m.role === 'user') {
      return (
        <div key={m.id} className="flex justify-end">
          <p className="max-w-[85%] rounded-lg rounded-br-sm bg-purple-600/30 border border-purple-400/30 px-3 py-2 text-xs font-body text-purple-50 whitespace-pre-wrap break-words">
            <span className="sr-only">{t('gacha.chat.you')}: </span>
            {m.text}
          </p>
        </div>
      );
    }
    if (m.kind === 'rejected') {
      return (
        <div key={m.id} className="max-w-[90%] rounded-lg rounded-bl-sm border border-amber-500/30 bg-amber-900/10 px-3 py-2 text-xs font-body text-amber-100/90" data-testid="chat-rejected">
          <span className="sr-only">{t('gacha.chat.assistant')}: </span>
          {t('gacha.chat.offTopic')}
        </div>
      );
    }
    const msgBanners = m.bannerIds.map((id) => bannersById.get(id)).filter((b): b is Banner => !!b);
    const msgCards = m.cardIds.map((id) => cardsById.get(id)).filter((c): c is CardTemplate => !!c);
    const hasFacts = msgBanners.length > 0 || msgCards.length > 0 || m.limitations.length > 0;
    return (
      <div key={m.id} className="max-w-[90%] rounded-lg rounded-bl-sm border border-purple-500/20 bg-[hsl(220,15%,12%)] px-3 py-2 space-y-2 text-xs font-body text-purple-100/90">
        <span className="sr-only">{t('gacha.chat.assistant')}: </span>
        {(m.answer || !hasFacts) && <p className="whitespace-pre-wrap break-words">{m.answer ?? t('gacha.chat.unreliable')}</p>}
        {msgBanners.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label={t('gacha.chat.bannersLabel')}>
            {msgBanners.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBanner(b.id)}
                aria-label={t('gacha.chat.selectBanner', { title: b.titulo })}
                className={`${chipClass} border-purple-400/40 text-purple-100 hover:bg-purple-600/30`}
              >
                🎁 {b.titulo}
                <span className="opacity-60">· {t('gacha.chat.bannerFacts', { cost: b.coste, packs: b.coste > 0 ? Math.floor(gold / b.coste) : 0 })}</span>
              </button>
            ))}
          </div>
        )}
        {msgCards.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label={t('gacha.chat.cardsLabel')}>
            {msgCards.map((c) => (
              <span key={c.id} className={`${chipClass} ${RARITY_COLORS[getRarity(c)]}`}>
                {cardName(c)}
                <span className="opacity-60">· {t('gacha.chat.owned', { count: collection[c.id] ?? 0 })}</span>
                {/* Where the card really is, from the visible active banners (never from the model) */}
                {(cardLocations.get(c.id) ?? []).map((loc) => (
                  <span key={loc} className="opacity-60">· {loc}</span>
                ))}
              </span>
            ))}
          </div>
        )}
        {m.limitations.length > 0 && (
          <ul className="space-y-0.5 text-[10px] text-purple-200/60">
            {m.limitations.map((l) => <li key={l}>ⓘ {t(`gacha.chat.limitation.${l}`)}</li>)}
          </ul>
        )}
        {(m.category === 'banner_recommendation' || m.category === 'banner_comparison' || m.category === 'deck_strategy') && (
          <p className="text-[10px] text-purple-200/40">{t('gacha.chat.heuristic')}</p>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={`flex flex-col gap-3 p-4 border-purple-500/20 bg-[hsl(220,20%,8%)] text-purple-100 [&>button]:text-purple-300 ${
          isMobile ? 'h-[100dvh]' : 'w-full sm:max-w-[380px]'
        }`}
        data-testid="banner-chat"
      >
        <SheetHeader className="text-left space-y-1">
          <SheetTitle className="font-display tracking-wider text-purple-100 flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-300" aria-hidden="true" />
            {t('gacha.chat.title')}
          </SheetTitle>
          <SheetDescription className="text-purple-200/60 text-xs font-body">{t('gacha.chat.description')}</SheetDescription>
        </SheetHeader>

        {!aiReady && (
          <div className="space-y-2">
            <AiSetupPanel ai={ai} />
            <p className="text-[11px] font-body text-purple-200/60">{t('gacha.chat.unavailable')}</p>
          </div>
        )}

        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={t('gacha.chat.conversation')}
          className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
        >
          {chat.messages.length === 0 && !chat.pending && (
            <div className="space-y-2">
              <p className="text-xs font-body text-purple-200/60">{t('gacha.chat.intro')}</p>
              <p className="text-[10px] font-display uppercase tracking-widest text-purple-300/50">{t('gacha.chat.suggestionsLabel')}</p>
              <div className="flex flex-col items-start gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!aiReady || chat.sending}
                    onClick={() => void submit(s)}
                    className="text-left text-[11px] font-body px-2.5 py-1.5 rounded-md border border-purple-500/20 text-purple-100/90 hover:border-purple-400/40 hover:bg-purple-600/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map(renderMessage)}
          {chat.pending && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-lg rounded-br-sm bg-purple-600/20 border border-purple-400/20 px-3 py-2 text-xs font-body text-purple-50/80 whitespace-pre-wrap break-words">
                {chat.pending}
              </p>
            </div>
          )}
        </div>

        {chat.sending && <AiThinkingIndicator label={t('gacha.chat.thinking')} />}
        {errorText && (
          <div role="alert" className="flex items-center justify-between gap-2 text-[11px] font-body text-red-300">
            <span>{errorText}</span>
            <button type="button" onClick={() => void submit(draft)} disabled={!aiReady || !draft.trim()} className="underline disabled:opacity-40">
              {t('gacha.chat.retry')}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft);
          }}
          className="space-y-2"
        >
          <label htmlFor="banner-chat-input" className="sr-only">
            {t('gacha.chat.inputLabel')}
          </label>
          <textarea
            id="banner-chat-input"
            value={draft}
            maxLength={CHAT_LIMITS.maxMessage}
            rows={2}
            disabled={!aiReady}
            placeholder={t('gacha.chat.placeholder')}
            aria-describedby="banner-chat-counter"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(draft);
              }
            }}
            className="w-full resize-none rounded-md bg-[hsl(220,15%,12%)] border border-purple-500/20 px-3 py-2 text-xs font-body text-purple-50 placeholder:text-purple-200/30 focus:outline-none focus:border-purple-400/50 disabled:opacity-50"
          />
          <div className="flex items-center gap-2">
            <span id="banner-chat-counter" className="text-[10px] font-body text-purple-200/50 tabular-nums mr-auto">
              {t('gacha.chat.counter', { count: draft.length, max: CHAT_LIMITS.maxMessage })}
            </span>
            <button
              type="button"
              onClick={chat.clear}
              disabled={chat.messages.length === 0 && !chat.sending}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-purple-500/20 text-purple-200/70 hover:text-purple-100 font-display text-[10px] tracking-wider disabled:opacity-40"
            >
              <Eraser className="w-3 h-3" aria-hidden="true" />
              {t('gacha.chat.clear')}
            </button>
            {chat.sending ? (
              <button
                type="button"
                onClick={chat.cancel}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-purple-400/40 text-purple-100 font-display text-[10px] tracking-wider"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                {t('gacha.chat.cancel')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!aiReady || !draft.trim()}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-purple-600/70 hover:bg-purple-500/80 text-purple-50 border border-purple-400/30 font-display text-[10px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" aria-hidden="true" />
                {t('gacha.chat.send')}
              </button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
