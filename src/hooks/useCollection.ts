import { useCallback, useEffect, useState } from 'react';
import type { CardTemplate } from '@/constants';
import { supabase } from '@/integrations/supabase/client';
import { t } from '@/i18n';

/** card_id → total copies owned */
export type Collection = Record<string, number>;

/** Must match the limit enforced by public.open_banner_pack() and player_collection_quantity_max_check. */
export const MAX_COPIES_PER_CARD = 2;

/** One drawn card: duplicates beyond MAX_COPIES_PER_CARD are converted into `oro` by the server. */
export interface PackPull {
  cardId: string;
  repetida: boolean;
  oro: number;
}

export type Rarity = 'comun' | 'raro' | 'epico' | 'legendario';

/**
 * Gacha weight stored in cards.gacha_peso for each rarity; must stay consistent with getRarity thresholds
 * and with public.card_rarity() in the DB.
 */
export const RARITY_GACHA_WEIGHT: Record<Rarity, number> = {
  comun: 60,
  raro: 30,
  epico: 10,
  legendario: 5,
};

export function getRarity(def: CardTemplate): Rarity {
  if (def.gachaPeso !== undefined) {
    if (def.gachaPeso <= 5) return 'legendario';
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
  legendario: 'text-yellow-300 border-yellow-400/60',
};

const RARITIES: Rarity[] = ['comun', 'raro', 'epico', 'legendario'];

/** Translated on every read so labels follow the current language. */
export const RARITY_LABELS = Object.defineProperties(
  {} as Record<Rarity, string>,
  Object.fromEntries(
    RARITIES.map((r) => [r, { enumerable: true, get: () => t(`common.rarity.${r}`) }]),
  ),
) as Readonly<Record<Rarity, string>>;

export const RARITY_GLOW: Record<Rarity, string> = {
  comun: '',
  raro: 'shadow-blue-500/30',
  epico: 'shadow-purple-500/40',
  legendario: 'shadow-yellow-400/50',
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
        if (!cancelled) setError(err instanceof Error ? err.message : t('decks.collectionLoadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /**
   * Opens a pack from the given banner. The server checks the banner is active, charges its cost,
   * draws the cards by appearance weight and stores them atomically. Cards already owned at the copy
   * limit are converted into gold by the server instead of being added.
   */
  const buyPack = useCallback(async (bannerId: string): Promise<PackPull[]> => {
    const { data, error: rpcErr } = await supabase.rpc('open_banner_pack', { p_banner_id: bannerId });
    if (rpcErr) throw new Error(rpcErr.message);
    const result = data as {
      gold: number;
      results?: { card_id: string; repetida: boolean; oro: number }[];
      cards?: string[];
    };
    // Older versions of open_banner_pack only return `cards` (no duplicate conversion): every card was added.
    const pulls: PackPull[] = result.results
      ? result.results.map((r) => ({ cardId: r.card_id, repetida: r.repetida, oro: r.oro }))
      : (result.cards ?? []).map((cardId) => ({ cardId, repetida: false, oro: 0 }));
    setCoins(result.gold);
    setCollection((prev) => {
      const next = { ...prev };
      for (const p of pulls) {
        if (!p.repetida) next[p.cardId] = (next[p.cardId] ?? 0) + 1;
      }
      return next;
    });
    return pulls;
  }, []);

  return { collection, coins, loading, error, refresh, buyPack };
}
