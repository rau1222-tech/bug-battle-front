import { Navigate } from 'react-router-dom';
import AuthScreen from '@/components/auth/AuthScreen';
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

export default function LoginPage() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const { needsSetup, loading: profileLoading } = useProfile(user);

  if (authLoading || (user && profileLoading)) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to={needsSetup ? ROUTES.SETUP : ROUTES.HOME} replace />;
  }

  return (
    <AuthScreen
      onSignInEmail={async (email, password) => {
        const err = await signInWithEmail(email, password);
        return { error: err?.message ?? null };
      }}
      onSignUpEmail={async (email, password) => {
        const err = await signUpWithEmail(email, password);
        return { error: err?.message ?? null };
      }}
      onSignInGoogle={async () => {
        const err = await signInWithGoogle();
        return { error: err?.message ?? null };
      }}
    />
  );
}
