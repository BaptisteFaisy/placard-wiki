/**
 * Le contrat public de l'API live — versionné, partagé, opposable.
 *
 * L'app Forge sert ce JSON par le webtrigger `pw-public-demo` ; le site public
 * le consomme. Ce module est la **source TypeScript unique** du contrat :
 * la version, l'en-tête HTTP qui la porte, les énumérations et la forme de la
 * charge utile.
 *
 * Le schéma JSON qui fait foi est `docs/api-live.schema.json` (JSON Schema
 * draft 2020-12). Les deux ne peuvent pas diverger : un test compare les
 * énumérations de part et d'autre, et la charge utile réellement produite est
 * validée contre le schéma (voir `packages/forge-app`).
 *
 * Engagement du contrat : **aucune valeur brute**. Ni le secret, ni un extrait
 * de contexte, ni une valeur qui s'en approche — seulement des empreintes
 * HMAC, des aperçus masqués, des scores et leurs termes (§23).
 */

import type { BuildingModel, CoverageReportReelle, RegistryRow } from './bridge';
import type { Certificate, Foyer, ScanBudget } from './types';

/** Version du contrat public de l'API live (sémantique : majeure.mineur.patch). */
export const LIVE_CONTRACT_VERSION = '1.1.0';

/** En-tête HTTP qui porte la version du contrat sur chaque réponse. */
export const LIVE_CONTRACT_HEADER = 'X-Placard-Contract';

/** Les onze familles de détection (§7) — énumération du contrat. */
export const LIVE_CONTRACT_FAMILIES = [
  'cloud-key',
  'platform-token',
  'private-key',
  'signed-token',
  'plaintext-password',
  'bank-data',
  'identity',
  'suspicious-string',
  'risky-file',
  'connection-string',
  'credential-table',
] as const;

/** Les états du rituel (§4, §9) — énumération du contrat. */
export const LIVE_CONTRACT_FOYER_STATES = [
  'open',
  'rotation-attested',
  'redacted',
  'purge-requested',
  'purged',
  'purge-impossible',
  'sealed',
  'dismissed',
] as const;

/** Les sept gîtes (§6) — énumération du contrat. */
export const LIVE_CONTRACT_GITES = [
  'corps-de-page',
  'commentaires',
  'pieces-jointes',
  'historique-de-versions',
  'modeles-de-page',
  'titres-et-etiquettes',
  'description-espace',
] as const;

/** Les six natures de conteneur (§6, §20) — énumération du contrat. */
export const LIVE_CONTRACT_CONTAINER_TYPES = [
  'page',
  'version',
  'comment',
  'attachment',
  'template',
  'space-desc',
] as const;

/** Les six champs de contenu (§6, §20) — énumération du contrat. */
export const LIVE_CONTRACT_CONTENT_FIELDS = [
  'body',
  'title',
  'labels',
  'description',
  'filename',
  'text',
] as const;

/** Les trois états d'un emplacement (§24) — énumération du contrat. */
export const LIVE_CONTRACT_LOCATION_STATUSES = ['present', 'redacted', 'vanished'] as const;

/** Les quatre états de partage (§8) — énumération du contrat. */
export const LIVE_CONTRACT_SHARING_STATES = [
  'restricted',
  'space-default',
  'anyone-with-link',
  'public',
] as const;

/** Les cinq méthodes de résolution du propriétaire (§12) — énumération du contrat. */
export const LIVE_CONTRACT_OWNER_METHODS = [
  'declared-owner',
  'last-editors',
  'space-lead',
  'teamwork-graph',
  'adoption-queue',
] as const;

/**
 * Les quatre états de couverture d'un gîte (§6, §14) — énumération du
 * contrat : lu, partiellement lu, inaccessible, jamais tenté.
 */
export const LIVE_CONTRACT_COVERAGE_STATES = [
  'read',
  'unread',
  'inaccessible',
  'not-attempted',
] as const;

/** Un espace balayé, tel que le contrat le publie. */
export interface LiveContractSpace {
  key: string;
  fr: string;
  en: string;
}

/** Le site balayé, tel que le contrat le publie. */
export interface LiveContractSite {
  name: string;
  url: string;
  spaces: LiveContractSpace[];
  /** Titres **masqués** des pages balayées (identifiant de page → titre). */
  titles: Record<string, string>;
}

/**
 * La charge utile publique du webtrigger `pw-public-demo`.
 *
 * Ce sont les structures du domaine, telles quelles : le registre, le
 * bâtiment, les foyers, le budget, la couverture et le certificat.
 */
export interface LiveContractPayload {
  /** Horodatage de la production de la charge utile. */
  generatedAt: string;
  /** `live` = données réellement balayées (≠ jeu embarqué). */
  mode: 'live';
  site: LiveContractSite;
  registry: RegistryRow[];
  building: BuildingModel;
  /** Les foyers, indexés par identifiant de foyer. */
  foyers: Record<string, Foyer>;
  budget: ScanBudget;
  /**
   * La couverture réelle : le pourcentage, SA méthode, et le détail gîte par
   * gîte (pages lues, illisibles, refusées) — jamais un chiffre nu (§14).
   */
  coverage: CoverageReportReelle;
  certificate: Certificate;
}
