import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useGameStats(userId: string | null | undefined) {
  const recordResult = useCallback(async (result: 'win' | 'loss' | 'draw') => {
    if (!userId || result === 'draw') return;

    const { data, error } = await supabase
      .from('players')
      .select('wins, losses')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);

    const wins = data?.wins ?? 0;
    const losses = data?.losses ?? 0;

    const { error: updateError } = await supabase
      .from('players')
      .update({
        wins: result === 'win' ? wins + 1 : wins,
        losses: result === 'loss' ? losses + 1 : losses,
      })
      .eq('id', userId);

    if (updateError) throw new Error(updateError.message);
  }, [userId]);

  return { recordResult };
}
