import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const updateUser = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { updateUser } } }));

const { hasSeenIntro, markIntroSeen } = await import('@/lib/intro');

const makeUser = (meta: Record<string, unknown> = {}) => ({ id: 'u1', user_metadata: meta }) as unknown as User;

describe('intro flag', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    updateUser.mockClear();
  });

  it('is unseen for a brand new user', () => {
    expect(hasSeenIntro(makeUser())).toBe(false);
  });

  it('is seen when the account metadata says so', () => {
    expect(hasSeenIntro(makeUser({ intro_seen: true }))).toBe(true);
  });

  it('marking it persists locally and in the account metadata', async () => {
    const user = makeUser();
    await markIntroSeen(user);
    expect(hasSeenIntro(user)).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ data: { intro_seen: true } });
  });

  it('does not rewrite metadata that is already set', async () => {
    await markIntroSeen(makeUser({ intro_seen: true }));
    expect(updateUser).not.toHaveBeenCalled();
  });
});
