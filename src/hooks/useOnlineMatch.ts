import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { CARD_DEFINITIONS, type CardInstance } from '@/constants';
import type { GameController } from '@/hooks/useGameLogic';
import type { EngineCard, MatchAction, MatchView, Side } from '@/game/onlineEngine';

export interface MatchInfo {
  id: string;
  code: string;
  status: string;
  host_id: string;
  guest_id: string | null;
  host_name: string;
  guest_name: string | null;
  winner_id: string | null;
}

interface EngineResponse {
  status?: string;
  view: MatchView | null;
  version: number;
  error?: string;
}

const MATCH_COLUMNS = 'id, code, status, host_id, guest_id, host_name, guest_name, winner_id';

export async function createMatch(deckId: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('create_match', { p_deck_id: deckId });
  if (error) throw new Error(error.message);
  return data as { id: string; code: string };
}

export async function joinMatch(code: string, deckId: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_match', { p_code: code, p_deck_id: deckId });
  if (error) throw new Error(error.message);
  return data;
}

export async function leaveMatch(matchId: string): Promise<string> {
  const { data, error } = await supabase.rpc('leave_match', { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return data;
}

const DEFS = new Map(CARD_DEFINITIONS.map((d) => [d.id, d]));

/** Server cards carry rules only; restore local art/audio for rendering. */
const hydrate = (card: EngineCard): CardInstance => ({ ...card, definition: DEFS.get(card.definition.id) ?? card.definition });
const hydrateTable = (table: (EngineCard | null)[]) => table.map((c) => (c ? hydrate(c) : null));

const HIDDEN_CARD = (i: number): CardInstance => ({
  instanceId: `hidden-${i}`,
  definition: CARD_DEFINITIONS[0],
  cordura: 0,
  efectosActivos: [],
  disponible: false,
});
const hidden = (n: number) => Array.from({ length: n }, (_, i) => HIDDEN_CARD(i));

type ActionInput = MatchAction extends infer A ? (A extends MatchAction ? Omit<A, 'side'> : never) : never;

export function useOnlineMatch(matchId: string, userId: string) {
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<MatchView | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [opponentOnline, setOpponentOnline] = useState<boolean | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [bugHit, setBugHit] = useState(false);

  const versionRef = useRef(-1);
  const statusRef = useRef<string | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const acceptView = useCallback((next: MatchView | null | undefined, version: number) => {
    if (!next || version <= versionRef.current) return;
    versionRef.current = version;
    setView(next);
    setLocalMessage(null);
  }, []);

  const callEngine = useCallback(async (body: Record<string, unknown>): Promise<EngineResponse> => {
    const { data, error } = await supabase.functions.invoke<EngineResponse>('match-engine', { body: { matchId, ...body } });
    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          message = (await error.context.json()).error ?? message;
        } catch {
          // Non-JSON error body: keep the generic message
        }
      }
      throw new Error(message);
    }
    return data!;
  }, [matchId]);

  const load = useCallback(async () => {
    const { data: m, error } = await supabase.from('matches').select(MATCH_COLUMNS).eq('id', matchId).maybeSingle<MatchInfo>();
    if (error || !m) {
      setLoadError(error?.message ?? 'Partida no encontrada');
      return;
    }
    setMatch(m);
    statusRef.current = m.status;
    if (m.status === 'waiting') return;

    const { data: own } = await supabase.from('match_views').select('view, version').eq('match_id', matchId).maybeSingle();
    if (own) {
      acceptView(own.view as unknown as MatchView, own.version);
      return;
    }
    // First visit after the guest joined: the server creates the state
    try {
      const r = await callEngine({ op: 'state' });
      acceptView(r.view, r.version);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar la partida');
    }
  }, [matchId, acceptView, callEngine]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    channel = supabase
      .channel(`match-${matchId}`, { config: { presence: { key: userId } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
        const row = payload.new as MatchInfo;
        const joined = statusRef.current === 'waiting' && row.status === 'active';
        statusRef.current = row.status;
        setMatch((prev) => ({ ...(prev ?? row), ...row }));
        if (joined) void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_views', filter: `match_id=eq.${matchId}` }, (payload) => {
        const row = payload.new as { player_id?: string; view?: MatchView; version?: number };
        if (row.player_id === userId && row.view && typeof row.version === 'number') acceptView(row.view, row.version);
      })
      .on('presence', { event: 'sync' }, () => {
        const keys = Object.keys(channel?.presenceState() ?? {});
        setOpponentOnline(keys.some((k) => k !== userId));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Load after subscribing so no update can slip in between
          void load();
          void channel?.track({ at: Date.now() });
        }
      });
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [matchId, userId, load, acceptView]);

  const you: Side = view?.you ?? (match?.host_id === userId ? 'p1' : 'p2');
  const foe: Side = you === 'p1' ? 'p2' : 'p1';

  useEffect(() => {
    const last = view?.lastAction;
    if (!last || last.side === you || !last.cardId) return;
    setHighlightId(last.cardId);
    const t = setTimeout(() => setHighlightId(null), 900);
    return () => clearTimeout(t);
  }, [view, you]);

  const hp = view?.bugComplexity ?? 0;
  const prevHpRef = useRef(hp);
  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = hp;
    if (hp < prev && hp > 0) {
      setBugHit(true);
      const t = setTimeout(() => setBugHit(false), 400);
      return () => clearTimeout(t);
    }
  }, [hp]);

  const dispatch = useCallback((action: ActionInput) => {
    // Sequential so actions reach the server in the order they were made
    chainRef.current = chainRef.current.then(async () => {
      try {
        const r = await callEngine({ op: 'action', action });
        acceptView(r.view, r.version);
        if (r.error) setLocalMessage(`⚠️ ${r.error.replace(/^⚠️\s*/, '')}`);
      } catch (e) {
        setLocalMessage(`⚠️ ${e instanceof Error ? e.message : 'Error de conexión'}`);
      }
    });
  }, [callEngine, acceptView]);

  const game = useMemo<GameController | null>(() => {
    if (!view) return null;
    const me = view.sides[you];
    const opp = view.sides[foe];
    const toView = (side: Side | null) => (side === null ? null : side === you ? 'player' : 'bot');
    return {
      bugComplexity: view.bugComplexity,
      bugState: view.bugComplexity === 0 ? 'death' : bugHit ? 'hit' : 'idle',
      playerHand: (me.hand ?? []).map(hydrate),
      playerTable: hydrateTable(me.table),
      playerDeck: hidden(me.deckCount),
      botHand: hidden(opp.handCount),
      botTable: hydrateTable(opp.table),
      botDeck: hidden(opp.deckCount),
      playerScore: me.score,
      botScore: opp.score,
      roundNumber: view.roundNumber,
      gamePhase: view.gamePhase,
      turn: toView(view.turn)!,
      lastAttacker: toView(view.lastAttacker),
      message: localMessage ?? view.message,
      isFirstTurn: view.isFirstTurn,
      botHighlightId: highlightId,
      playerTargetHighlightId: null,
      playerEnergy: me.energy,
      botEnergy: opp.energy,
      playerMaxEnergy: me.maxEnergy,
      botMaxEnergy: opp.maxEnergy,
      playerTurnCount: me.turnCount,
      botTurnCount: opp.turnCount,
      playCardToTable: (cardId: string, slot: number) => dispatch({ type: 'PLACE_CARD', cardId, slot }),
      playerAttackBug: (cardId: string) => dispatch({ type: 'ATTACK_BUG', cardId }),
      playerAttackEnemy: (attackerId: string, targetId: string) => dispatch({ type: 'ATTACK_CARD', attackerId, targetId }),
      playerUseSkill: (cardId: string, skillIndex: number, targetId?: string) => dispatch({ type: 'USE_SKILL', cardId, skillIndex, targetId }),
      playerUseConsumable: (cardId: string, targetId?: string) => dispatch({ type: 'USE_CONSUMABLE', cardId, targetId }),
      skipTurn: () => dispatch({ type: 'END_TURN' }),
      startNewRound: () => dispatch({ type: 'NEXT_ROUND' }),
      restartGame: () => {},
    };
  }, [view, you, foe, bugHit, localMessage, highlightId, dispatch]);

  return {
    match,
    loadError,
    game,
    opponentName: match ? (you === 'p1' ? match.guest_name : match.host_name) : null,
    opponentOnline,
  };
}
