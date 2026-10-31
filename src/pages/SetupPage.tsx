import { useOutletContext } from 'react-router-dom';
import PickNameScreen from '@/components/auth/PickNameScreen';
import type { SetupOutletContext } from '@/contexts/AuthContext';

// Rendered only by AuthGuard when the user has no hunter name; once saved, the guard redirects home.
export default function SetupPage() {
  const { user, createProfile } = useOutletContext<SetupOutletContext>();

  const meta = user.user_metadata ?? {};
  const suggestedName = meta.full_name ?? meta.name ?? '';
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

  return (
    <PickNameScreen
      suggestedName={suggestedName}
      avatarUrl={avatarUrl}
      onConfirm={createProfile}
    />
  );
}
