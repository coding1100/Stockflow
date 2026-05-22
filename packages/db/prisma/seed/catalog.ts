import { randomUUID } from 'node:crypto';
import type seedrandom from 'seedrandom';
import { faker, intBetween, pick } from './rng.js';
import type { SeedBin } from './layout.js';

export type Tier = 'A' | 'B' | 'C';

export interface SeedSku {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  barcode: string;
  weightG: number;
  dimensionsMm: { length: number; width: number; height: number };
  hazmat: boolean;
  minStock: number;
  maxStock: number;
  velocityTier: Tier;
  primaryBinId: string;
  primaryBinZone: string;
  imageUrl: string;
  /** Designed pick popularity, drives history generation + velocity tiering. */
  popularity: number;
}

const CATEGORIES = ['Home', 'Kitchen', 'Accessories', 'Apparel', 'Electronics', 'Outdoor', 'Beauty', 'Toys'];
const BRANDS = ['Northwind', 'Acme', 'Mercantile', 'Atlas', 'Vertex', 'Harborline', 'Cedar & Co', 'Lumen'];
const ADJ = ['Compact', 'Premium', 'Classic', 'Pro', 'Eco', 'Deluxe', 'Essential', 'Heavy-Duty'];
const NOUN = ['Organizer', 'Bottle', 'Charger', 'Jacket', 'Lamp', 'Mug', 'Backpack', 'Speaker', 'Knife Set', 'Towel'];

const SKU_COUNT = 1500;
/** Pareto split: ~20% A, ~30% B, ~50% C. A-items slot into zones A/B near pack. */
function assignTier(rng: seedrandom.PRNG): Tier {
  const r = rng();
  return r < 0.2 ? 'A' : r < 0.5 ? 'B' : 'C';
}

/**
 * Generate the catalog and slot each SKU into a bin. A-velocity items are placed in the
 * fast-pick zones near the pack station, so the slotting story is visible on the map and
 * A-heavy waves produce short routes.
 */
export function buildCatalog(rng: seedrandom.PRNG, bins: SeedBin[]): SeedSku[] {
  const fastBins = bins.filter((b) => b.zoneCode === 'A' || b.zoneCode === 'B');
  const midBins = bins.filter((b) => ['C', 'D', 'E'].includes(b.zoneCode));
  const slowBins = bins.filter((b) => ['F', 'G', 'H'].includes(b.zoneCode));

  const skus: SeedSku[] = [];
  for (let i = 0; i < SKU_COUNT; i++) {
    const tier = assignTier(rng);
    const poolForTier = tier === 'A' ? fastBins : tier === 'B' ? midBins : slowBins;
    const bin = pick(rng, poolForTier.length ? poolForTier : bins);
    const category = pick(rng, CATEGORIES);
    const brand = pick(rng, BRANDS);
    const name = `${pick(rng, ADJ)} ${pick(rng, NOUN)}`;
    const popularity = tier === 'A' ? intBetween(rng, 70, 100) : tier === 'B' ? intBetween(rng, 25, 60) : intBetween(rng, 1, 20);
    const code = `SKU-${String(i + 1).padStart(5, '0')}`;

    skus.push({
      id: randomUUID(),
      code,
      name,
      description: faker.commerce.productDescription(),
      category,
      brand,
      barcode: faker.string.numeric(12),
      weightG: intBetween(rng, 50, 4000),
      dimensionsMm: { length: intBetween(rng, 50, 600), width: intBetween(rng, 50, 400), height: intBetween(rng, 30, 400) },
      hazmat: bin.zoneCode === 'H',
      minStock: tier === 'A' ? intBetween(rng, 40, 80) : tier === 'B' ? intBetween(rng, 20, 40) : intBetween(rng, 5, 20),
      maxStock: tier === 'A' ? 400 : tier === 'B' ? 250 : 120,
      velocityTier: tier,
      primaryBinId: bin.id,
      primaryBinZone: bin.zoneCode,
      imageUrl: `/demo-assets/items/${category.toLowerCase()}.svg`,
      popularity,
    });
  }
  return skus;
}

export { CATEGORIES };
