import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ROUND_END_SECONDS,
  TURN_SECONDS,
  applyAction,
  initMatch,
  matchWinner,
  other,
  parseAction,
  redactFor,
  type DeckEntry,
  type MatchAction,
  type MatchState,
  type Side,
} from '../_shared/engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...body, serverNow: Date.now() }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface MatchRow {
  id: string;
  status: string;
  host_id: string;
  guest_id: string | null;
  host_name: string;
  guest_name: string | null;
  host_deck: DeckEntry[];
  guest_deck: DeckEntry[] | null;
}

interface StateRow {
  state: MatchState;
  version: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Consecutive timed-out turns after which a player loses the match. */
const AFK_FORFEIT_TURNS = 3;

async function loadState(admin: SupabaseClient, matchId: string): Promise<StateRow | null> {
  const { data, error } = await admin.from('match_states').select('state, version').eq('match_id', matchId).maybeSingle();
  if (error) throw error;
  return data as StateRow | null;
}

async function publishViews(admin: SupabaseClient, match: MatchRow, state: MatchState, version: number) {
  const rows = (['p1', 'p2'] as Side[]).map((side) => ({
    match_id: match.id,
    player_id: side === 'p1' ? match.host_id : match.guest_id,
    side,
    view: redactFor(state, side),
    version,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await admin.from('match_views').upsert(rows, { onConflict: 'match_id,player_id' });
  if (error) throw error;
}

async function loadOrInit(admin: SupabaseClient, match: MatchRow): Promise<StateRow> {
  const existing = await loadState(admin, match.id);
  if (existing) return existing;

  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  const state: MatchState = {
    ...initMatch(
      seed,
      { p1: match.host_deck, p2: match.guest_deck ?? [] },
      { p1: match.host_name, p2: match.guest_name ?? 'Rival' },
    ),
    turnStartedAt: Date.now(),
  };
  // Both players may hit this at once: first insert wins
  const { error } = await admin.from('match_states').upsert(
    { match_id: match.id, state, version: 0 },
    { onConflict: 'match_id', ignoreDuplicates: true },
  );
  if (error) throw error;
  const row = (await loadState(admin, match.id))!;
  await publishViews(admin, match, row.state, row.version);
  await admin.from('matches').update({ current_turn: row.state.turn, updated_at: new Date().toISOString() }).eq('id', match.id).eq('status', 'active');
  return row;
}

/** The action a timeout claim triggers, or null if the current turn/pause hasn't expired. */
function timeoutAction(state: MatchState, claimer: Side): MatchAction | null {
  if (state.gamePhase === 'game-over' || !state.turnStartedAt) return null;
  const limit = (state.gamePhase === 'round-end' ? ROUND_END_SECONDS : TURN_SECONDS) * 1000;
  if (Date.now() < state.turnStartedAt + limit) return null;
  return state.gamePhase === 'round-end' ? { type: 'NEXT_ROUND', side: claimer } : { type: 'END_TURN', side: state.turn };
}

function stampTurnClock(prev: MatchState, next: MatchState): MatchState {
  const changed = prev.turn !== next.turn || prev.gamePhase !== next.gamePhase || prev.roundNumber !== next.roundNumber;
  return changed ? { ...next, turnStartedAt: Date.now() } : next;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido', errorMsg: { key: 'server.methodNotAllowed' } }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'No autenticado', errorMsg: { key: 'server.unauthenticated' } }, 401);

    const body = await req.json().catch(() => null) as { op?: string; matchId?: string; action?: unknown } | null;
    const matchId = body?.matchId ?? '';
    if (!UUID_RE.test(matchId)) return json({ error: 'Partida no encontrada', errorMsg: { key: 'server.notFound' } }, 404);

    const { data: match, error: mErr } = await admin
      .from('matches')
      .select('id, status, host_id, guest_id, host_name, guest_name, host_deck, guest_deck')
      .eq('id', matchId)
      .maybeSingle<MatchRow>();
    if (mErr) throw mErr;
    if (!match || (match.host_id !== user.id && match.guest_id !== user.id)) {
      return json({ error: 'Partida no encontrada', errorMsg: { key: 'server.notFound' } }, 404);
    }
    const side: Side = match.host_id === user.id ? 'p1' : 'p2';

    if (!match.guest_id || match.status === 'waiting') {
      return json({ status: match.status, view: null, version: -1 });
    }

    let row = await loadOrInit(admin, match);

    const op = body?.op;
    if ((op !== 'action' && op !== 'timeout') || match.status !== 'active') {
      return json({ status: match.status, view: redactFor(row.state, side), version: row.version });
    }

    let playerAction: MatchAction | null = null;
    if (op === 'action') {
      playerAction = parseAction(body.action, side);
      if (!playerAction) return json({ status: match.status, error: 'Acción no válida', errorMsg: { key: 'error.invalidAction' }, view: redactFor(row.state, side), version: row.version });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const action = playerAction ?? timeoutAction(row.state, side);
      if (!action) return json({ status: match.status, view: redactFor(row.state, side), version: row.version });

      const result = applyAction(row.state, action);
      if (result.error) {
        return json({ status: match.status, error: result.error, errorMsg: result.errorMsg, view: redactFor(row.state, side), version: row.version });
      }

      const idle = op === 'timeout' && action.type === 'END_TURN' ? action.side : null;
      const afk = { ...(row.state.afk ?? {}) };
      if (idle) afk[idle] = (afk[idle] ?? 0) + 1;
      else if (op === 'action') afk[side] = 0;
      const next = { ...stampTurnClock(row.state, result.state), afk };
      const version = row.version + 1;
      const forfeit = idle && (afk[idle] ?? 0) >= AFK_FORFEIT_TURNS ? other(idle) : null;
      const winner = matchWinner(next) ?? forfeit;
      // State, both views, the action log and the result are committed in one transaction
      const { data: outcome, error: cErr } = await admin.rpc('commit_match_action', {
        p_match_id: match.id,
        p_version: version,
        p_state: next,
        p_view_p1: redactFor(next, 'p1'),
        p_view_p2: redactFor(next, 'p2'),
        p_turn: next.turn,
        p_player: user.id,
        p_action: { ...action, timeout: op === 'timeout' },
        p_winner: winner,
      });
      if (cErr) throw cErr;

      if (outcome !== 'conflict') {
        const status = outcome === 'inactive' ? 'abandoned' : (outcome as string);
        if (outcome === 'inactive') return json({ status, view: redactFor(row.state, side), version: row.version });
        return json({ status, view: redactFor(next, side), version });
      }

      // Lost an optimistic-concurrency race: reload and retry
      row = (await loadState(admin, match.id))!;
    }
    return json({ status: match.status, error: 'La partida está ocupada, inténtalo de nuevo', errorMsg: { key: 'server.busy' }, view: redactFor(row.state, side), version: row.version });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno del servidor', errorMsg: { key: 'server.internal' } }, 500);
  }
});
