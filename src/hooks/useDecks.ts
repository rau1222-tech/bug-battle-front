import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CARD_DEFINITIONS, DECK_SIZE, MAX_COPIES, type CardType } from '@/constants';

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
  consumibles: number;
}

export async function getActiveDeckId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('players')
    .select('active_deck_id')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data.active_deck_id;
}

export async function setActiveDeckId(userId: string | null | undefined, id: string | null) {
  if (!userId) return;
  const { data, error } = await supabase
    .from('players')
    .update({ active_deck_id: id })
    .eq('id', userId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No existe el jugador en la tabla players');
}

const LOCAL_TYPES = new Map<string, CardType>(CARD_DEFINITIONS.map((c) => [c.id, c.tipo]));

function summarize(
  d: { id: string; name: string; cover_emoji: string; is_preset: boolean; user_id: string | null },
  cards: DeckCardEntry[],
  typeOf: (cardId: string) => CardType | undefined = (id) => LOCAL_TYPES.get(id),
): DeckSummary {
  let progs = 0;
  let qas = 0;
  let consumibles = 0;
  let total = 0;
  for (const entry of cards) {
    const tipo = typeOf(entry.card_id);
    total += entry.quantity;
    if (tipo === 'programador') progs += entry.quantity;
    else if (tipo === 'qa') qas += entry.quantity;
    else if (tipo === 'consumible') consumibles += entry.quantity;
  }
  return { ...d, cards, total, programadores: progs, qas, consumibles };
}

const presetCards = (ids: string[]): DeckCardEntry[] => ids.map((card_id) => ({ card_id, quantity: 2 }));

/* Fallback presets when Supabase is unreachable; must match supabase/migrations/20261031140000_deck_builder_collection.sql */
const OFFLINE_PRESETS: DeckSummary[] = [
  summarize(
    { id: '00000000-0000-4000-8000-000000000001', name: 'Ataque Frontal', cover_emoji: '⚔️', is_preset: true, user_id: null },
    presetCards(['senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'junior-dev', 'intern', 'pr-aprobado', 'hotfix', 'qa-tester']),
  ),
  summarize(
    { id: '00000000-0000-4000-8000-000000000002', name: 'Defensa Total', cover_emoji: '🛡️', is_preset: true, user_id: null },
    presetCards(['qa-lead', 'qa-tester', 'senior-dev', 'architect', 'mid-dev', 'fullstack', 'devops', 'cafe-maquina', 'junior-dev', 'intern']),
  ),
  summarize(
    { id: '00000000-0000-4000-8000-000000000003', name: 'Equilibrio', cover_emoji: '⚖️', is_preset: true, user_id: null },
    presetCards(['senior-dev', 'mid-dev', 'junior-dev', 'fullstack', 'devops', 'architect', 'qa-tester', 'qa-lead', 'cafe-maquina', 'hotfix']),
  ),
  summarize(
    { id: '00000000-0000-4000-8000-000000000004', name: 'Prueba Consumibles', cover_emoji: '🧪', is_preset: true, user_id: null },
    presetCards(['cafe-maquina', 'pr-aprobado', 'hotfix', 'senior-dev', 'fullstack', 'qa-tester', 'qa-lead', 'mid-dev', 'junior-dev', 'devops']),
  ),
];


export function useDecks(userId: string | null | undefined) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    // Only the latest request may update state (userId can change while a fetch is in flight)
    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('decks')
        .select('id, name, cover_emoji, is_preset, user_id');
      query = userId ? query.or(`is_preset.eq.true,user_id.eq.${userId}`) : query.eq('is_preset', true);
      const { data: deckRows, error: dErr } = await query
        .order('is_preset', { ascending: false })
        .order('created_at', { ascending: true });

      if (dErr) {
        throw dErr;
      }
      if (isStale()) return;
      if (!deckRows || deckRows.length === 0) {
        setDecks(OFFLINE_PRESETS);
        return;
      }

      const ids = deckRows.map((d) => d.id);
      const { data: cardRows, error: cErr } = await supabase
        .from('deck_cards')
        .select('deck_id, card_id, quantity, cards(tipo)')
        .in('deck_id', ids);

      if (cErr) {
        throw cErr;
      }
      if (isStale()) return;

      const byDeck = new Map<string, DeckCardEntry[]>();
      const remoteTypes = new Map<string, CardType>();
      for (const row of cardRows ?? []) {
        const arr = byDeck.get(row.deck_id) ?? [];
        arr.push({ card_id: row.card_id, quantity: row.quantity });
        byDeck.set(row.deck_id, arr);
        if (row.cards?.tipo) remoteTypes.set(row.card_id, row.cards.tipo as CardType);
      }

      const typeOf = (id: string) => remoteTypes.get(id) ?? LOCAL_TYPES.get(id);
      const remoteDecks = deckRows.map((d) => summarize(d, byDeck.get(d.id) ?? [], typeOf));
      setDecks(remoteDecks);
    } catch (err: unknown) {
      if (isStale()) return;
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Error de conexión';
      console.warn('Supabase fetch failed, using offline presets:', msg);
      setError(msg);
      setDecks(OFFLINE_PRESETS);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { decks, loading, error, refresh };
}

/** Creates (deckId = null) or updates a deck atomically; the server validates size, copies and ownership. */
export async function saveDeckRecord(
  deckId: string | null,
  name: string,
  coverEmoji: string,
  cards: DeckCardEntry[],
): Promise<string> {
  const total = cards.reduce((acc, c) => acc + c.quantity, 0);
  if (total !== DECK_SIZE) throw new Error(`El mazo debe tener exactamente ${DECK_SIZE} cartas`);
  for (const c of cards) {
    if (c.quantity < 1 || c.quantity > MAX_COPIES) throw new Error(`Máximo ${MAX_COPIES} copias por carta`);
  }

  const { data, error } = await supabase.rpc('save_deck', {
    p_deck_id: deckId,
    p_name: name,
    p_cover_emoji: coverEmoji,
    p_cards: cards.map((c) => ({ card_id: c.card_id, quantity: c.quantity })),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDeckRecord(deckId: string) {
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  if (error) throw new Error(error.message);
}

export async function duplicateDeck(source: DeckSummary, newName?: string) {
  return saveDeckRecord(
    null,
    newName ?? `${source.name} (copia)`.slice(0, 40),
    source.cover_emoji,
    source.cards,
  );
}
