import { LANGUAGES, t, translate } from '@/i18n';

const AUTH_ERROR_KEYS: Record<string, string> = {
  'invalid login credentials': 'auth.errors.invalidCredentials',
  'email not confirmed': 'auth.errors.emailNotConfirmed',
  'user already registered': 'auth.errors.userExists',
  'password should be at least 6 characters': 'auth.errors.passwordTooShort',
  'unable to validate email address: invalid format': 'auth.errors.invalidEmail',
  'signup requires a valid password': 'auth.errors.invalidPassword',
  'email rate limit exceeded': 'auth.errors.rateLimit',
  'for security purposes, you can only request this once every 60 seconds': 'auth.errors.securityWait',
};

const DEFAULT_AUTH_ERROR_KEY = 'auth.errors.generic';
const ALL_AUTH_ERROR_KEYS = [...Object.values(AUTH_ERROR_KEYS), DEFAULT_AUTH_ERROR_KEY];

// Matches messages that were already translated (in any language) so the function is idempotent.
function findTranslatedKey(message: string): string | undefined {
  return ALL_AUTH_ERROR_KEYS.find((key) => LANGUAGES.some(({ code }) => translate(code, key) === message));
}

export function translateAuthError(message: string): string {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();

  const translatedKey = findTranslatedKey(trimmed);
  if (translatedKey) {
    return t(translatedKey);
  }

  for (const [key, value] of Object.entries(AUTH_ERROR_KEYS)) {
    if (normalized.includes(key)) {
      return t(value);
    }
  }

  return t(DEFAULT_AUTH_ERROR_KEY);
}
