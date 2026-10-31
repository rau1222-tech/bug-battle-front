import { describe, expect, it } from 'vitest';
import { AVATAR_URL_MAX, validateAvatarUrl, validateDisplayName } from '@/lib/profile';

describe('validateDisplayName', () => {
  it('accepts names between 2 and 40 chars', () => {
    expect(validateDisplayName('  Ana ')).toBeNull();
  });

  it('rejects too short or too long names', () => {
    expect(validateDisplayName(' a ')).not.toBeNull();
    expect(validateDisplayName('x'.repeat(41))).not.toBeNull();
  });
});

describe('validateAvatarUrl', () => {
  it('allows empty value to remove the avatar', () => {
    expect(validateAvatarUrl('   ')).toBeNull();
  });

  it('accepts http(s) links', () => {
    expect(validateAvatarUrl('https://example.com/a.png')).toBeNull();
    expect(validateAvatarUrl('http://example.com/a.png')).toBeNull();
  });

  it('rejects invalid or non-http links', () => {
    expect(validateAvatarUrl('not a url')).not.toBeNull();
    expect(validateAvatarUrl('data:image/png;base64,AAAA')).not.toBeNull();
    expect(validateAvatarUrl('javascript:alert(1)')).not.toBeNull();
  });

  it('rejects links that are too long', () => {
    expect(validateAvatarUrl(`https://example.com/${'a'.repeat(AVATAR_URL_MAX)}`)).not.toBeNull();
  });
});
