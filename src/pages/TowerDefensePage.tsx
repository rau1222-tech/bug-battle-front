import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import BackButton from '@/components/ui/BackButton';
import { useAuthContext } from '@/contexts/AuthContext';
import { getActiveDeckId, useDecks } from '@/hooks/useDecks';
import { useCards } from '@/hooks/useCards';
import { useTowerDefenseRewards } from '@/hooks/useTowerDefenseRewards';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_CARD_IMAGE, resolveCardImage, type CardTemplate } from '@/constants';
import { BUG_RULES } from '@/game/onlineEngine';
import {
  BUGS_PER_COIN,
  TD_FIELD_LENGTH,
  TD_INCOME_SECONDS,
  TD_LANES,
  TD_MAX_TOWERS,
  TD_PC_MAX_HP,
  TD_SLOTS_PER_LANE,
  cardPointCost,
  coinsFor,
  consumableDamage,
  createTowerDefense,
  fireConsumable,
  isTowerDefenseCard,
  placeCard,
  tick,
  towerStats,
  type TDBugKind,
  type TDError,
  type TDState,
} from '@/game/towerDefense';
import { useI18n } from '@/i18n';
import { ROUTES } from '@/routes';
import { cn } from '@/lib/utils';

type Phase = 'loading' | 'intro' | 'playing' | 'over';

const BUG_ICON: Record<TDBugKind, string> = { nullpointer: '🐛', heisenbug: '🦟', 'legacy-code': '🪲' };
const MAX_FRAME_DT = 0.1;
const pct = (x: number) => `${(x / TD_FIELD_LENGTH) * 100}%`;

