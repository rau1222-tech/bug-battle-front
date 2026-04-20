import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

/**
 * Ensures there's always a Supabase session — signs in anonymously if none exists.
 * Anonymous users are still `authenticated` for RLS purposes.
 */
const AUTH_TIMEOUT_MS = 5000;

export function useAnonAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Supabase auth timed out — continuing without session');
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
    });

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          setUser(session.user);
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (error) {
          console.error('Anon sign-in failed:', error);
        }
        setUser(data.user ?? null);
      } catch (err) {
        console.error('Supabase auth error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
