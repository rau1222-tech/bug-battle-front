import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import GameBoard from '@/components/game/GameBoard';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';

type DeckComposition = { card_id: string; quantity: number }[];

type PlayLocationState = {
  composition?: DeckComposition;
};

export default function PlayPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuthContext();

  const state = (location.state ?? null) as PlayLocationState | null;
  const composition = state?.composition;

  if (!composition || composition.length === 0) {
    return <Navigate to={ROUTES.DECKS} replace />;
  }

  return (
    <GameBoard
      deckComposition={composition}
      playerName={profile.display_name}
      onExit={() => navigate(ROUTES.HOME)}
    />
  );
}
