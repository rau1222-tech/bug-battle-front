import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthContext, type SetupOutletContext } from '@/contexts/AuthContext';
import { ROUTES } from '@/routes';
import { useI18n } from '@/i18n';

function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-cyan-300/50 font-display text-sm animate-pulse tracking-wider">{t('common.loading')}</div>
    </div>
  );
}

function ProfileErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="h-[100dvh] flex flex-col gap-3 items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-red-400 font-body text-sm">{t('auth.profileLoadError')}</div>
      <button
        onClick={onRetry}
        className="h-9 px-4 rounded-md border border-cyan-400/30 text-cyan-100 font-display text-xs tracking-wider"
      >
        {t('auth.retry')}
      </button>
    </div>
  );
}

/**
 * Single place where the post-login rule is applied, for every auth provider:
 * session → load player row → has hunter name ? app : setup.
 */
export default function AuthGuard() {
  const location = useLocation();
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    profile,
    needsSetup,
    loading: profileLoading,
    error: profileError,
    retry,
    createProfile,
    updateProfile,
  } = useProfile(user);

  if (authLoading || profileLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  }

  if (profileError) {
    return <ProfileErrorScreen onRetry={retry} />;
  }

  if (needsSetup || !profile) {
    if (location.pathname !== ROUTES.SETUP) {
      return <Navigate to={ROUTES.SETUP} replace />;
    }
    const setupContext: SetupOutletContext = { user, createProfile };
    return <Outlet context={setupContext} />;
  }

  if (location.pathname === ROUTES.SETUP) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return (
    <AuthContext.Provider value={{ user, profile, signOut, updateProfile }}>
      <Outlet />
    </AuthContext.Provider>
  );
}
