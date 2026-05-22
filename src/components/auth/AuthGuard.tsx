import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';

function LoadingScreen() {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-cyan-300/50 font-display text-sm animate-pulse tracking-wider">Cargando...</div>
    </div>
  );
}

export default function AuthGuard() {
  const location = useLocation();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, needsSetup, loading: profileLoading } = useProfile(user);

  if (authLoading || (user && profileLoading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  }

  if (needsSetup && location.pathname !== ROUTES.SETUP) {
    return <Navigate to={ROUTES.SETUP} replace />;
  }

  if (!needsSetup && location.pathname === ROUTES.SETUP) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  const safeProfile = profile ?? {
    id: user.id,
    display_name: 'Jugador',
    avatar_url: null,
    gold: 300,
    wins: 0,
    losses: 0,
    active_deck_id: null,
    admin: false,
  };

  return (
    <AuthContext.Provider value={{ user, profile: safeProfile, signOut }}>
      <Outlet />
    </AuthContext.Provider>
  );
}
