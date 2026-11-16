import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RewardStatus = 'idle' | 'ok' | 'error';

interface Claim {
  kills: number;
  final: boolean;
}

/**
 * Keeps a Tower Defense run's coins in sync with the server. Claims are serialized and coalesced per run:
 * only the latest kill count is sent, and the server pays whatever is still owed (it's idempotent).
 */
export function useTowerDefenseRewards() {
  const runId = useRef<Promise<string | null> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(new Map<Promise<string | null>, Claim>());
  const [savedCoins, setSavedCoins] = useState(0);
  const [gold, setGold] = useState<number | null>(null);
  const [status, setStatus] = useState<RewardStatus>('idle');

  const startRun = useCallback(() => {
    setSavedCoins(0);
    setStatus('idle');
    const run: Promise<string | null> = Promise.resolve(supabase.rpc('start_tower_defense_run'))
      .then(({ data, error }) => {
        if (error) throw error;
        return data;
      })
      .catch((err) => {
        console.warn('Could not start a Tower Defense run:', err);
        if (runId.current === run) setStatus('error');
        return null;
      });
    runId.current = run;
  }, []);

  /** Reports the kills so far in the current run; `final` closes the run on the server. */
  const claim = useCallback((kills: number, final = false) => {
    const run = runId.current;
    if (!run) return;
    const prev = pending.current.get(run);
    pending.current.set(run, { kills: Math.max(kills, prev?.kills ?? 0), final: final || !!prev?.final });
    if (prev) return; // A send for this run is already queued and will pick up the latest values

    queue.current = queue.current.then(async () => {
      const id = await run;
      const next = pending.current.get(run);
      pending.current.delete(run);
      if (!id || !next) return;
      try {
        const { data, error } = await supabase.rpc('claim_tower_defense_coins', {
          p_run_id: id,
          p_kills: next.kills,
          p_final: next.final,
        });
        if (error) throw error;
        const result = data as { coins: number; gold: number };
        setGold(result.gold);
        if (runId.current === run) {
          setSavedCoins(result.coins);
          setStatus('ok');
        }
      } catch (err) {
        console.warn('Tower Defense reward claim failed:', err);
        if (runId.current === run) setStatus('error');
      }
    });
  }, []);

  return { startRun, claim, savedCoins, gold, status };
}
