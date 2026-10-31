import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Records a vs-bot result server-side; resolves to the gold awarded (daily-capped), or null if not recorded. */
export function useGameStats(userId: string | null | undefined) {
  const recordResult = useCallback(async (result: 'win' | 'loss'): Promise<number | null> => {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('record_bot_result', { p_won: result === 'win' });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }, [userId]);

  return { recordResult };
}
