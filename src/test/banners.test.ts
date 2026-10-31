import { describe, expect, it } from 'vitest';
import {
  appearanceProbabilities,
  fromDateTimeLocal,
  getBannerStatus,
  isBannerActive,
  toDateTimeLocal,
  validateBannerDraft,
  type BannerDraft,
} from '@/lib/banners';

const banner = { fechaInicio: '2026-11-01T10:00:00.000Z', fechaFin: '2026-11-08T10:00:00.000Z' };

describe('getBannerStatus', () => {
  it('is scheduled before the start date', () => {
    expect(getBannerStatus(banner, new Date('2026-11-01T09:59:59.999Z'))).toBe('programado');
  });

  it('is active on both boundaries (inicio <= now <= fin)', () => {
    expect(isBannerActive(banner, new Date(banner.fechaInicio))).toBe(true);
    expect(isBannerActive(banner, new Date(banner.fechaFin))).toBe(true);
  });

  it('is finished after the end date', () => {
    expect(getBannerStatus(banner, new Date('2026-11-08T10:00:00.001Z'))).toBe('finalizado');
  });
});

describe('appearanceProbabilities', () => {
  it('is proportional to the weights even when they do not add up to 100', () => {
    const p = appearanceProbabilities([
      { cardId: 'a', pesoAparicion: 10 },
      { cardId: 'b', pesoAparicion: 20 },
      { cardId: 'c', pesoAparicion: 30 },
    ]);
    expect(p.a).toBeCloseTo(1 / 6);
    expect(p.b).toBeCloseTo(2 / 6);
    expect(p.c).toBeCloseTo(3 / 6);
  });

  it('returns 0 for an empty or invalid pool', () => {
    expect(appearanceProbabilities([{ cardId: 'a', pesoAparicion: 0 }]).a).toBe(0);
  });
});

describe('validateBannerDraft', () => {
  const valid: BannerDraft = {
    titulo: 'Halloween',
    fechaInicio: banner.fechaInicio,
    fechaFin: banner.fechaFin,
    coste: 100,
    cartasPorSobre: 3,
    cards: [{ cardId: 'a', pesoAparicion: 10 }],
  };

  it('accepts a valid banner', () => {
    expect(validateBannerDraft(valid)).toBeNull();
  });

  it.each<[string, Partial<BannerDraft>]>([
    ['El título es obligatorio', { titulo: '   ' }],
    ['La fecha de inicio es obligatoria', { fechaInicio: '' }],
    ['La fecha de fin es obligatoria', { fechaFin: '' }],
    ['La fecha de fin debe ser posterior a la fecha de inicio', { fechaFin: banner.fechaInicio }],
    ['El banner debe contener al menos una carta', { cards: [] }],
    ['El peso de aparición debe ser un número entero mayor que 0', { cards: [{ cardId: 'a', pesoAparicion: 0 }] }],
    ['El peso de aparición debe ser un número entero mayor que 0', { cards: [{ cardId: 'a', pesoAparicion: 1.5 }] }],
    [
      'No se puede añadir dos veces la misma carta al banner',
      { cards: [{ cardId: 'a', pesoAparicion: 10 }, { cardId: 'a', pesoAparicion: 5 }] },
    ],
    ['El coste debe ser un número entero mayor que 0', { coste: 0 }],
  ])('rejects: %s', (message, patch) => {
    expect(validateBannerDraft({ ...valid, ...patch })).toBe(message);
  });
});

describe('datetime-local conversion', () => {
  it('round-trips a local date', () => {
    const local = '2026-11-01T18:30';
    expect(toDateTimeLocal(fromDateTimeLocal(local))).toBe(local);
  });

  it('returns empty strings for invalid values', () => {
    expect(fromDateTimeLocal('')).toBe('');
    expect(toDateTimeLocal('not-a-date')).toBe('');
  });
});
