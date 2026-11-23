/**
 * Strategy profiles as data: the same numbers drive the model prompt, the repair step and the
 * deterministic fallback, so balance can be tuned here without touching any algorithm.
 * Only imports the contract, so the Node service can use it too.
 */
import type { Strategy } from './contract';

export type CardKind = 'programador' | 'qa' | 'consumible';

export interface StrategyProfile {
  /** Weight of each normalised card feature (0..1) in the per-copy score. */
  weights: {
    /** Basic attack efficiency against the Bug (power per attack energy). */
    attack: number;
    /** Direct damage skills (Bug). */
    burst: number;
    /** Ally power buffs. */
    buff: number;
    /** Removing / damaging enemy cards (QA). */
    control: number;
    /** Sanity recovery. */
    heal: number;
    /** Max sanity: survives QA hits and the Bug counterattack. */
    sanity: number;
    /** Low summon cost: early pressure and fewer dead hands. */
    cheap: number;
    /** Penalty per unit of normalised summon cost. */
    cost: number;
  };
  /** Allowed share of the deck per card type, [min, max] in 0..1. */
  typeShare: Record<CardKind, [number, number]>;
  /** Target share of copies costing ≤1, 2 and ≥3. */
  curve: [number, number, number];
  /** Minimum share of copies that can damage the Bug (programmers or direct damage). */
  minDamageShare: number;
  /** Deck-level penalty multipliers. */
  penalty: { curve: number; typeShare: number; damage: number; deadHand: number; noTargets: number };
  /** Max relative score noise from the seed; keeps the strategy recognisable while varying ties. */
  jitter: number;
  /** Plain-language priorities sent to the model. */
  guidance: string;
}

export const STRATEGY_PROFILES: Record<Strategy, StrategyProfile> = {
  balanced: {
    weights: { attack: 1.0, burst: 0.8, buff: 0.7, control: 0.7, heal: 0.5, sanity: 0.6, cheap: 0.6, cost: 0.5 },
    typeShare: { programador: [0.55, 0.75], qa: [0.1, 0.25], consumible: [0.1, 0.2] },
    curve: [0.4, 0.35, 0.25],
    minDamageShare: 0.6,
    penalty: { curve: 4, typeShare: 3, damage: 3, deadHand: 6, noTargets: 2 },
    jitter: 0.12,
    guidance:
      'Balanced: stable energy curve, a useful mix of programmers, QA and consumables, enough damage, ' +
      'survivability, some control, synergies, and few unplayable opening hands.',
  },
  aggressive: {
    weights: { attack: 1.6, burst: 1.5, buff: 1.0, control: 0.2, heal: 0.1, sanity: 0.2, cheap: 1.2, cost: 0.9 },
    typeShare: { programador: [0.65, 0.9], qa: [0, 0.1], consumible: [0.1, 0.25] },
    curve: [0.5, 0.35, 0.15],
    minDamageShare: 0.75,
    penalty: { curve: 4, typeShare: 3, damage: 4, deadHand: 6, noTargets: 2 },
    jitter: 0.12,
    guidance:
      'Aggressive: maximise damage to the Bug, power per energy, cheap attacks and direct damage; ' +
      'early pressure with low or medium cost cards; few slow or purely defensive cards, but keep finishers.',
  },
  defensive: {
    weights: { attack: 0.6, burst: 0.4, buff: 0.4, control: 1.6, heal: 1.2, sanity: 1.3, cheap: 0.3, cost: 0.3 },
    typeShare: { programador: [0.5, 0.65], qa: [0.2, 0.35], consumible: [0.1, 0.2] },
    curve: [0.35, 0.4, 0.25],
    minDamageShare: 0.5,
    penalty: { curve: 4, typeShare: 3, damage: 4, deadHand: 6, noTargets: 3 },
    jitter: 0.12,
    guidance:
      'Defensive: prioritise QA cards, control of enemy cards, high sanity, recovery and protection, long-game ' +
      'efficiency; avoid consumables without valid targets; still keep enough damage sources to win.',
  },
};
