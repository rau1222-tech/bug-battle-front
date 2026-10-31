export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;
export const AVATAR_URL_MAX = 2048;

export function validateDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < DISPLAY_NAME_MIN) return `El nombre debe tener al menos ${DISPLAY_NAME_MIN} caracteres`;
  if (name.length > DISPLAY_NAME_MAX) return `Máximo ${DISPLAY_NAME_MAX} caracteres`;
  return null;
}

/** Empty string is valid and means "remove avatar". */
export function validateAvatarUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > AVATAR_URL_MAX) return `La URL no puede superar ${AVATAR_URL_MAX} caracteres`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Introduce una URL válida (https://...)';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'La URL debe empezar por http:// o https://';
  return null;
}
