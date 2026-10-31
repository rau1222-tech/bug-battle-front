const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'invalid login credentials': 'Correo o contraseña incorrectos',
  'email not confirmed': 'Debes confirmar tu email antes de iniciar sesión',
  'user already registered': 'Ya existe una cuenta con este correo',
  'password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  'unable to validate email address: invalid format': 'El formato del correo electrónico no es válido',
  'signup requires a valid password': 'Debes introducir una contraseña válida',
  'email rate limit exceeded': 'Demasiados intentos. Espera unos minutos',
  'for security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes hacer esto una vez cada 60 segundos',
};

const AUTH_ERROR_VALUES = new Set(Object.values(AUTH_ERROR_MESSAGES));
const DEFAULT_AUTH_ERROR = 'Ha ocurrido un error. Inténtalo de nuevo.';

export function translateAuthError(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (AUTH_ERROR_VALUES.has(message.trim())) {
    return message.trim();
  }

  for (const [key, value] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return DEFAULT_AUTH_ERROR;
}
