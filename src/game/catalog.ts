import { CARD_DEFINITIONS, type CardTemplate } from '@/constants';
import { isPlayableCard, type CardCatalog, type CardRule } from './onlineEngine';

/** Engine catalog from client card templates (rules only, no art), skipping cards the engine can't play. */
export function toCardCatalog(templates: CardTemplate[]): CardCatalog {
  const catalog: CardCatalog = {};
  for (const { image: _i, audio: _a, gachaPeso: _g, ...rule } of templates) {
    if (isPlayableCard(rule as CardRule)) catalog[rule.id] = rule as CardRule;
  }
  return catalog;
}

/** Built-in cards: offline fallback when the database can't be reached, and fixtures for tests and the simulator. */
export const BUILTIN_CARDS: CardCatalog = toCardCatalog(CARD_DEFINITIONS);
