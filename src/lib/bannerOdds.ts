/** Pure banner odds (no imports), shared by the gacha screen and the local AI banner chat. */

export interface WeightedCard {
  cardId: string;
  /** Relative weight used ONLY to draw this card inside the banner. */
  pesoAparicion: number;
}

/** Probability (0..1) of each card per draw, proportional to its weight; weights need not add up to 100. */
export function appearanceProbabilities(cards: WeightedCard[]): Record<string, number> {
  const total = cards.reduce((sum, c) => sum + (c.pesoAparicion > 0 ? c.pesoAparicion : 0), 0);
  const result: Record<string, number> = {};
  for (const c of cards) result[c.cardId] = total > 0 && c.pesoAparicion > 0 ? c.pesoAparicion / total : 0;
  return result;
}
