import { t } from '@/i18n';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;
export const AVATAR_URL_MAX = 2048;

export function validateDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < DISPLAY_NAME_MIN)   return t('auth.nameTooShort', { min: DISPLAY_NAME_MIN });
    if (name.length > DISPLAY_NAME_MAX) return t('auth.nameTooLong', { max: DISPLAY_NAME_MAX });
  return null;
}

/** Empty string is valid and means "remove avatar". */
export function validateAvatarUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > AVATAR_URL_MAX) return t('auth.avatarUrlTooLong', { max: AVATAR_URL_MAX });
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return t('auth.avatarUrlInvalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return t('auth.avatarUrlProtocol');
  return null;
}
