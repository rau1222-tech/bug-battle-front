import { localeOf, t } from '@/i18n';

/** Limits shared with the CHECK constraints and validations of public.banners / public.save_banner(). */
export const BANNER_TITLE_MAX = 80;
export const BANNER_CARDS_PER_PACK_MIN = 1;
export const BANNER_CARDS_PER_PACK_MAX = 10;
export const BANNER_DEFAULT_COST = 100;
export const BANNER_DEFAULT_CARDS_PER_PACK = 3;

export interface BannerCard {
  cardId: string;
  /** Relative weight used ONLY to draw this card inside the banner. Rarity always comes from cards.gacha_peso. */
  pesoAparicion: number;
}

export interface Banner {
  id: string;
  titulo: string;
  /** ISO 8601 timestamps. */
  fechaInicio: string;
  fechaFin: string;
  coste: number;
  cartasPorSobre: number;
  cards: BannerCard[];
}

export type BannerDraft = Omit<Banner, 'id'>;

export type BannerStatus = 'activo' | 'programado' | 'finalizado';

/** i18n keys; translate at render time. */
export const BANNER_STATUS_LABELS: Record<BannerStatus, string> = {
  activo: 'gacha.status.activo',
  programado: 'gacha.status.programado',
  finalizado: 'gacha.status.finalizado',
};

/** Mirrors the backend rule: fecha_inicio <= now <= fecha_fin. */
export function getBannerStatus(banner: Pick<Banner, 'fechaInicio' | 'fechaFin'>, now: Date = new Date()): BannerStatus {
  const t = now.getTime();
  if (t < new Date(banner.fechaInicio).getTime()) return 'programado';
  if (t > new Date(banner.fechaFin).getTime()) return 'finalizado';
  return 'activo';
}

export function isBannerActive(banner: Pick<Banner, 'fechaInicio' | 'fechaFin'>, now: Date = new Date()): boolean {
  return getBannerStatus(banner, now) === 'activo';
}

/** Probability (0..1) of each card per draw, proportional to its weight; weights need not add up to 100. */
export function appearanceProbabilities(cards: BannerCard[]): Record<string, number> {
  const total = cards.reduce((sum, c) => sum + (c.pesoAparicion > 0 ? c.pesoAparicion : 0), 0);
  const result: Record<string, number> = {};
  for (const c of cards) result[c.cardId] = total > 0 && c.pesoAparicion > 0 ? c.pesoAparicion / total : 0;
  return result;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function validateBannerDraft(draft: BannerDraft): string | null {
  const titulo = draft.titulo.trim();
  if (!titulo) return t('gacha.validation.titleRequired');
  if (titulo.length > BANNER_TITLE_MAX) return t('gacha.validation.titleTooLong', { max: BANNER_TITLE_MAX });

  const inicio = draft.fechaInicio ? new Date(draft.fechaInicio).getTime() : NaN;
  const fin = draft.fechaFin ? new Date(draft.fechaFin).getTime() : NaN;
  if (Number.isNaN(inicio)) return t('gacha.validation.startRequired');
  if (Number.isNaN(fin)) return t('gacha.validation.endRequired');
  if (fin <= inicio) return t('gacha.validation.endBeforeStart');

  if (!isPositiveInt(draft.coste)) return t('gacha.validation.costInvalid');
  if (
    !Number.isInteger(draft.cartasPorSobre) ||
    draft.cartasPorSobre < BANNER_CARDS_PER_PACK_MIN ||
    draft.cartasPorSobre > BANNER_CARDS_PER_PACK_MAX
  ) {
    return t('gacha.validation.cardsPerPackRange', { min: BANNER_CARDS_PER_PACK_MIN, max: BANNER_CARDS_PER_PACK_MAX });
  }

  if (draft.cards.length === 0) return t('gacha.validation.noCards');
  const seen = new Set<string>();
  for (const card of draft.cards) {
    if (seen.has(card.cardId)) return t('gacha.validation.duplicateCard');
    seen.add(card.cardId);
    if (!isPositiveInt(card.pesoAparicion)) return t('gacha.validation.weightInvalid');
  }
  return null;
}

/** ISO timestamp -> value for <input type="datetime-local"> in the user's local time zone. */
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Value from <input type="datetime-local"> (local time) -> ISO timestamp, or '' if empty/invalid. */
export function fromDateTimeLocal(local: string): string {
  if (!local) return '';
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatBannerDate(iso: string): string {
  return new Date(iso).toLocaleString(localeOf(), { dateStyle: 'short', timeStyle: 'short' });
}
