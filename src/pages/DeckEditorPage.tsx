import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import DeckBuilderScreen from '@/components/decks/DeckBuilderScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';
import { useDecks, type DeckSummary } from '@/hooks/useDecks';

function LoadingScreen() {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-cyan-300/50 font-display text-sm animate-pulse tracking-wider">Cargando...</div>
    </div>
  );
}

type DeckEditorLocationState = {
  deck?: DeckSummary;
};

export default function DeckEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { deckId } = useParams();
  const { user } = useAuthContext();
  const { decks, loading, refresh } = useDecks(user.id);

  const state = (location.state ?? null) as DeckEditorLocationState | null;
  const stateDeck = state?.deck ?? null;
  const editing = deckId
    ? (stateDeck?.id === deckId ? stateDeck : decks.find((deck) => deck.id === deckId) ?? null)
    : null;

  if (deckId && loading && !editing) {
    return <LoadingScreen />;
  }

  if (deckId && !loading && !editing) {
    return <Navigate to={ROUTES.DECKS} replace />;
  }

  return (
    <DeckBuilderScreen
      userId={user.id}
      editing={editing}
      onBack={() => navigate(ROUTES.DECKS)}
      onSaved={async () => {
        await refresh();
        navigate(ROUTES.DECKS, { replace: true });
      }}
    />
  );
}
