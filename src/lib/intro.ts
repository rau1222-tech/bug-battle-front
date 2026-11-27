import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const META_KEY = 'intro_seen';
const storageKey = (userId: string) => `bug-battle.intro-seen.${userId}`;

/** The account metadata follows the user across devices; localStorage covers a failed metadata write. */
export function hasSeenIntro(user: User): boolean {
  if (user.user_metadata?.[META_KEY] === true) return true;
  try {
    return localStorage.getItem(storageKey(user.id)) === '1';
  } catch {
    return false;
  }
}

export async function markIntroSeen(user: User): Promise<void> {
  try {
    localStorage.setItem(storageKey(user.id), '1');
  } catch {
    // Storage unavailable: the metadata flag below still persists it
  }
  if (user.user_metadata?.[META_KEY] === true) return;
  const { error } = await supabase.auth.updateUser({ data: { [META_KEY]: true } });
  if (error) console.error('Saving intro flag in user metadata failed:', error);
}
