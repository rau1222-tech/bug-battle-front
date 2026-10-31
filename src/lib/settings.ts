import { useSyncExternalStore } from 'react';

export const THEMES = [
  { id: 'cyan', swatch: '#22d3ee' },
  { id: 'lime', swatch: '#a3e635' },
  { id: 'violet', swatch: '#a78bfa' },
  { id: 'amber', swatch: '#fbbf24' },
  { id: 'rose', swatch: '#fb7185' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export interface Settings {
  theme: ThemeId;
  soundEnabled: boolean;
  /** 0..1 */
  volume: number;
  reduceMotion: boolean;
}

const STORAGE_KEY = 'bug-battle.settings';
const DEFAULTS: Settings = { theme: 'cyan', soundEnabled: true, volume: 0.8, reduceMotion: false };

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      theme: isTheme(raw.theme) ? raw.theme : DEFAULTS.theme,
      soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULTS.soundEnabled,
      volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume,
      reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : DEFAULTS.reduceMotion,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

function syncDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = current.theme;
  document.documentElement.dataset.reduceMotion = String(current.reduceMotion);
}
syncDocument();

export const getSettings = (): Settings => current;

export function updateSettings(changes: Partial<Settings>) {
  current = { ...current, ...changes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
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

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
