import { Navigate, useNavigate } from 'react-router-dom';
import PickNameScreen from '@/components/auth/PickNameScreen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { ROUTES } from '@/routes';

function LoadingScreen() {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-cyan-300/50 font-display text-sm animate-pulse tracking-wider">Cargando...</div>
    </div>
  );
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { needsSetup, loading: profileLoading, createProfile } = useProfile(user);

  if (authLoading || (user && profileLoading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (!needsSetup) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  const meta = user.user_metadata ?? {};
  const suggestedName = meta.full_name ?? meta.name ?? '';
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

  return (
    <PickNameScreen
      suggestedName={suggestedName}
      avatarUrl={avatarUrl}
      onConfirm={async (name) => {
        await createProfile(name);
        navigate(ROUTES.HOME, { replace: true });
      }}
    />
  );
}
