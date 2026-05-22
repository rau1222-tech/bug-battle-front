import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

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

export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfile(null);
      setNeedsSetup(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    (async () => {
      // Try fetching up to 2 times (covers the redirect-back timing issue)
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase
          .from('players')
          .select('id, display_name, avatar_url, gold, wins, losses, active_deck_id, admin')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        if (data) {
          setProfile(data);
          cacheProfile(data);
          setNeedsSetup(false);
          setLoading(false);
          return;
        }

        // If error is not "row not found", retry once after a short delay
        if (error && error.code !== 'PGRST116' && attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;
          continue;
        }
        break;
      }

      // No profile found in DB — check local cache before prompting
      if (!cancelled) {
        const cached = getCachedProfile(user.id);
        if (cached) {
          setProfile(cached);
          setNeedsSetup(false);
        } else {
          setProfile(null);
          setNeedsSetup(true);
        }
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  const createProfile = useCallback(async (displayName: string) => {
    if (!user) return;
    const meta = user.user_metadata ?? {};
    const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

    const { data: created, error } = await supabase
      .from('players')
      .upsert({
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
        gold: 300,
        wins: 0,
        losses: 0,
        admin: false,
      })
      .select('id, display_name, avatar_url, gold, wins, losses, active_deck_id, admin')
      .single();

    const final: Profile = created ?? {
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      gold: 300,
      wins: 0,
      losses: 0,
      active_deck_id: null,
      admin: false,
    };

    if (error) {
      console.error('Profile upsert failed:', error);
      const { data: retry } = await supabase
        .from('players')
        .select('id, display_name, avatar_url, gold, wins, losses, active_deck_id, admin')
        .eq('id', user.id)
        .single();
      if (retry) {
        setProfile(retry);
        cacheProfile(retry);
      } else {
        setProfile(final);
        cacheProfile(final);
      }
    } else {
      setProfile(final);
      cacheProfile(final);
    }
    setNeedsSetup(false);
  }, [user?.id]);

  const updateName = useCallback(async (newName: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('players')
      .update({ display_name: newName })
      .eq('id', user.id);
    if (!error) setProfile((p) => p ? { ...p, display_name: newName } : p);
    return error;
  }, [user?.id]);

  return { profile, loading, needsSetup, createProfile, updateName };
}
