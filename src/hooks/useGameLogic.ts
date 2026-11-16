import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DECK_SIZE, type CardTemplate, type DeckComposition } from '@/constants';
import { applyAction, initMatch, redactFor, type CardCatalog, type DeckEntry, type MatchAction, type MatchState } from '@/game/onlineEngine';
import { botNextAction, randomBotDeck } from '@/game/botAI';
import { toCardCatalog } from '@/game/catalog';
import { useMatchController, type ActionInput, type GameController, type LocalMessage } from '@/hooks/useMatchController';
import { t } from '@/i18n';

export type { BugState, GameController, GamePhase } from '@/hooks/useMatchController';

const BOT_STEP_MS = 900;

function defaultDeck(catalog: CardCatalog): DeckEntry[] {
  const ids = Object.keys(catalog);
  const counts = new Map<string, number>();
  for (let i = 0; i < DECK_SIZE && ids.length > 0; i++) {
    const id = ids[i % ids.length];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([card_id, quantity]) => ({ card_id, quantity }));
}

function newMatch(composition: DeckComposition[] | undefined, catalog: CardCatalog, playerName: string): MatchState {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const decks = { p1: composition?.length ? composition : defaultDeck(catalog), p2: randomBotDeck(catalog) };
  return initMatch(seed, decks, { p1: playerName, p2: 'Bot' }, catalog);
}

interface LocalState {
  match: MatchState;
  version: number;
  error: (LocalMessage & { key: number }) | null;
}

/** Local game vs the bot, running the same engine as online matches (player = p1, bot = p2). */
export function useGameLogic(playerComposition: DeckComposition[] | undefined, cards: CardTemplate[], playerName = t('game.defaultPlayerName')): GameController {
  const catalog = useMemo(() => toCardCatalog(cards), [cards]);
  const setupRef = useRef({ playerComposition, playerName, catalog });
  setupRef.current = { playerComposition, playerName, catalog };
  const [local, setLocal] = useState<LocalState>(() => ({ match: newMatch(playerComposition, catalog, playerName), version: 0, error: null }));

  const apply = useCallback((action: MatchAction) => {
    setLocal((prev) => {
      const r = applyAction(prev.match, action);
      if (r.error) {
        return { ...prev, error: { text: r.error, msg: r.errorMsg, key: (prev.error?.key ?? 0) + 1 } };
      }
      return { match: r.state, version: prev.version + 1, error: null };
    });
  }, []);

  const dispatch = useCallback((action: ActionInput) => apply({ ...action, side: 'p1' } as MatchAction), [apply]);
  const restart = useCallback(() => {
    const { playerComposition: comp, playerName: name, catalog: cat } = setupRef.current;
    setLocal((prev) => ({ match: newMatch(comp, cat, name), version: prev.version + 1, error: null }));
  }, []);

  const { match } = local;
  useEffect(() => {
    if (match.gamePhase !== 'playing' || match.turn !== 'p2') return;
    const t = setTimeout(() => apply(botNextAction(match, 'p2')), BOT_STEP_MS);
    return () => clearTimeout(t);
  }, [match, apply]);

  const view = useMemo(() => redactFor(match, 'p1'), [match]);
  return useMatchController(view, {
    version: local.version,
    message: local.error,
    messageKey: local.error ? `e-${local.version}-${local.error.key}` : `v-${local.version}`,
    busy: false,
    turnDeadline: null,
    dispatch,
    restart,
    cards,
  })!;
}
