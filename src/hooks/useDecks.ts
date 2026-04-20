import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CARD_DEFINITIONS, DECK_SIZE } from '@/constants/cards';

export interface DeckCardEntry {
  card_id: string;
  quantity: number;
}

export interface DeckSummary {
  id: string;
  name: string;
  cover_emoji: string;
  is_preset: boolean;
  user_id: string | null;
  cards: DeckCardEntry[];
  total: number;
  programadores: number;
  qas: number;
}

const ACTIVE_DECK_KEY = 'bug-hunters-active-deck';

export function getActiveDeckId(): string | null {
  return localStorage.getItem(ACTIVE_DECK_KEY);
}
export function setActiveDeckId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_DECK_KEY, id);
  else localStorage.removeItem(ACTIVE_DECK_KEY);
}

function summarize(
  d: { id: string; name: string; cover_emoji: string; is_preset: boolean; user_id: string | null },
  cards: DeckCardEntry[],
): DeckSummary {
  const defMap = new Map(CARD_DEFINITIONS.map((c) => [c.id, c]));
  let progs = 0;
  let qas = 0;
  let total = 0;
  for (const entry of cards) {
    const def = defMap.get(entry.card_id);
    total += entry.quantity;
    if (def?.tipo === 'programador') progs += entry.quantity;
    else if (def?.tipo === 'qa') qas += entry.quantity;
  }
  return { ...d, cards, total, programadores: progs, qas };
}

/* Fallback presets when Supabase is unreachable */
const OFFLINE_PRESETS: DeckSummary[] = [
  summarize(
    { id: 'offline-ataque', name: 'Ataque Frontal', cover_emoji: '⚔️', is_preset: true, user_id: null },
    [
      { card_id: 'senior-dev', quantity: 4 }, { card_id: 'architect', quantity: 4 },
      { card_id: 'mid-dev', quantity: 3 }, { card_id: 'fullstack', quantity: 3 },
      { card_id: 'devops', quantity: 2 }, { card_id: 'junior-dev', quantity: 2 },
      { card_id: 'qa-tester', quantity: 2 },
    ],
  ),
  summarize(
    { id: 'offline-defensa', name: 'Defensa Total', cover_emoji: '🛡️', is_preset: true, user_id: null },
    [
      { card_id: 'qa-lead', quantity: 4 }, { card_id: 'qa-tester', quantity: 4 },
      { card_id: 'senior-dev', quantity: 3 }, { card_id: 'architect', quantity: 3 },
      { card_id: 'mid-dev', quantity: 2 }, { card_id: 'fullstack', quantity: 2 },
      { card_id: 'devops', quantity: 2 },
    ],
  ),
  summarize(
    { id: 'offline-equilibrio', name: 'Equilibrio', cover_emoji: '⚖️', is_preset: true, user_id: null },
    [
      { card_id: 'senior-dev', quantity: 3 }, { card_id: 'mid-dev', quantity: 3 },
      { card_id: 'junior-dev', quantity: 3 }, { card_id: 'fullstack', quantity: 3 },
      { card_id: 'devops', quantity: 2 }, { card_id: 'architect', quantity: 2 },
      { card_id: 'qa-tester', quantity: 2 }, { card_id: 'qa-lead', quantity: 2 },
    ],
  ),
];

export function useDecks(userId: string | null | undefined) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: deckRows, error: dErr } = await supabase
        .from('decks')
        .select('id, name, cover_emoji, is_preset, user_id')
        .order('is_preset', { ascending: false })
        .order('created_at', { ascending: true });

      if (dErr) {
        throw dErr;
      }
      if (!deckRows || deckRows.length === 0) {
        setDecks(OFFLINE_PRESETS);
        setLoading(false);
        return;
      }

      const ids = deckRows.map((d) => d.id);
      const { data: cardRows, error: cErr } = await supabase
        .from('deck_cards')
        .select('deck_id, card_id, quantity')
        .in('deck_id', ids);

      if (cErr) {
        throw cErr;
      }

      const byDeck = new Map<string, DeckCardEntry[]>();
      for (const row of cardRows ?? []) {
        const arr = byDeck.get(row.deck_id) ?? [];
        arr.push({ card_id: row.card_id, quantity: row.quantity });
        byDeck.set(row.deck_id, arr);
      }

      setDecks(deckRows.map((d) => summarize(d, byDeck.get(d.id) ?? [])));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Error de conexión';
      console.warn('Supabase fetch failed, using offline presets:', msg);
      setError(msg);
      setDecks(OFFLINE_PRESETS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, userId]);

  return { decks, loading, error, refresh };
}

export async function createDeckRecord(
  userId: string,
  name: string,
  coverEmoji: string,
  cards: DeckCardEntry[],
) {
  const total = cards.reduce((acc, c) => acc + c.quantity, 0);
  if (total !== DECK_SIZE) throw new Error(`El mazo debe tener exactamente ${DECK_SIZE} cartas`);
  for (const c of cards) {
    if (c.quantity < 1 || c.quantity > 2) throw new Error('Máximo 2 copias por carta');
  }

  const { data: deck, error: dErr } = await supabase
    .from('decks')
    .insert({ user_id: userId, name, cover_emoji: coverEmoji, is_preset: false })
    .select()
    .single();
  if (dErr || !deck) throw new Error(dErr?.message ?? 'No se pudo crear el mazo');

  const { error: cErr } = await supabase
    .from('deck_cards')
    .insert(cards.map((c) => ({ deck_id: deck.id, card_id: c.card_id, quantity: c.quantity })));
  if (cErr) {
    await supabase.from('decks').delete().eq('id', deck.id);
    throw new Error(cErr.message);
  }
  return deck;
}

export async function updateDeckRecord(
  deckId: string,
  name: string,
  coverEmoji: string,
  cards: DeckCardEntry[],
) {
  const total = cards.reduce((acc, c) => acc + c.quantity, 0);
  if (total !== DECK_SIZE) throw new Error(`El mazo debe tener exactamente ${DECK_SIZE} cartas`);
  for (const c of cards) {
    if (c.quantity < 1 || c.quantity > 2) throw new Error('Máximo 2 copias por carta');
  }

  const { error: dErr } = await supabase
    .from('decks')
    .update({ name, cover_emoji: coverEmoji })
    .eq('id', deckId);
  if (dErr) throw new Error(dErr.message);

  const { error: delErr } = await supabase.from('deck_cards').delete().eq('deck_id', deckId);
  if (delErr) throw new Error(delErr.message);

  const { error: insErr } = await supabase
    .from('deck_cards')
    .insert(cards.map((c) => ({ deck_id: deckId, card_id: c.card_id, quantity: c.quantity })));
  if (insErr) throw new Error(insErr.message);
}

export async function deleteDeckRecord(deckId: string) {
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  if (error) throw new Error(error.message);
}

export async function duplicateDeck(source: DeckSummary, userId: string, newName?: string) {
  return createDeckRecord(
    userId,
    newName ?? `${source.name} (copia)`,
    source.cover_emoji,
    source.cards,
  );
}
