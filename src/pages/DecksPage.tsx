import { useNavigate } from 'react-router-dom';
import DeckSelectorScreen from '@/components/decks/DeckSelectorScreen';
import { deckEditPath, ROUTES } from '@/routes';
import type { DeckSummary } from '@/hooks/useDecks';

export default function DecksPage() {
  const navigate = useNavigate();

  const launchGame = (deck: DeckSummary) => {
    if (deck.cards.length === 0) {
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
