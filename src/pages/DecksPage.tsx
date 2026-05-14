import { useNavigate } from 'react-router-dom';
import DeckSelectorScreen from '@/components/decks/DeckSelectorScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { deckEditPath, ROUTES } from '@/routes';
import { useDecks, type DeckSummary } from '@/hooks/useDecks';

export default function DecksPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { decks } = useDecks(user.id);

  const launchGame = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck || deck.cards.length === 0) {
      return;
    }
    navigate(ROUTES.PLAY, { state: { composition: deck.cards } });
  };

  return (
    <DeckSelectorScreen
      onBack={() => navigate(ROUTES.HOME)}
      onPlay={launchGame}
      onCreate={() => navigate(ROUTES.DECK_NEW)}
      onEdit={(deck: DeckSummary) => navigate(deckEditPath(deck.id), { state: { deck } })}
    />
  );
}
