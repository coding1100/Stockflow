/**
 * Fixed identifiers for the single-tenant demo. Using stable UUIDs (rather than
 * random ones) keeps the seed deterministic and lets the app resolve the tenant /
 * warehouse without a lookup. Multi-tenant production would derive these from auth.
 */
export const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000002';
export const DEMO_TENANT_NAME = 'Northwind Retail';
export const DEMO_WAREHOUSE_CODE = 'DC-01';

/** Walk speed + per-pick handling used to convert route distance to seconds. */
export const WALK_METERS_PER_SEC = 1.3;
/** Map grid unit → meters (one cell ≈ 0.5m). */
export const GRID_UNIT_METERS = 0.5;
export const SECONDS_PER_PICK = 12;
