import { faker } from '@faker-js/faker';
import seedrandom from 'seedrandom';

/**
 * Deterministic randomness for a reproducible demo. Every run with the same scenario
 * produces the identical warehouse, so rehearsals and screenshots match the live demo.
 */
export const SEED = 1337;

export function resetRng(scenarioSalt = 0): { rng: seedrandom.PRNG } {
  faker.seed(SEED + scenarioSalt);
  return { rng: seedrandom(String(SEED + scenarioSalt)) };
}

/** A fixed "now" anchors history windows and SLA buckets across machines. */
export const NOW = new Date('2026-05-22T09:00:00.000Z');

export function pick<T>(rng: seedrandom.PRNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function intBetween(rng: seedrandom.PRNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function chance(rng: seedrandom.PRNG, p: number): boolean {
  return rng() < p;
}

export { faker };
