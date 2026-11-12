/**
 * Couche stockage Forge SQL (§20) — `@forge/sql`.
 *
 * Deux implémentations interchangeables des mêmes ports :
 *  - `createForgeStore()` : sur `@forge/sql` (production) ;
 *  - `createMemoryStore()` : en mémoire (tests, jamais `@forge/sql`).
 *
 * `initSchema()` crée les onze tables du domaine via `migrationRunner`.
 */

export * from './ports';
export * from './serialize';
export { createMemoryStore, defaultSpaceSettings, rehydrate } from './memory-store';
export type { MemoryState } from './memory-store';
export { createForgeStore, initSchema, rehydrateWithSpace } from './forge-store';