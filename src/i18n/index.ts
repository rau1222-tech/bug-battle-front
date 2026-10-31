import { useMemo, useSyncExternalStore } from 'react';
import { formatGameMessage, type GameMessage } from '@/game/onlineEngine';
import type { Dictionary, Language, TranslateParams } from './types';
import { auth } from './messages/auth';
import { cards } from './messages/cards';
import { common } from './messages/common';
import { content } from './messages/content';
import { decks } from './messages/decks';
import { engine } from './messages/engine';
import { gacha } from './messages/gacha';
import { game } from './messages/game';
import { home } from './messages/home';
import { online } from './messages/online';

export type { Language, TranslateParams } from './types';

/** Every key is addressed as `namespace.key`, e.g. t('game.endTurn'). */
export const NAMESPACES = { auth, cards, common, content, decks, engine, gacha, game, home, online };

export const LANGUAGES: { code: Language; label: string; flag: string; locale: string }[] = [
  { code: 'es', label: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'en', label: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
];

const DEFAULT_LANGUAGE: Language = 'es';
const STORAGE_KEY = 'bug-battle.language';

function buildDictionary(lang: Language): Dictionary {
  const out: Dictionary = {};
  for (const [ns, messages] of Object.entries(NAMESPACES)) {
    for (const [key, value] of Object.entries(messages[lang])) out[`${ns}.${key}`] = value;
  }
  return out;
}

const DICTIONARIES: Record<Language, Dictionary> = {
  es: buildDictionary('es'),
  en: buildDictionary('en'),
  fr: buildDictionary('fr'),
};

const isLanguage = (v: unknown): v is Language => v === 'es' || v === 'en' || v === 'fr';

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, SSR): fall through
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2).toLowerCase() : '';
  return isLanguage(nav) ? nav : DEFAULT_LANGUAGE;
}

let current: Language = detectLanguage();
const listeners = new Set<() => void>();

function syncDocument() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
syncDocument();

export const getLanguage = (): Language => current;

export function setLanguage(lang: Language) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted; still applies for this session
  }
  syncDocument();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const localeOf = (lang: Language = current) => LANGUAGES.find((l) => l.code === lang)!.locale;

const interpolate = (text: string, params?: TranslateParams) =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (params[name] === undefined ? whole : String(params[name]))) : text;

/** Looks a key up in `lang`, falling back to Spanish and then to the key itself. */
export function translate(lang: Language, key: string, params?: TranslateParams): string {
  return interpolate(DICTIONARIES[lang][key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key, params);
}

export const hasTranslation = (lang: Language, key: string) => key in DICTIONARIES[lang];

/** Non-React translation using the current language (for hooks/libs that build messages). */
export const t = (key: string, params?: TranslateParams) => translate(current, key, params);

interface NamedCard {
  id: string;
  nombre: string;
  descripcion?: string;
}
interface NamedSkill {
  id: number;
  nombre: string;
  descripcion?: string;
}

function contentText(lang: Language, key: string, stored: string | undefined): string {
  // Spanish is the stored language, so DB edits win; other languages use the built-in translation when there is one
  if (lang !== DEFAULT_LANGUAGE && hasTranslation(lang, key)) return translate(lang, key);
  if (stored !== undefined && stored !== '') return stored;
  return hasTranslation(lang, key) ? translate(lang, key) : stored ?? '';
}

export function makeTranslator(lang: Language) {
  const tr = (key: string, params?: TranslateParams) => translate(lang, key, params);
  const cardName = (card: NamedCard) => contentText(lang, `content.card.${card.id}.name`, card.nombre);
  const cardDescription = (card: NamedCard) => contentText(lang, `content.card.${card.id}.desc`, card.descripcion);
  const skillName = (skill: NamedSkill) => contentText(lang, `content.skill.${skill.id}.name`, skill.nombre);
  const skillDescription = (skill: NamedSkill) => contentText(lang, `content.skill.${skill.id}.desc`, skill.descripcion);
  const cardNameById = (id: string, fallback?: string) => contentText(lang, `content.card.${id}.name`, fallback) || id;
  const skillNameById = (id: number, fallback?: string) => contentText(lang, `content.skill.${id}.name`, fallback) || String(id);
  const gameMessage = (msg: GameMessage) => formatGameMessage(msg, {
    template: (key) => (hasTranslation(lang, `engine.${key}`) || hasTranslation(DEFAULT_LANGUAGE, `engine.${key}`) ? translate(lang, `engine.${key}`) : undefined),
    cardName: (id) => cardNameById(id),
    skillName: (id) => skillNameById(id),
  });
  return {
    language: lang,
    locale: localeOf(lang),
    t: tr,
    cardName,
    cardDescription,
    skillName,
    skillDescription,
    cardNameById,
    skillNameById,
    /** Renders an engine log/error message in this language. */
    gameMessage,
    cardType: (tipo: string) => tr(`common.cardType.${tipo}`),
  };
}

export type Translator = ReturnType<typeof makeTranslator>;

const TRANSLATORS: Record<Language, Translator> = {
  es: makeTranslator('es'),
  en: makeTranslator('en'),
  fr: makeTranslator('fr'),
};

/** Translator for the current language (non-React code). */
export const translator = (): Translator => TRANSLATORS[current];

/** Current language plus translation helpers; re-renders when the language changes. */
export function useI18n() {
  const language = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return useMemo(() => ({ ...TRANSLATORS[language], setLanguage }), [language]);
}
