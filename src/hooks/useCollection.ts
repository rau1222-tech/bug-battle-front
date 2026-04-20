import { useCallback, useEffect, useState } from 'react';
import { CARD_DEFINITIONS, type CardDefinition } from '@/constants/cards';

/** card_id → total copies owned */
export type Collection = Record<string, number>;

const STORAGE_KEY = 'bug-hunters-collection';
const COINS_KEY = 'bug-hunters-coins';

/** Starting coins for new players */
const INITIAL_COINS = 300;
/** Cost of one pack */
export const PACK_COST = 100;
/** Cards per pack */
export const CARDS_PER_PACK = 3;

/* ── Rarity tiers based on card power ── */
type Rarity = 'comun' | 'raro' | 'epico';

export function getRarity(def: CardDefinition): Rarity {
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

function pickRandomCard(): CardDefinition {
  // Build weighted pool
  const pool: CardDefinition[] = [];
  for (const def of CARD_DEFINITIONS) {
    const r = getRarity(def);
    const w = WEIGHT[r];
    for (let i = 0; i < w; i++) pool.push(def);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Open a pack → returns array of cards pulled */
export function openPack(): CardDefinition[] {
  const results: CardDefinition[] = [];
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    results.push(pickRandomCard());
  }
  return results;
}

/* ── Persistence helpers ── */
function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCollection(c: Collection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function loadCoins(): number {
  try {
    const raw = localStorage.getItem(COINS_KEY);
    if (raw === null) return INITIAL_COINS;
    return Number(raw);
  } catch {
    return INITIAL_COINS;
  }
}

function saveCoins(n: number) {
  localStorage.setItem(COINS_KEY, String(n));
}

/* ── Hook ── */
export function useCollection() {
  const [collection, setCollection] = useState<Collection>(loadCollection);
  const [coins, setCoins] = useState<number>(loadCoins);

  // Sync to localStorage on change
  useEffect(() => saveCollection(collection), [collection]);
  useEffect(() => saveCoins(coins), [coins]);

  const addCards = useCallback((cards: CardDefinition[]) => {
    setCollection((prev) => {
      const next = { ...prev };
      for (const card of cards) {
        next[card.id] = (next[card.id] ?? 0) + 1;
      }
      return next;
    });
  }, []);

  const spendCoins = useCallback((amount: number): boolean => {
    if (coins < amount) return false;
    setCoins((c) => c - amount);
    return true;
  }, [coins]);

  const earnCoins = useCallback((amount: number) => {
    setCoins((c) => c + amount);
  }, []);

  /** How many copies of a card the player owns */
  const owned = useCallback((cardId: string) => collection[cardId] ?? 0, [collection]);

  return { collection, coins, addCards, spendCoins, earnCoins, owned };
}
