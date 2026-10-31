import { Navigate, useNavigate } from 'react-router-dom';
import CardCreatorScreen from '@/components/cards/CardCreatorScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';

export default function CardCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuthContext();

  if (!profile.admin) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <CardCreatorScreen onBack={() => navigate(ROUTES.HOME)} />;
}
