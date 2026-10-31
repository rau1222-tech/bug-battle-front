import { describe, expect, it } from 'vitest';
import type { CardTemplate } from '@/constants';
import { getRarity, RARITY_GACHA_WEIGHT, type Rarity } from '@/hooks/useCollection';

describe('RARITY_GACHA_WEIGHT', () => {
  it.each(Object.keys(RARITY_GACHA_WEIGHT) as Rarity[])('maps %s back to the same rarity', (rarity) => {
    const card = { id: 'x', nombre: 'x', tipo: 'programador', coste: 1, descripcion: '', habilidades: [], gachaPeso: RARITY_GACHA_WEIGHT[rarity] } as CardTemplate;
    expect(getRarity(card)).toBe(rarity);
  });
});