export default function TowerDefensePage() {
  const navigate = useNavigate();
  const { t, cardName } = useI18n();
  const { user } = useAuthContext();
  const { decks, loading: decksLoading } = useDecks(user.id);
  const { cards, skills, loading: cardsLoading } = useCards();
  const { startRun, claim, savedCoins, status: rewardStatus } = useTowerDefenseRewards();

  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const [best, setBest] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [game, setGame] = useState<TDState>(createTowerDefense);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const gameRef = useRef(game);
  const claimedCoins = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void getActiveDeckId(user.id).then((id) => !cancelled && setActiveId(id));
    void supabase.from('players').select('td_best_kills').eq('id', user.id).single().then(({ data }) => {
      if (!cancelled && data) setBest(data.td_best_kills);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const activeDeck = activeId ? decks.find((d) => d.id === activeId) ?? null : null;
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const palette = useMemo<CardTemplate[]>(() => {
    if (!activeDeck) return [];
    return activeDeck.cards
      .map((e) => cardById.get(e.card_id))
      .filter((c): c is CardTemplate => !!c && isTowerDefenseCard(c, skills))
      .sort((a, b) => cardPointCost(a) - cardPointCost(b));
  }, [activeDeck, cardById, skills]);
  const selectedCard = selected ? cardById.get(selected) ?? null : null;

  const loading = decksLoading || cardsLoading || activeId === undefined;
  const effectivePhase: Phase = loading ? 'loading' : phase;

  const showError = useCallback((error: TDError) => setFlash(t(`td.error.${error}`, { max: TD_MAX_TOWERS })), [t]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const commit = (next: TDState) => {
    gameRef.current = next;
    setGame(next);
  };

  const start = () => {
    commit(createTowerDefense());
    claimedCoins.current = 0;
    setSelected(null);
    setPaused(false);
    startRun();
    setPhase('playing');
  };

  // Game loop
  useEffect(() => {
    if (phase !== 'playing' || paused) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
      last = now;
      const next = tick(gameRef.current, dt);
      gameRef.current = next;
      setGame(next);
      if (next.over) {
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused]);

  // Every new coin is saved straight away, so leaving mid-run never loses it
  useEffect(() => {
    const coins = coinsFor(game.kills);
    if (phase === 'playing' && coins > claimedCoins.current) {
      claimedCoins.current = coins;
      claim(game.kills);
    }
  }, [game.kills, phase, claim]);

  useEffect(() => {
    if (phase !== 'over') return;
    claim(gameRef.current.kills, true);
    setBest((b) => Math.max(b ?? 0, gameRef.current.kills));
  }, [phase, claim]);

  // Leaving the page closes the run
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => () => {
    if (phaseRef.current === 'playing') claim(gameRef.current.kills, true);
  }, [claim]);

  // Pause when the tab is hidden; Esc cancels the selection, P/space toggles pause
  useEffect(() => {
    const onVisibility = () => document.hidden && setPaused(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
      if ((e.key === 'p' || e.key === ' ') && phaseRef.current === 'playing') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSlot = (lane: number, slot: number) => {
    if (!selectedCard || phase !== 'playing' || paused) return;
    if (selectedCard.tipo === 'consumible') return handleLane(lane);
    const r = placeCard(gameRef.current, selectedCard, lane, slot, skills);
    if (r.error) return showError(r.error);
    commit(r.state);
    if (r.state.points < cardPointCost(selectedCard)) setSelected(null);
  };

  const handleLane = (lane: number) => {
    if (!selectedCard || selectedCard.tipo !== 'consumible' || phase !== 'playing' || paused) return;
    const r = fireConsumable(gameRef.current, selectedCard, lane, skills);
    if (r.error) return showError(r.error);
    commit(r.state);
    setSelected(null);
  };

  const coins = coinsFor(game.kills);
  const imageOf = (cardId: string) => resolveCardImage(cardById.get(cardId)?.image);

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern select-none">
      <div className="fixed top-1/4 left-1/4 w-80 h-80 bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-72 h-72 bg-red-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <BackButton onClick={() => navigate(ROUTES.HOME)} color="cyan" />
          <h1 className="font-display text-base sm:text-2xl text-amber-100 tracking-[0.2em]">🛡️ {t('td.title')}</h1>
          {effectivePhase === 'playing' ? (
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-3 py-1.5 rounded-md border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10 font-display text-[10px] tracking-wider uppercase"
            >
              {paused ? `▶ ${t('td.resume')}` : `⏸ ${t('td.pause')}`}
            </button>
          ) : (
            <div className="w-20" />
          )}
        </div>

        {/* HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Hud icon="💻" label={t('td.pc')}>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-black/40 overflow-hidden border border-red-900/40">
                <div
                  className={cn('h-full transition-all', game.pcHp > 6 ? 'bg-emerald-500' : game.pcHp > 3 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${(game.pcHp / TD_PC_MAX_HP) * 100}%` }}
                />
              </div>
              <span className="tabular-nums">{game.pcHp}/{TD_PC_MAX_HP}</span>
            </div>
          </Hud>
          <Hud icon="⭐" label={t('td.points')}>{game.points}</Hud>
          <Hud icon="🐛" label={t('td.kills')}>{game.kills}</Hud>
          <Hud icon="🪙" label={t('td.coins')}>
            {coins}
            <span className="ml-1 text-[9px] text-amber-200/40">({game.kills % BUGS_PER_COIN}/{BUGS_PER_COIN})</span>
            {rewardStatus === 'error' && <span className="ml-1" title={t('td.saveError')}>⚠️</span>}
          </Hud>
          <Hud icon="🃏" label={t('td.board')}>{game.towers.length}/{TD_MAX_TOWERS}</Hud>
          <Hud icon="📈" label={t('td.level')}>{game.level + 1}</Hud>
        </div>

        {/* Board */}
        <div className="relative rounded-lg border border-amber-500/20 bg-[hsl(220,20%,8%)]/90 overflow-hidden">
          {Array.from({ length: TD_LANES }, (_, lane) => (
            <div
              key={lane}
              onClick={() => selectedCard?.tipo === 'consumible' && handleLane(lane)}
              className={cn(
                'relative flex h-20 sm:h-24 md:h-28 border-b border-amber-900/20 last:border-b-0',
                selectedCard?.tipo === 'consumible' && 'cursor-crosshair hover:bg-red-500/10',
              )}
            >
              <div className="w-12 sm:w-16 shrink-0 flex flex-col items-center justify-center border-r border-cyan-500/20 bg-cyan-950/30">
                <span className={cn('text-2xl sm:text-3xl', game.pcHp <= 3 && 'animate-pulse')}>💻</span>
              </div>

              <div className="relative flex-1">
                {/* Slots */}
                <div className="absolute inset-y-0 left-0 flex" style={{ width: pct(TD_SLOTS_PER_LANE) }}>
                  {Array.from({ length: TD_SLOTS_PER_LANE }, (_, slot) => {
                    const tower = game.towers.find((tw) => tw.lane === lane && tw.slot === slot);
                    const placing = !!selectedCard && selectedCard.tipo !== 'consumible' && !tower && game.towers.length < TD_MAX_TOWERS;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSlot(lane, slot);
                        }}
                        className={cn(
                          'relative flex-1 m-0.5 sm:m-1 rounded border border-dashed border-amber-700/20 flex items-center justify-center',
                          placing && 'border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/25 cursor-pointer',
                          !placing && 'cursor-default',
                        )}
                      >
                        {tower && (
                          <div className="relative h-full w-full flex flex-col items-center justify-center gap-0.5 p-0.5">
                            <img
                              src={imageOf(tower.cardId)}
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_CARD_IMAGE;
                              }}
                              alt={cardName({ id: tower.cardId, nombre: cardById.get(tower.cardId)?.nombre ?? tower.cardId })}
                              className="h-[70%] max-w-full object-contain rounded-sm border border-emerald-400/40 bg-black/30"
                              draggable={false}
                            />
                            <div className="w-full h-1 rounded-full bg-black/50 overflow-hidden">
                              <div className="h-full bg-emerald-400" style={{ width: `${(tower.hp / tower.maxHp) * 100}%` }} />
                            </div>
                            <span className="absolute top-0 right-0 text-[8px] sm:text-[10px] font-display bg-black/60 rounded px-0.5 text-amber-200">
                              ⚔️{tower.damage}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Shots */}
                {game.shots.filter((s) => s.lane === lane).map((s) => (
                  <div
                    key={s.id}
                    className={cn('absolute top-1/2 h-0.5 pointer-events-none rounded-full', s.special ? 'bg-yellow-300 h-1 shadow-[0_0_8px_rgba(253,224,71,0.8)]' : 'bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]')}
                    style={{ left: pct(Math.min(s.fromX, s.toX)), width: pct(Math.abs(s.toX - s.fromX)), opacity: Math.min(1, s.ttl * 8) }}
                  />
                ))}

                {/* Bugs */}
                {game.bugs.filter((b) => b.lane === lane).map((b) => (
                  <div
                    key={b.id}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                    style={{ left: pct(b.x) }}
                    title={BUG_RULES.find((r) => r.id === b.kind)?.nombre}
                  >
                    <span className={cn('leading-none drop-shadow-[0_0_8px_rgba(100,255,100,0.5)]', b.kind === 'legacy-code' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl')} style={{ transform: 'scaleX(-1)' }}>
                      {BUG_ICON[b.kind]}
                    </span>
                    <div className="w-8 sm:w-10 h-1 rounded-full bg-black/60 overflow-hidden mt-0.5">
                      <div className="h-full bg-red-500" style={{ width: `${Math.max(0, b.hp / b.maxHp) * 100}%` }} />
                    </div>
                  </div>
                ))}

                {/* Popups */}
                {game.popups.filter((p) => p.lane === lane).map((p) => (
                  <span
                    key={p.id}
                    className="absolute top-1 -translate-x-1/2 font-display text-xs sm:text-sm text-amber-200 pointer-events-none"
                    style={{ left: pct(p.x), opacity: p.ttl, transform: `translate(-50%, ${-(1 - p.ttl) * 20}px)` }}
                  >
                    {p.text}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <AnimatePresence>
            {effectivePhase !== 'playing' || paused ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
              >
                <Overlay
                  phase={effectivePhase}
                  paused={paused}
                  hasDeck={!!activeDeck}
                  hasCards={palette.length > 0}
                  game={game}
                  best={best}
                  savedCoins={savedCoins}
                  saveError={rewardStatus === 'error'}
                  onStart={start}
                  onResume={() => setPaused(false)}
                  onExit={() => navigate(ROUTES.HOME)}
                  onDecks={() => navigate(ROUTES.DECKS)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Hint / errors */}
        <p className={cn('text-center text-[11px] sm:text-xs font-body min-h-[1rem]', flash ? 'text-red-300' : 'text-amber-200/50')}>
          {flash
            ?? (selectedCard
              ? t(selectedCard.tipo === 'consumible' ? 'td.pickLane' : 'td.pickSlot', { card: cardName(selectedCard) })
              : effectivePhase === 'playing' ? t('td.pickCard') : '')}
          {selectedCard && !flash && (
            <button className="ml-2 underline text-amber-100/70" onClick={() => setSelected(null)}>{t('td.cancel')}</button>
          )}
        </p>

        {/* Palette */}
        {palette.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 justify-start sm:justify-center">
            {palette.map((card) => {
              const cost = cardPointCost(card);
              const cooldown = game.cooldowns[card.id] ?? 0;
              const affordable = game.points >= cost && cooldown <= 0;
              const stats = towerStats(card, skills);
              const isSelected = selected === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={effectivePhase !== 'playing' || paused}
                  onClick={() => setSelected(isSelected ? null : card.id)}
                  title={cardName(card)}
                  className={cn(
                    'relative shrink-0 w-[4.6rem] sm:w-24 rounded-md border p-1.5 flex flex-col items-center gap-1 transition-all bg-[hsl(220,15%,11%)]',
                    isSelected ? 'border-amber-300 shadow-[0_0_15px_-3px_rgba(251,191,36,0.6)] -translate-y-1' : 'border-amber-900/40 hover:border-amber-500/50',
                    !affordable && 'opacity-50',
                  )}
                >
                  <img
                    src={resolveCardImage(card.image)}
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_CARD_IMAGE;
                    }}
                    alt=""
                    className="h-10 sm:h-14 object-contain"
                    draggable={false}
                  />
                  <span className="text-[8px] sm:text-[10px] font-display text-amber-100 truncate w-full text-center">{cardName(card)}</span>
                  <span className="text-[8px] sm:text-[9px] font-body text-amber-200/70 flex gap-1.5">
                    {card.tipo === 'consumible' ? (
                      <span title={t('td.damage')}>💥{consumableDamage(card, skills)}</span>
                    ) : (
                      <>
                        <span title={t('td.damage')}>⚔️{stats.damage}{stats.special > 0 && `+${stats.special}`}</span>
                        <span title={t('td.sanity')}>🧠{stats.hp}</span>
                      </>
                    )}
                  </span>
                  <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-600 border border-amber-300/60 text-[9px] sm:text-[10px] font-display text-white px-1.5" title={t('td.cost')}>
                    {cost}⭐
                  </span>
                  {cooldown > 0 && (
                    <span className="absolute inset-0 rounded-md bg-black/60 flex items-center justify-center font-display text-sm text-cyan-200">
                      {Math.ceil(cooldown)}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Hud({ icon, label, children, className }: { icon: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md bg-[hsl(220,15%,11%)] border border-amber-900/40 px-3 py-1.5 flex items-center gap-2', className)}>
      <span className="text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-body uppercase tracking-widest text-amber-300/40">{label}</p>
        <div className="font-display text-sm text-amber-100 tabular-nums">{children}</div>
      </div>
    </div>
  );
}

interface OverlayProps {
  phase: Phase;
  paused: boolean;
  hasDeck: boolean;
  hasCards: boolean;
  game: TDState;
  best: number | null;
  savedCoins: number;
  saveError: boolean;
  onStart: () => void;
  onResume: () => void;
  onExit: () => void;
  onDecks: () => void;
}

function Overlay({ phase, paused, hasDeck, hasCards, game, best, savedCoins, saveError, onStart, onResume, onExit, onDecks }: OverlayProps) {
  const { t } = useI18n();
  const btn = 'px-4 py-2 rounded-md font-display text-xs tracking-widest uppercase transition-colors';

  if (phase === 'loading') return <p className="font-display text-sm text-amber-200/60">{t('td.loading')}</p>;

  if (!hasDeck || !hasCards) {
    return (
      <div className="text-center flex flex-col items-center gap-3">
        <p className="font-body text-sm text-amber-200/80">{t(hasDeck ? 'td.noCards' : 'td.needDeck')}</p>
        <button onClick={onDecks} className={cn(btn, 'bg-emerald-600/80 hover:bg-emerald-500 text-white')}>{t('td.goToDecks')}</button>
      </div>
    );
  }

  if (phase === 'playing' && paused) {
    return (
      <div className="text-center flex flex-col items-center gap-3">
        <p className="font-display text-xl text-amber-100 tracking-[0.3em]">{t('td.paused')}</p>
        <div className="flex gap-2">
          <button onClick={onResume} className={cn(btn, 'bg-amber-600/80 hover:bg-amber-500 text-white')}>▶ {t('td.resume')}</button>
          <button onClick={onExit} className={cn(btn, 'border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10')}>{t('td.exit')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'over') {
    const coins = coinsFor(game.kills);
    return (
      <div className="text-center flex flex-col items-center gap-2">
        <p className="font-display text-lg sm:text-2xl text-red-300 tracking-widest">{t('td.gameOver')}</p>
        <p className="font-body text-sm text-amber-100/80">{t('td.gameOverStats', { kills: game.kills, level: game.level + 1 })}</p>
        <p className="font-display text-sm text-amber-200">{t('td.coinsEarned', { coins })}</p>
        {coins > 0 && (
          <p className={cn('font-body text-[11px]', saveError ? 'text-red-300' : 'text-emerald-300/80')}>
            {saveError ? t('td.saveError') : t('td.coinsSaved', { coins: savedCoins })}
          </p>
        )}
        {best !== null && <p className="font-body text-[11px] text-amber-200/50">{t('td.best', { kills: best })}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={onStart} className={cn(btn, 'bg-amber-600/80 hover:bg-amber-500 text-white')}>↻ {t('td.restart')}</button>
          <button onClick={onExit} className={cn(btn, 'border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10')}>{t('td.exit')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md text-center flex flex-col items-center gap-3">
      <p className="font-display text-lg text-amber-100 tracking-widest">{t('td.rulesTitle')}</p>
      <ul className="text-left font-body text-xs sm:text-sm text-amber-100/80 list-disc pl-5 space-y-1">
        <li>{t('td.rule1')}</li>
        <li>{t('td.rule2')}</li>
        <li>{t('td.rule3', { income: TD_INCOME_SECONDS, max: TD_MAX_TOWERS })}</li>
        <li>{t('td.rule4', { count: BUGS_PER_COIN })}</li>
      </ul>
      {best !== null && best > 0 && <p className="font-body text-[11px] text-amber-200/50">{t('td.best', { kills: best })}</p>}
      <button onClick={onStart} className={cn(btn, 'bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white px-8 py-3 text-sm')}>
        ▶ {t('td.start')}
      </button>
    </div>
  );
}
