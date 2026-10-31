import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import BackButton from '@/components/ui/BackButton';
import TerminalPanel from '@/components/layout/TerminalPanel';
import { useI18n } from '@/i18n';
import BannerEditorModal from '@/components/gacha/BannerEditorModal';
import { DEFAULT_CARD_IMAGE, resolveCardImage, type CardTemplate } from '@/constants';
import { useAuthContext } from '@/contexts/AuthContext';
import { useBanners } from '@/hooks/useBanners';
import { useCards } from '@/hooks/useCards';
import {
  useCollection,
  getRarity,
  MAX_COPIES_PER_CARD,
  RARITY_COLORS,
  RARITY_GLOW,
  type PackPull,
} from '@/hooks/useCollection';
import {
  appearanceProbabilities,
  BANNER_STATUS_LABELS,
  formatBannerDate,
  getBannerStatus,
  isBannerActive,
  type Banner,
  type BannerDraft,
  type BannerStatus,
} from '@/lib/banners';

interface Props {
  onBack: () => void;
}

type Phase = 'shop' | 'opening' | 'reveal';

interface PulledCard {
  def: CardTemplate;
  repetida: boolean;
  oro: number;
}

const STATUS_CLASSES: Record<BannerStatus, string> = {
  activo: 'text-emerald-300 border-emerald-500/40',
  programado: 'text-amber-300 border-amber-500/40',
  finalizado: 'text-stone-400 border-stone-500/40',
};

const STATUS_REFRESH_MS = 30_000;

