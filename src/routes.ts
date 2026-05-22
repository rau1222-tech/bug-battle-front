export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SETUP: '/setup',
  PLAY: '/play',
  DECKS: '/decks',
  DECK_NEW: '/decks/new',
  DECK_EDIT: '/decks/edit/:deckId',
  GACHA: '/gacha',
  CARD_CREATE: '/cards/create',
} as const;

export function deckEditPath(deckId: string) {
  return `/decks/edit/${deckId}`;
}
