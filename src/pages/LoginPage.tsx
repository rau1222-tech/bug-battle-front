import { Navigate } from 'react-router-dom';
import AuthScreen from '@/components/auth/AuthScreen';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/routes';
import { translateAuthError } from '@/constants/authErrors';
import { useI18n } from '@/i18n';

function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="text-cyan-300/50 font-display text-sm animate-pulse tracking-wider">{t('common.loading')}</div>
    </div>
  );
}

export default function LoginPage() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  if (authLoading) {
    return <LoadingScreen />;
  }

  // AuthGuard decides between setup and the app once the player row is loaded.
  if (user) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return (
    <AuthScreen
      onSignInEmail={async (email, password) => {
        const err = await signInWithEmail(email, password);
        return { error: err ? translateAuthError(err.message) : null };
      }}
      onSignUpEmail={async (email, password) => {
        const err = await signUpWithEmail(email, password);
        return { error: err ? translateAuthError(err.message) : null };
      }}
      onSignInGoogle={async () => {
        const err = await signInWithGoogle();
        return { error: err ? translateAuthError(err.message) : null };
      }}
    />
  );
}
