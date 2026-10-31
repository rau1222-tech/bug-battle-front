import { useCallback, useEffect, useState } from 'react';
import type { CardTemplate } from '@/constants';
import { supabase } from '@/integrations/supabase/client';

/** card_id → total copies owned */
export type Collection = Record<string, number>;

/** Must match public.open_pack() in the DB */
export const PACK_COST = 100;
export const CARDS_PER_PACK = 3;

export type Rarity = 'comun' | 'raro' | 'epico';

export function getRarity(def: CardTemplate): Rarity {
  if (def.gachaPeso !== undefined) {
    if (def.gachaPeso <= 10) return 'epico';
    if (def.gachaPeso <= 30) return 'raro';
    return 'comun';
  }
  const potencia = def.potencia ?? 0;
  if (potencia >= 3) return 'epico';
  if (potencia >= 2) return 'raro';
  return 'comun';
}

export const RARITY_COLORS: Record<Rarity, string> = {
  comun: 'text-stone-300 border-stone-500/40',
  raro: 'text-blue-300 border-blue-500/50',
  epico: 'text-purple-300 border-purple-500/50',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  comun: 'Común',
  raro: 'Raro',
  epico: 'Épico',
};

export const RARITY_GLOW: Record<Rarity, string> = {
  comun: '',
  raro: 'shadow-blue-500/30',
  epico: 'shadow-purple-500/40',
};

/* ── Hook ── */
export function useCollection(userId: string | null | undefined) {
  const [collection, setCollection] = useState<Collection>({});
  const [coins, setCoins] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setCollection({});
      setCoins(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [{ data: playerData, error: playerErr }, { data: collectionData, error: collectionErr }] = await Promise.all([
          supabase.from('players').select('gold').eq('id', userId).single(),
          supabase.from('player_collection').select('card_id, quantity').eq('player_id', userId),
        ]);

        if (playerErr) throw new Error(playerErr.message);
        if (collectionErr) throw new Error(collectionErr.message);

        const nextCollection: Collection = {};
        for (const row of collectionData ?? []) {
          if (row.quantity > 0) nextCollection[row.card_id] = row.quantity;
        }

        if (!cancelled) {
          setCollection(nextCollection);
          setCoins(playerData?.gold ?? 0);
        }
      } catch (err) {
        console.error('Failed to load collection:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la colección');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Spends coins and stores the pulled cards atomically on the server; returns pulled card ids. */
  const buyPack = useCallback(async (): Promise<string[]> => {
    const { data, error: rpcErr } = await supabase.rpc('open_pack');
    if (rpcErr) throw new Error(rpcErr.message);
    const result = data as { gold: number; cards: string[] };
    setCoins(result.gold);
    setCollection((prev) => {
      const next = { ...prev };
      for (const id of result.cards) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    return result.cards;
  }, []);

  return { collection, coins, loading, error, refresh, buyPack };
}
