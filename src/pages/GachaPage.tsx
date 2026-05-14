import { useNavigate } from 'react-router-dom';
import GachaScreen from '@/components/gacha/GachaScreen';
import { ROUTES } from '@/routes';

export default function GachaPage() {
  const navigate = useNavigate();

  return <GachaScreen onBack={() => navigate(ROUTES.HOME)} />;
}
