import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_DEFINITIONS, DECK_SIZE, type DeckComposition } from '@/constants';
import { applyAction, initMatch, redactFor, type DeckEntry, type MatchAction, type MatchState } from '@/game/onlineEngine';
import { botNextAction, randomBotDeck } from '@/game/botAI';
import { useMatchController, type ActionInput, type GameController } from '@/hooks/useMatchController';

export type { BugState, GameController, GamePhase } from '@/hooks/useMatchController';

const BOT_STEP_MS = 900;

function defaultDeck(): DeckEntry[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < DECK_SIZE; i++) {
    const id = CARD_DEFINITIONS[i % CARD_DEFINITIONS.length].id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([card_id, quantity]) => ({ card_id, quantity }));
}

function newMatch(composition: DeckComposition[] | undefined, playerName: string): MatchState {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const decks = { p1: composition?.length ? composition : defaultDeck(), p2: randomBotDeck() };
  return initMatch(seed, decks, { p1: playerName, p2: 'Bot' });
}

interface LocalState {
  match: MatchState;
  version: number;
  error: { text: string; key: number } | null;
}

/** Local game vs the bot, running the same engine as online matches (player = p1, bot = p2). */
export function useGameLogic(playerComposition?: DeckComposition[], playerName = 'Jugador'): GameController {
  const setupRef = useRef({ playerComposition, playerName });
  setupRef.current = { playerComposition, playerName };
  const [local, setLocal] = useState<LocalState>(() => ({ match: newMatch(playerComposition, playerName), version: 0, error: null }));

  const apply = useCallback((action: MatchAction) => {
    setLocal((prev) => {
      const r = applyAction(prev.match, action);
      if (r.error) {
        return { ...prev, error: { text: `⚠️ ${r.error.replace(/^⚠️\s*/, '')}`, key: (prev.error?.key ?? 0) + 1 } };
      }
      return { match: r.state, version: prev.version + 1, error: null };
    });
  }, []);

  const dispatch = useCallback((action: ActionInput) => apply({ ...action, side: 'p1' } as MatchAction), [apply]);
  const restart = useCallback(() => {
    const { playerComposition: comp, playerName: name } = setupRef.current;
    setLocal((prev) => ({ match: newMatch(comp, name), version: prev.version + 1, error: null }));
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
    message: local.error?.text ?? null,
    messageKey: local.error ? `e-${local.version}-${local.error.key}` : `v-${local.version}`,
    busy: false,
    turnDeadline: null,
    dispatch,
    restart,
  })!;
}
