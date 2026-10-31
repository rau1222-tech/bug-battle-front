import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import { t } from '@/i18n';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  gold: number;
  wins: number;
  losses: number;
  active_deck_id: string | null;
  admin: boolean;
}

export type ProfileUpdate = Partial<Pick<Profile, 'display_name' | 'avatar_url'>>;

const CACHE_KEY = 'bb_profile_';

function getCachedProfile(uid: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + uid);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheProfile(p: Profile) {
  try { localStorage.setItem(CACHE_KEY + p.id, JSON.stringify(p)); } catch {}
}

export function clearCachedProfile(uid: string) {
  try { localStorage.removeItem(CACHE_KEY + uid); } catch { /* storage unavailable */ }
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url, gold, wins, losses, active_deck_id, admin';

interface ProfileState {
  /** User id this state was resolved for; null while nothing has been resolved yet. */
  userId: string | null;
  profile: Profile | null;
  error: boolean;
}

function hasHunterName(profile: Profile | null): profile is Profile {
  return !!profile?.display_name?.trim();
}

// Set only by the setup screen, so rows auto-created elsewhere (DB triggers, placeholders) still trigger setup.
function hasConfirmedHunterName(user: User | null): boolean {
  return typeof user?.user_metadata?.hunter_name === 'string' && user.user_metadata.hunter_name.trim() !== '';
}

export function useProfile(user: User | null) {
  const userId = user?.id ?? null;
  const [state, setState] = useState<ProfileState>({ userId: null, profile: null, error: false });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase
          .from('players')
          .select(PROFILE_COLUMNS)
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;

        // The DB is the source of truth: a missing row means the user has no hunter name yet.
        if (!error) {
          if (data) cacheProfile(data);
          else clearCachedProfile(userId);
          setState({ userId, profile: data, error: false });
          return;
        }

        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;
        }
      }

      // Network/server error: fall back to cache, never to setup (it would overwrite real data).
      const cached = getCachedProfile(userId);
      setState({ userId, profile: cached, error: !cached });
    })();

    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  // Derived from the user id so a stale result from a previous user/null session is never used.
  const resolved = userId !== null && state.userId === userId;
  const loading = userId !== null && !resolved;
  const profile = resolved ? state.profile : null;
  const error = resolved && state.error;
  const needsSetup = resolved && !error && (!hasHunterName(profile) || !hasConfirmedHunterName(user));

  const retry = useCallback(() => {
    setState({ userId: null, profile: null, error: false });
    setReloadKey((k) => k + 1);
  }, []);

  const createProfile = useCallback(async (displayName: string) => {
    if (!user) throw new Error('No authenticated user');
    const meta = user.user_metadata ?? {};
    const avatarUrl: string | null = meta.avatar_url ?? meta.picture ?? null;

    // Only name/avatar are sent so an existing row keeps its gold/wins/losses (DB defaults apply on insert).
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { id: user.id, display_name: displayName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) },
        { onConflict: 'id' },
      )
      .select(PROFILE_COLUMNS)
      .single();

    if (error || !data) {
      console.error('Profile upsert failed:', error);
      throw error ?? new Error('Profile upsert returned no data');
    }

    // Emits USER_UPDATED, so useAuth's user (and thus needsSetup) refreshes with the new metadata.
    const { error: metaError } = await supabase.auth.updateUser({ data: { hunter_name: displayName } });
    if (metaError) {
      console.error('Saving hunter name in user metadata failed:', metaError);
      throw metaError;
    }

    cacheProfile(data);
    setState({ userId: user.id, profile: data, error: false });
  }, [user]);

  const updateProfile = useCallback(async (changes: ProfileUpdate) => {
    if (!user) throw new Error(t('auth.errors.noSession'));
    const { data, error } = await supabase
      .from('players')
      .update(changes)
      .eq('id', user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    cacheProfile(data);
    setState({ userId: user.id, profile: data, error: false });
    return data;
  }, [user]);

  return { profile, loading, needsSetup, error, retry, createProfile, updateProfile };
}
