/**
 * Espace de démonstration Placard (§15, §27.1) — fixtures famille × gîte,
 * oracle et seed Confluence REST idempotent (mode `--dry-run` testé).
 *
 * Tout est marqué « SYNTHÉTIQUE — démo Placard » ; les valeurs viennent de
 * `@placard/core` (`fake-values`) et ne sont jamais écrites en clair ici.
 */

export const PACKAGE_NAME = '@placard-wiki/demo-space';
export const PACKAGE_STATUS = 'implemented' as const;

export * from './fixtures/index.js';
export * from './fixtures/content.js';
export * from './oracle.js';
export * from './plan.js';
export * from './executor.js';
export * from './seed.js';