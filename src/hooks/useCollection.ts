import { useCallback, useEffect, useState } from 'react';
import { CARD_DEFINITIONS, type CardTemplate } from '@/constants';
import { supabase } from '@/integrations/supabase/client';

/** card_id → total copies owned */
export type Collection = Record<string, number>;

/** Starting coins for new players */
const INITIAL_COINS = 300;
/** Cost of one pack */
export const PACK_COST = 100;
/** Cards per pack */
export const CARDS_PER_PACK = 3;

/* ── Rarity tiers based on card power ── */
type Rarity = 'comun' | 'raro' | 'epico';

export function getRarity(def: CardTemplate): Rarity {
  if (def.potencia >= 3) return 'epico';
  if (def.potencia >= 2) return 'raro';
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

/* ── Weight table (higher = more likely) ── */
const WEIGHT: Record<Rarity, number> = { comun: 60, raro: 30, epico: 10 };

function pickRandomCard(
  cards: CardTemplate[],
  getWeight?: (card: CardTemplate) => number,
): CardTemplate {
  // Build weighted pool
  const pool: CardTemplate[] = [];
  for (const def of cards) {
    const r = getRarity(def);
    const defaultWeight = WEIGHT[r];
    const w = Math.max(1, getWeight ? getWeight(def) : defaultWeight);
    for (let i = 0; i < w; i++) pool.push(def);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Open a pack → returns array of cards pulled */
export function openPack(
  cards: CardTemplate[] = CARD_DEFINITIONS,
  getWeight?: (card: CardTemplate) => number,
): CardTemplate[] {
  const results: CardTemplate[] = [];
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    results.push(pickRandomCard(cards, getWeight));
  }
  return results;
}

async function ensurePlayerRow(userId: string) {
  const { error } = await supabase
    .from('players')
    .upsert({ id: userId, display_name: 'Jugador', gold: INITIAL_COINS, wins: 0, losses: 0 });
  if (error) throw new Error(error.message);
}

/* ── Hook ── */
export function useCollection(userId: string | null | undefined) {
  const [collection, setCollection] = useState<Collection>({});
  const [coins, setCoins] = useState<number>(INITIAL_COINS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setCollection({});
      setCoins(INITIAL_COINS);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        await ensurePlayerRow(userId);

        const [{ data: playerData, error: playerErr }, { data: collectionData, error: collectionErr }] = await Promise.all([
          supabase.from('players').select('gold').eq('id', userId).single(),
          supabase.from('player_collection').select('card_id, quantity').eq('player_id', userId),
        ]);

        if (playerErr) throw new Error(playerErr.message);
        if (collectionErr) throw new Error(collectionErr.message);

        const nextCollection: Collection = {};
        for (const row of collectionData ?? []) {
          nextCollection[row.card_id] = row.quantity;
        }

        if (!cancelled) {
          setCollection(nextCollection);
          setCoins(playerData?.gold ?? INITIAL_COINS);
        }
      } catch (err) {
        console.error('Failed to load collection:', err);
        if (!cancelled) {
          setCollection({});
          setCoins(INITIAL_COINS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addCards = useCallback(async (cards: CardTemplate[]) => {
    if (!userId || cards.length === 0) return;

    const increments = cards.reduce<Record<string, number>>((acc, card) => {
      acc[card.id] = (acc[card.id] ?? 0) + 1;
      return acc;
    }, {});

    const cardIds = Object.keys(increments);
    const { data: existingRows, error: readErr } = await supabase
      .from('player_collection')
      .select('card_id, quantity')
      .eq('player_id', userId)
      .in('card_id', cardIds);
    if (readErr) throw new Error(readErr.message);

    const existingMap = new Map((existingRows ?? []).map((row) => [row.card_id, row.quantity]));
    const rows = cardIds.map((cardId) => ({
      player_id: userId,
      card_id: cardId,
      quantity: (existingMap.get(cardId) ?? 0) + increments[cardId],
    }));

    const { error: upsertErr } = await supabase
      .from('player_collection')
      .upsert(rows, { onConflict: 'player_id,card_id' });
    if (upsertErr) throw new Error(upsertErr.message);

    setCollection((prev) => {
      const next = { ...prev };
      for (const card of cards) {
        next[card.id] = (next[card.id] ?? 0) + 1;
      }
      return next;
    });
  }, [userId]);

  const spendCoins = useCallback(async (amount: number): Promise<boolean> => {
    if (!userId) return false;
    if (coins < amount) return false;

    const next = coins - amount;
    const { error } = await supabase
      .from('players')
      .update({ gold: next })
      .eq('id', userId);
    if (error) return false;

    setCoins(next);
    return true;
  }, [coins, userId]);

  const earnCoins = useCallback(async (amount: number) => {
    if (!userId) return;
    const next = coins + amount;
    const { error } = await supabase
      .from('players')
      .update({ gold: next })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    setCoins(next);
  }, [coins, userId]);

  /** How many copies of a card the player owns */
  const owned = useCallback((cardId: string) => collection[cardId] ?? 0, [collection]);

  return { collection, coins, loading, addCards, spendCoins, earnCoins, owned };
}
