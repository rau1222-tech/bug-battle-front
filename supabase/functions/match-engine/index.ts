import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  applyAction,
  initMatch,
  matchWinner,
  parseAction,
  redactFor,
  type DeckEntry,
  type MatchState,
  type Side,
} from '../_shared/engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
  const state = initMatch(
    seed,
    { p1: match.host_deck, p2: match.guest_deck ?? [] },
    { p1: match.host_name, p2: match.guest_name ?? 'Rival' },
  );
  // Both players may hit this at once: first insert wins
  const { error } = await admin.from('match_states').upsert(
    { match_id: match.id, state, version: 0 },
    { onConflict: 'match_id', ignoreDuplicates: true },
  );
  if (error) throw error;
  const row = (await loadState(admin, match.id))!;
  await publishViews(admin, match, row.state, row.version);
  return row;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    const body = await req.json().catch(() => null) as { op?: string; matchId?: string; action?: unknown } | null;
    const matchId = body?.matchId ?? '';
    if (!UUID_RE.test(matchId)) return json({ error: 'Partida no encontrada' }, 404);

    const { data: match, error: mErr } = await admin
      .from('matches')
      .select('id, status, host_id, guest_id, host_name, guest_name, host_deck, guest_deck')
      .eq('id', matchId)
      .maybeSingle<MatchRow>();
    if (mErr) throw mErr;
    if (!match || (match.host_id !== user.id && match.guest_id !== user.id)) {
      return json({ error: 'Partida no encontrada' }, 404);
    }
    const side: Side = match.host_id === user.id ? 'p1' : 'p2';

    if (!match.guest_id || match.status === 'waiting') {
      return json({ status: match.status, view: null, version: -1 });
    }

    let row = await loadOrInit(admin, match);

    if (body?.op !== 'action' || match.status !== 'active') {
      return json({ status: match.status, view: redactFor(row.state, side), version: row.version });
    }

    const action = parseAction(body.action, side);
    if (!action) return json({ status: match.status, error: 'Acción no válida', view: redactFor(row.state, side), version: row.version });

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = applyAction(row.state, action);
      if (result.error) {
        return json({ status: match.status, error: result.error, view: redactFor(row.state, side), version: row.version });
      }

      const version = row.version + 1;
      const { data: saved, error: sErr } = await admin
        .from('match_states')
        .update({ state: result.state, version, updated_at: new Date().toISOString() })
        .eq('match_id', match.id)
        .eq('version', row.version)
        .select('version');
      if (sErr) throw sErr;

      if (saved && saved.length === 1) {
        await publishViews(admin, match, result.state, version);
        await admin
          .from('matches')
          .update({ current_turn: result.state.turn, last_seq: version, updated_at: new Date().toISOString() })
          .eq('id', match.id)
          .eq('status', 'active');
        await admin.from('match_actions').insert({ match_id: match.id, seq: version, player_id: user.id, action });

        let status = match.status;
        const winner = matchWinner(result.state);
        if (winner) {
          const { data: finished, error: fErr } = await admin.rpc('finish_match_server', { p_match_id: match.id, p_winner: winner });
          if (fErr) throw fErr;
          status = finished as string;
        }
        return json({ status, view: redactFor(result.state, side), version });
      }

      // Lost an optimistic-concurrency race: reload and retry
      row = (await loadState(admin, match.id))!;
    }
    return json({ status: match.status, error: 'La partida está ocupada, inténtalo de nuevo', view: redactFor(row.state, side), version: row.version });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
