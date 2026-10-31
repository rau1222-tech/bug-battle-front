import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useMatchController, type ActionInput, type LocalMessage } from '@/hooks/useMatchController';
import { ROUND_END_SECONDS, TURN_SECONDS, type GameMessage, type MatchView, type Side } from '@/game/onlineEngine';
import { t, translator } from '@/i18n';

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
  errorMsg?: GameMessage;
  serverNow?: number;
}

/** Error carrying the server's structured message so it can be shown in the player's language. */
class EngineError extends Error {
  constructor(message: string, readonly msg?: GameMessage) {
    super(message);
  }
}

const errorText = (e: unknown, fallbackKey: string) => {
  if (e instanceof EngineError && e.msg) return translator().gameMessage(e.msg);
  return e instanceof Error ? e.message : t(fallbackKey);
};

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

/** Joins the random queue; returns a match id once paired, null while still waiting (poll again). */
export async function findRandomMatch(deckId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_random_match', { p_deck_id: deckId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Idempotent: whoever calls second simply finds nothing to delete. */
export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_match', { p_match_id: matchId });
  if (error) console.error('Failed to delete match:', error.message);
}

/** Leaves the random queue; returns a match id if a pairing happened just before cancelling. */
export async function cancelRandomMatch(): Promise<string | null> {
  const { data, error } = await supabase.rpc('cancel_random_match');
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export function useOnlineMatch(matchId: string, userId: string) {
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ view: MatchView; version: number } | null>(null);
  const [localMessage, setLocalMessage] = useState<(LocalMessage & { key: number }) | null>(null);
  const [opponentOnline, setOpponentOnline] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);
  /** serverNow - clientNow, so server timestamps can be shown on the local clock */
  const [clockOffset, setClockOffset] = useState(0);

  const versionRef = useRef(-1);
  const statusRef = useRef<string | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const errorKeyRef = useRef(0);

  const acceptView = useCallback((next: MatchView | null | undefined, version: number) => {
    if (!next || version <= versionRef.current) return;
    versionRef.current = version;
    setSnap({ view: next, version });
    setLocalMessage(null);
  }, []);

  const callEngine = useCallback(async (body: Record<string, unknown>): Promise<EngineResponse> => {
    const { data, error } = await supabase.functions.invoke<EngineResponse>('match-engine', { body: { matchId, ...body } });
    if (error) {
      let message = error.message;
      let msg: GameMessage | undefined;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          message = body.error ?? message;
          msg = body.errorMsg;
        } catch {
          // Non-JSON error body: keep the generic message
        }
      }
      throw new EngineError(message, msg);
    }
    if (typeof data?.serverNow === 'number') setClockOffset(data.serverNow - Date.now());
    return data!;
  }, [matchId]);

  const load = useCallback(async () => {
    const { data: m, error } = await supabase.from('matches').select(MATCH_COLUMNS).eq('id', matchId).maybeSingle<MatchInfo>();
    if (error || !m) {
      setLoadError(error?.message ?? t('engine.server.notFound'));
      return;
    }
    setMatch(m);
    statusRef.current = m.status;
    if (m.status === 'waiting') return;

    const { data: own } = await supabase.from('match_views').select('view, version').eq('match_id', matchId).maybeSingle();
    if (own) {
      acceptView(own.view as unknown as MatchView, own.version);
      // Also syncs the clock offset used by the turn timer
      callEngine({ op: 'state' }).then((r) => acceptView(r.view, r.version)).catch(() => {
        // The realtime view is already shown; nothing else to do
      });
      return;
    }
    // First visit after the guest joined: the server creates the state
    try {
      const r = await callEngine({ op: 'state' });
      acceptView(r.view, r.version);
    } catch (e) {
      setLoadError(errorText(e, 'online.loadError'));
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

  const view = snap?.view ?? null;
  const version = snap?.version ?? -1;
  const status = match?.status;
  useEffect(() => {
    if (status === 'finished' || status === 'abandoned') void deleteMatch(matchId);
  }, [status, matchId]);
  const you: Side = view?.you ?? (match?.host_id === userId ? 'p1' : 'p2');

  const showError = useCallback((text: string, msg?: GameMessage | null) => {
    errorKeyRef.current += 1;
    setLocalMessage({ text, msg, key: errorKeyRef.current });
  }, []);

  const dispatch = useCallback((action: ActionInput) => {
    setPending((n) => n + 1);
    // Sequential so actions reach the server in the order they were made
    chainRef.current = chainRef.current.then(async () => {
      try {
        const r = await callEngine({ op: 'action', action });
        acceptView(r.view, r.version);
        if (r.error) showError(r.error, r.errorMsg);
      } catch (e) {
        if (e instanceof EngineError) showError(e.message, e.msg);
        else showError(e instanceof Error ? e.message : t('online.connectionError'));
      } finally {
        setPending((n) => n - 1);
      }
    });
  }, [callEngine, acceptView, showError]);

  const turnDeadline = useMemo(() => {
    if (!view || !view.turnStartedAt || view.gamePhase === 'game-over') return null;
    const seconds = view.gamePhase === 'round-end' ? ROUND_END_SECONDS : TURN_SECONDS;
    return view.turnStartedAt + seconds * 1000 - clockOffset;
  }, [view, clockOffset]);

  // Once the turn (or round-end pause) expires, ask the server to advance it; it re-checks the clock itself
  useEffect(() => {
    if (turnDeadline === null || status !== 'active') return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const claim = () => {
      callEngine({ op: 'timeout' })
        .then((r) => acceptView(r.view, r.version))
        .catch(() => {
          // Transient failure: the interval retries
        });
    };
    const t = setTimeout(() => {
      claim();
      interval = setInterval(claim, 5000);
    }, Math.max(0, turnDeadline - Date.now() + 1500));
    return () => {
      clearTimeout(t);
      if (interval) clearInterval(interval);
    };
  }, [turnDeadline, status, callEngine, acceptView]);

  const noop = useCallback(() => {}, []);
  const game = useMatchController(view, {
    version,
    message: localMessage,
    messageKey: localMessage ? `e-${version}-${localMessage.key}` : `v-${version}`,
    busy: pending > 0,
    turnDeadline,
    dispatch,
    restart: noop,
  });

  return {
    match,
    loadError,
    game,
    opponentName: match ? (you === 'p1' ? match.guest_name : match.host_name) : null,
    opponentOnline,
  };
}
