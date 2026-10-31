import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Profile, ProfileUpdate } from '@/hooks/useProfile';

export interface AuthContextValue {
  user: User;
  profile: Profile;
  signOut: () => Promise<void>;
  updateProfile: (changes: ProfileUpdate) => Promise<Profile>;
}

/** Passed by AuthGuard to the setup route via <Outlet context>. */
export interface SetupOutletContext {
  user: User;
  createProfile: (displayName: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside AuthGuard');
  }
  return ctx;
}