export default function GachaScreen({ onBack }: Props) {
  const { t, cardName, cardNameById } = useI18n();
  const { user, profile } = useAuthContext();
  const isAdmin = profile.admin;
  const { cards } = useCards();
  const { collection, coins, loading, buyPack } = useCollection(user.id);
  const { banners, loading: bannersLoading, error: bannersError, saveBanner } = useBanners();
  const [phase, setPhase] = useState<Phase>('shop');
  const [pulled, setPulled] = useState<PulledCard[]>([]);
  const [revealedIdx, setRevealedIdx] = useState(-1);
  const [buying, setBuying] = useState(false);
  const [selectedBannerId, setSelectedBannerId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; banner: Banner | null }>({ open: false, banner: null });
  const [now, setNow] = useState(() => new Date());

  // Re-evaluates banner availability so a banner that starts/ends while the screen is open updates its state.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const visibleBanners = useMemo(
    () => (isAdmin ? banners : banners.filter((b) => isBannerActive(b, now))),
    [banners, isAdmin, now],
  );
  const selectedBanner =
    visibleBanners.find((b) => b.id === selectedBannerId) ??
    visibleBanners.find((b) => isBannerActive(b, now)) ??
    visibleBanners[0] ??
    null;
  const selectedStatus = selectedBanner ? getBannerStatus(selectedBanner, now) : null;
  const canAfford = selectedBanner ? coins >= selectedBanner.coste : false;
  const canBuy =
    !!selectedBanner && selectedStatus === 'activo' && selectedBanner.cards.length > 0 && canAfford && !loading && !buying;
  const probabilities = useMemo(
    () => appearanceProbabilities(selectedBanner?.cards ?? []),
    [selectedBanner],
  );

  const handleBuyPack = async () => {
    if (!selectedBanner || buying) return;
    setBuying(true);
    let pulls: PackPull[];
    try {
      pulls = await buyPack(selectedBanner.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gacha.openError'));
      return;
    } finally {
      setBuying(false);
    }
    const results = pulls.flatMap((p) => {
      const def = cardsById.get(p.cardId);
      return def ? [{ def, repetida: p.repetida, oro: p.oro }] : [];
    });
    setPulled(results);
    setRevealedIdx(-1);
    setPhase('opening');
    setTimeout(() => {
      setPhase('reveal');
      setRevealedIdx(0);
    }, 1200);
  };

  const handleRevealNext = () => {
    if (revealedIdx < pulled.length - 1) {
      setRevealedIdx((i) => i + 1);
    } else {
      setPhase('shop');
      setPulled([]);
      setRevealedIdx(-1);
    }
  };

  const allRevealed = revealedIdx >= pulled.length - 1;
  const duplicateGold = pulled.reduce((sum, p) => sum + (p.repetida ? p.oro : 0), 0);

  const handleSaveBanner = async (draft: BannerDraft) => {
    const isNew = !editor.banner;
    const id = await saveBanner(editor.banner?.id ?? null, draft);
    setSelectedBannerId(id);
    toast.success(isNew ? t('gacha.bannerCreated') : t('gacha.bannerUpdated'));
  };

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/4 w-80 h-80 bg-purple-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/3 w-60 h-60 bg-indigo-500/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} color="purple" />
          <h1 className="font-display text-lg sm:text-2xl text-purple-100 tracking-wider text-glow-purple">
            {t('gacha.title')}
          </h1>
          <div className="flex items-center gap-2 bg-[hsl(220,18%,10%)] px-3 py-1.5 rounded-md border border-purple-500/20">
            <span className="text-base">🪙</span>
            <span className="font-display text-sm text-purple-100 tracking-wider">{coins}</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col items-center">
        <AnimatePresence mode="wait">
          {/* ═══ SHOP PHASE ═══ */}
          {phase === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-4 w-full"
            >
              <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 items-start w-full">
                {/* Banner list */}
                <TerminalPanel
                  accent="purple"
                  path={t('gacha.terminalPath')}
                  footer={t('gacha.footerHint')}
                  bodyClassName="sm:p-5 flex flex-col gap-4"
                  actions={isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditor({ open: true, banner: null })}
                      className="px-2 py-0.5 rounded bg-purple-600/30 border border-purple-500/30 text-purple-100 font-display text-[9px] tracking-[0.15em] hover:bg-purple-600/50 transition-colors"
                    >
                      {t('gacha.newBanner')}
                    </button>
                  )}
                >
                  <p className="text-sm font-body text-purple-200/50">
                    {t('gacha.intro')}
                  </p>

                  {bannersLoading ? (
                    <p className="text-xs font-body text-purple-300/50 animate-pulse">{t('gacha.loadingBanners')}</p>
                  ) : bannersError ? (
                    <p className="text-xs font-body text-red-400/80">{t('gacha.loadError', { error: bannersError })}</p>
                  ) : visibleBanners.length === 0 ? (
                    <p className="text-xs font-body text-purple-300/50">
                      {t('gacha.noBanners')}
                    </p>
                  ) : (
                    <div className="w-full flex flex-col gap-2 lg:max-h-[50vh] lg:overflow-y-auto lg:pr-1">
                      {visibleBanners.map((b) => {
                        const status = getBannerStatus(b, now);
                        const selected = selectedBanner?.id === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBannerId(b.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-md border transition-all ${selected ? 'border-purple-400/60 bg-purple-600/20 shadow-[0_0_15px_-5px_hsl(260,80%,60%,0.4)]' : 'border-purple-500/15 bg-[hsl(220,15%,12%)] hover:border-purple-400/30'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display text-xs text-purple-100 truncate">{b.titulo}</span>
                              <span className={`shrink-0 text-[9px] font-display px-1.5 py-0.5 rounded border ${STATUS_CLASSES[status]}`}>
                                {t(BANNER_STATUS_LABELS[status])}
                              </span>
                            </div>
                            <p className="text-[10px] font-body text-purple-300/50 mt-0.5">
                              {formatBannerDate(b.fechaInicio)} → {formatBannerDate(b.fechaFin)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </TerminalPanel>

                {/* Selected banner: pack + card pool */}
                <TerminalPanel accent="purple" path={selectedBanner ? selectedBanner.titulo : '—'} bodyClassName="sm:p-5">
                  {selectedBanner ? (
                    <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start">
                      <div className="flex flex-col items-center gap-3">
                        <motion.button
                          onClick={() => { void handleBuyPack(); }}
                          disabled={!canBuy}
                          whileHover={{ scale: canBuy ? 1.05 : 1 }}
                          whileTap={{ scale: canBuy ? 0.95 : 1 }}
                          className="relative w-full flex flex-col items-center gap-3 p-6 sm:p-8 rounded-lg bg-gradient-to-b from-purple-600/20 to-purple-900/20 border-2 border-purple-500/30 backdrop-blur-sm shadow-[0_0_30px_-10px_hsl(260,80%,60%,0.25)] transition-all hover:border-purple-400/50 hover:shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.4)] disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                          <motion.span
                            animate={{ rotate: [0, -3, 3, -3, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            className="text-6xl sm:text-7xl"
                          >
                            🎁
                          </motion.span>
                          <span className="font-display text-base text-purple-100 tracking-wide text-center">
                            {selectedBanner.titulo}
                          </span>
                          <span className="flex items-center gap-1.5 font-display text-sm text-purple-300/80 text-center">
                            {t('gacha.packInfo', { cost: selectedBanner.coste, count: selectedBanner.cartasPorSobre })}
                          </span>
                          {selectedStatus === 'programado' && (
                            <span className="text-xs font-body text-amber-300/80 mt-1">{t('gacha.notStarted')}</span>
                          )}
                          {selectedStatus === 'finalizado' && (
                            <span className="text-xs font-body text-stone-400 mt-1">{t('gacha.ended')}</span>
                          )}
                          {selectedStatus === 'activo' && selectedBanner.cards.length === 0 && (
                            <span className="text-xs font-body text-red-400/80 mt-1">{t('gacha.noCards')}</span>
                          )}
                          {selectedStatus === 'activo' && !loading && !canAfford && (
                            <span className="text-xs font-body text-red-400/80 mt-1">{t('gacha.notEnoughCoins')}</span>
                          )}
                        </motion.button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setEditor({ open: true, banner: selectedBanner })}
                            className="px-3 py-1.5 rounded-md border border-purple-500/30 text-purple-200 font-display text-[10px] tracking-[0.15em] hover:bg-purple-600/20 transition-colors"
                          >
                            {t('gacha.editBanner')}
                          </button>
                        )}
                      </div>

                      {/* Banner card pool: probability from the banner weight, rarity from the card's own weight */}
                      <div className="w-full">
                        <p className="text-[10px] font-display uppercase tracking-widest text-purple-300/50 mb-2">
                          {t('gacha.bannerCards')}
                        </p>
                        <div className="flex flex-col gap-1 sm:max-h-[50vh] sm:overflow-y-auto sm:pr-1">
                          {[...selectedBanner.cards]
                            .sort((a, b) => b.pesoAparicion - a.pesoAparicion)
                            .map((bc) => {
                              const def = cardsById.get(bc.cardId);
                              const rarity = def ? getRarity(def) : 'comun';
                              const maxed = (collection[bc.cardId] ?? 0) >= MAX_COPIES_PER_CARD;
                              return (
                                <div
                                  key={bc.cardId}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[hsl(220,15%,12%)] border ${RARITY_COLORS[rarity]}`}
                                >
                                  <span className="flex-1 min-w-0 text-[11px] font-display truncate">{def ? cardName(def) : cardNameById(bc.cardId)}</span>
                                  {maxed && (
                                    <span
                                      title={t('gacha.maxedTitle', { max: MAX_COPIES_PER_CARD })}
                                      className="text-[8px] font-display px-1 py-0.5 rounded border border-amber-500/40 text-amber-300"
                                    >
                                      {t('gacha.maxBadge')}
                                    </span>
                                  )}
                                  <span className="text-[9px] font-body opacity-60">{t(`common.rarity.${rarity}`)}</span>
                                  <span className="w-12 text-right text-[11px] font-display tabular-nums">
                                    {((probabilities[bc.cardId] ?? 0) * 100).toFixed(1)}%
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-purple-300/30">
                      <span className="text-6xl opacity-40">🎁</span>
                      <span className="font-display text-[10px] tracking-[0.2em] uppercase">{t('gacha.title')}</span>
                    </div>
                  )}
                </TerminalPanel>
              </div>

              {/* Collection summary — full width */}
              <div className="w-full rounded-lg border border-purple-500/15 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <span className="text-[10px] font-body text-purple-400/50 tracking-wider uppercase">
                    {t('gacha.collection')}
                  </span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {cards.map((def) => {
                    const qty = collection[def.id] ?? 0;
                    const rarity = getRarity(def);
                    return (
                      <div
                        key={def.id}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md bg-[hsl(220,15%,12%)] border ${qty > 0 ? RARITY_COLORS[rarity] : 'text-purple-200/20 border-[hsl(220,15%,15%)]'}`}
                      >
                        <img
                          src={resolveCardImage(def.image)}
                          alt={cardName(def)}
                          className="w-7 h-7 object-contain rounded shrink-0"
                          onError={(event) => {
                            const img = event.currentTarget;
                            if (img.dataset.fallbackApplied === 'true') return;
                            img.dataset.fallbackApplied = 'true';
                            img.src = DEFAULT_CARD_IMAGE;
                          }}
                          draggable={false}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-display truncate">{cardName(def)}</p>
                          <p className="text-[9px] font-body opacity-60">{t(`common.rarity.${rarity}`)}</p>
                        </div>
                        <span className="text-xs font-display tabular-nums">×{qty}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ OPENING ANIMATION ═══ */}
          {phase === 'opening' && (
            <motion.div
              key="opening"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="flex flex-col items-center gap-6"
            >
              <motion.span
                animate={{
                  scale: [1, 1.3, 1],
                  rotate: [0, -10, 10, -5, 0],
                }}
                transition={{ duration: 1, ease: 'easeInOut' }}
                className="text-8xl"
              >
                🎁
              </motion.span>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '200px' }}
                transition={{ duration: 1 }}
                className="h-1 bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full"
              />
              <p className="font-display text-purple-200/60 text-sm tracking-wider animate-pulse">
                {t('gacha.opening')}
              </p>
            </motion.div>
          )}

          {/* ═══ REVEAL PHASE ═══ */}
          {phase === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 w-full max-w-4xl"
            >
              <div className="w-full rounded-lg border border-purple-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(260,80%,60%,0.15)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[hsl(220,18%,10%)]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  </div>
                  <span className="ml-2 text-[10px] font-body text-purple-400/50 tracking-wider uppercase">
                    {t('gacha.resultsPath')}
                  </span>
                </div>

                <div className="p-4 sm:p-6 flex flex-col items-center gap-5">
                  <h2 className="font-display text-lg text-purple-100 tracking-wider text-glow-purple">
                    {t('gacha.newRecruits')}
                  </h2>

                  <div className="flex flex-wrap gap-3 sm:gap-5 justify-center w-full">
                    {pulled.map(({ def, repetida, oro }, i) => {
                      const revealed = i <= revealedIdx;
                      const rarity = getRarity(def);
                      return (
                        <motion.div
                          key={i}
                          initial={{ rotateY: 180, scale: 0.8 }}
                          animate={
                            revealed
                              ? { rotateY: 0, scale: 1 }
                              : { rotateY: 180, scale: 0.8 }
                          }
                          transition={{ type: 'spring', damping: 15, stiffness: 150 }}
                          className="perspective-[800px]"
                        >
                          {revealed ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={`relative flex flex-col items-center gap-2 p-4 sm:p-5 rounded-lg bg-gradient-to-b from-[hsl(220,15%,14%)] to-[hsl(220,18%,10%)] border-2 ${RARITY_COLORS[rarity]} backdrop-blur-sm shadow-lg ${RARITY_GLOW[rarity]} w-24 sm:w-36 lg:w-40`}
                            >
                              {repetida && (
                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] sm:text-[9px] font-display tracking-wider px-1.5 py-0.5 rounded bg-amber-900/90 border border-amber-500/50 text-amber-200">
                                  {t('gacha.duplicate')}
                                </span>
                              )}
                              <img
                                src={resolveCardImage(def.image)}
                                alt={cardName(def)}
                                className={`w-12 h-12 sm:w-20 sm:h-20 object-contain rounded ${repetida ? 'opacity-50 grayscale' : ''}`}
                                onError={(event) => {
                                  const img = event.currentTarget;
                                  if (img.dataset.fallbackApplied === 'true') return;
                                  img.dataset.fallbackApplied = 'true';
                                  img.src = DEFAULT_CARD_IMAGE;
                                }}
                                draggable={false}
                              />
                              <span className="text-xs sm:text-sm font-display text-center leading-tight">
                                {cardName(def)}
                              </span>
                              <span className={`text-[10px] font-body ${RARITY_COLORS[rarity]}`}>
                                {t(`common.rarity.${rarity}`)}
                              </span>
                              {repetida ? (
                                <span className="text-xs font-display text-amber-300">+{oro} 🪙</span>
                              ) : def.potencia !== undefined && (
                                <span className="text-xs font-display text-purple-300/80">
                                  ⚔️ {def.potencia}
                                </span>
                              )}
                            </motion.div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-lg bg-gradient-to-b from-purple-900/20 to-[hsl(220,18%,10%)] border-2 border-purple-700/30 w-24 sm:w-36 lg:w-40 h-32 sm:h-48">
                              <span className="text-3xl sm:text-4xl opacity-50">❓</span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  {allRevealed && duplicateGold > 0 && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-body text-amber-200/90 text-center"
                    >
                      {t('gacha.duplicateGold', { max: MAX_COPIES_PER_CARD })}{' '}
                      <span className="font-display text-amber-300">+{duplicateGold} 🪙</span>
                    </motion.p>
                  )}

                  <motion.button
                    onClick={handleRevealNext}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-2 px-8 py-3 font-display text-sm tracking-wide rounded-md bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white hover:from-purple-500/90 hover:to-indigo-500/90 border border-purple-400/30 shadow-[0_0_20px_-5px_hsl(260,80%,60%,0.3)] transition-all hover:shadow-[0_0_25px_-5px_hsl(260,80%,60%,0.5)]"
                  >
                    {allRevealed ? t('gacha.collect') : t('gacha.revealNext')}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {isAdmin && (
        <BannerEditorModal
          open={editor.open}
          onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
          banner={editor.banner}
          cards={cards}
          onSave={handleSaveBanner}
        />
      )}
    </div>
  );
}
