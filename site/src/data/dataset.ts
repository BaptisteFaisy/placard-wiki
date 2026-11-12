// Dataset unifié du site : la MÊME forme pour les données live et pour les
// données embarquées (snapshot). Les écrans ne savent jamais d'où viennent
// les données — ils consomment `usePlacardData()`.
//
// Règle d'honnêteté : en mode live, rien de synthétique n'est présenté comme
// réel. Ce que le contrat live ne transporte pas (rôles, file d'adoption,
// historique de rituel…) est soit déduit du registre live — et alors la
// méthode est écrite comme telle — soit déclaré vide.

import type {
  BuildingModel,
  Certificate,
  CoverageReport,
  Foyer,
  OwnerResolution,
  PageExposure,
  PurgeRequest,
  RegistryRow,
  RitualStepState,
  ScanBudget,
  SpaceSettings,
} from '@placard-wiki/domain';
import type { WikiPageMeta } from '@placard-wiki/propagation';
import { EXPOSURES, FOYERS, ORPHAN_PAGES, OWNERS, PURGE_REQUESTS, RITUALS, SPACES } from './demo.js';
import { BUDGET, BUILDING, CERTIFICATE, COVERAGE_BLIND_SPOTS, REGISTRY_ROWS, TITLES } from './demo-site.js';
import { COVERAGE, MISSING_RIGHTS_EN, SPACE_BLIND_SPOT_EN } from './coverage.js';
import { INITIAL_SETTINGS } from './settings.js';
import { PAGES_META, PROP_EXPOSURE, PROP_TITLES, PROPAGATION_FOYERS } from './pages-meta.js';
import { DEMO_SITE_NAME } from '../lib/live-config.js';

/** Un espace (aile du bâtiment), avec ses libellés bilingues. */
export interface SpaceRef {
  readonly key: string;
  readonly fr: string;
  readonly en: string;
}

/** Une page orpheline de la file d'adoption. */
export interface OrphanPage {
  readonly pageId: string;
  readonly title: string;
  readonly spaceKey: string;
  readonly lastEditors: readonly string[];
}

/** Origine des données affichées. */
export type DataSource = 'live' | 'snapshot';

/** Un foyer proposé à l'écran de propagation. */
export interface PropagationEntry {
  readonly id: string;
  readonly foyer: Foyer;
}

/** Tout ce dont les écrans ont besoin, quelle que soit la source. */
export interface PlacardDataset {
  readonly source: DataSource;
  readonly generatedAt?: string;
  readonly siteName: string;
  readonly siteUrl?: string;
  readonly spaces: readonly SpaceRef[];
  readonly foyers: Readonly<Record<string, Foyer>>;
  readonly registryRows: readonly RegistryRow[];
  readonly building: BuildingModel;
  readonly budget: ScanBudget;
  readonly coverage: CoverageReport;
  readonly coverageBlindSpots: readonly string[];
  readonly certificate: Certificate;
  readonly exposures: Readonly<Record<string, PageExposure>>;
  readonly owners: Readonly<Record<string, OwnerResolution>>;
  readonly orphanPages: readonly OrphanPage[];
  readonly rituals: Readonly<Record<string, RitualStepState[]>>;
  readonly purgeRequests: Readonly<Record<string, PurgeRequest[]>>;
  readonly titles: Readonly<Record<string, string>>;
  readonly pagesMeta: readonly WikiPageMeta[];
  readonly propagationFoyers: readonly PropagationEntry[];
  readonly propExposure: ReadonlyMap<string, number>;
  readonly propTitles: Readonly<Record<string, string>>;
  readonly initialSettings: Readonly<Record<string, SpaceSettings>>;
  /** Tables EN alignées sur les angles morts — valides en snapshot seulement. */
  readonly coverageBlindSpotsEn?: readonly string[];
  readonly missingRightsEn?: readonly string[];
}

/** Objet simple (ni null, ni tableau) ? */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liste de chaînes, sinon liste vide. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Un objet indexé par chaîne, sinon objet vide. */
export function objectRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/** Le dataset embarqué (mode snapshot) — la démo actuelle, telle quelle. */
export function snapshotDataset(): PlacardDataset {
  return {
    source: 'snapshot',
    siteName: DEMO_SITE_NAME,
    spaces: SPACES,
    foyers: FOYERS,
    registryRows: REGISTRY_ROWS,
    building: BUILDING,
    budget: BUDGET,
    coverage: COVERAGE,
    coverageBlindSpots: COVERAGE_BLIND_SPOTS,
    certificate: CERTIFICATE,
    exposures: EXPOSURES,
    owners: OWNERS,
    orphanPages: ORPHAN_PAGES,
    rituals: RITUALS,
    purgeRequests: PURGE_REQUESTS,
    titles: TITLES,
    pagesMeta: PAGES_META,
    propagationFoyers: PROPAGATION_FOYERS,
    propExposure: PROP_EXPOSURE,
    propTitles: PROP_TITLES,
    initialSettings: INITIAL_SETTINGS,
    coverageBlindSpotsEn: SPACE_BLIND_SPOT_EN,
    missingRightsEn: MISSING_RIGHTS_EN,
  };
}
