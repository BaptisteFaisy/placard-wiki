/**
 * Le score de danger (§8) : application du catalogue `@placard-wiki/domain`
 * terme à terme, chaque terme appliqué portant sa méthode et son évidence.
 *
 * Réemploi vs adaptation :
 * - **Réemployé** de `@placard-wiki/domain` : `SCORE_TERMS` / `SCORE_TERM_BY_ID`
 *   (libellés, points, méthodes), `BASE_SCORE_BY_FAMILY`, `computeDanger`
 *   (seule implémentation de la somme bornée 0-100) et `FAMILY_LABELS`.
 * - **Adapté** de `vendor/placard/packages/analysis/src/score.ts` : la *forme*
 *   est conservée (délégation à un calcul unique, liste des termes réellement
 *   appliqués, décision au niveau du groupe/foyer plutôt que de la détection),
 *   mais les entrées Git (`inHead`, `publicRemote`, `isTestPath`) n'ont pas de
 *   sens wiki : les termes sont ici ceux du cahier §8 (version courante,
 *   historique, lecteurs, partage, surface IA, rotation, propagation).
 */

import {
  BASE_SCORE_BY_FAMILY,
  FAMILY_LABELS,
  SCORE_TERM_BY_ID,
  computeDanger,
  type AiSurface,
  type AppliedScoreTerm,
  type ContainerType,
  type ReadersRange,
  type ScoreTermId,
  type SharingState,
  type WikiFamily,
} from '@placard-wiki/domain';

/** Paliers de lecteurs du §8 — un SEUL palier appliqué, du plus haut au plus bas. */
export const READERS_TIERS: ReadonlyArray<{ id: ScoreTermId; above: number }> = [
  { id: 'readers-1000', above: 1000 },
  { id: 'readers-100', above: 100 },
  { id: 'readers-10', above: 10 },
];

/** Tranche de versions concernées donnant +5 (§8 : « +5 par tranche de 10 versions »). */
export const HISTORY_CHUNK_VERSIONS = 10;
/** Rotation inconnue depuis plus de ce nombre de jours (§8). */
export const ROTATION_UNKNOWN_DAYS = 90;
/** Nombre d'emplacements distincts à partir duquel le foyer est « propagé » (§8). */
export const PROPAGATION_MIN_LOCATIONS = 3;
/** « Restreinte à moins de 3 personnes » (§8) : borne haute strictement inférieure à 3. */
export const ARCHIVED_RESTRICTED_MAX_READERS = 3;
/** Millisecondes dans un jour — pour l'âge de la première observation. */
export const MS_PER_DAY = 86_400_000;

/** Un emplacement du foyer, réduit aux champs utiles au score. */
export interface ScoredLocation {
  /** `present` = encore lisible ; `redacted` = caviardé ; `vanished` = disparu (§24). */
  status: 'present' | 'redacted' | 'vanished';
  containerType: ContainerType;
  pageId: string;
  versionNumber?: number;
}

/** Tout ce dont le score a besoin — jamais de valeur brute (§23). */
export interface DangerScoreInput {
  family: WikiFamily;
  locations: readonly ScoredLocation[];
  /** Fourchette de lecteurs (sortie de `readersRange`) — jamais un nombre seul. */
  readers: ReadersRange;
  sharing: SharingState;
  /** Surface IA : seule l'hypothèse conservatrice compte ici (§13). */
  aiSurface: Pick<AiSurface, 'presumedIndexed'>;
  /** Page archivée (malus « archivée ou restreinte à moins de 3 personnes »). */
  archived?: boolean;
  /** Contenu de test/exemple/documentation, décidé en amont (motif ou LLM). */
  testContent?: boolean;
  /** Empreinte correspondant à une valeur factice connue (`isDummyValue` de core). */
  knownFake?: boolean;
  /** Date d'une attestation de rotation HUMAINE, si elle existe. */
  rotatedAt?: string;
  /** Première observation du foyer (ISO). */
  firstSeenAt: string;
  /** Horodatage de référence — injectable pour des tests déterministes. */
  now?: string;
}

/** Le score et ses termes : aucun score sans ses termes (§8, §25.6). */
export interface DangerScoreResult {
  total: number;
  terms: AppliedScoreTerm[];
}

/** Construit un terme appliqué depuis le catalogue : méthode + évidence (§25.6). */
function appliedTerm(id: ScoreTermId, evidence: string, points?: number): AppliedScoreTerm {
  const spec = SCORE_TERM_BY_ID.get(id);
  if (!spec) throw new Error(`terme de score inconnu du catalogue : ${id}`);
  return {
    id: spec.id,
    points: points ?? spec.points ?? 0,
    label: spec.fr,
    method: spec.methodFr,
    evidence,
  };
}

/** Terme de base : 20 – 55 selon la famille (§8). Toujours appliqué. */
function baseTerm(family: WikiFamily): AppliedScoreTerm {
  const base = BASE_SCORE_BY_FAMILY[family];
  return appliedTerm('base-family', `famille « ${FAMILY_LABELS[family].fr} » → base ${base}`, base);
}

/** Nombre de jours entre `firstSeenAt` et `now` (arrondi inférieur). */
export function daysSince(firstSeenAt: string, now: string): number {
  return Math.floor((Date.parse(now) - Date.parse(firstSeenAt)) / MS_PER_DAY);
}

/** Clé d'unicité d'un emplacement : même conteneur, même page, même version. */
function locationKey(location: ScoredLocation): string {
  return `${location.containerType}:${location.pageId}:${location.versionNumber ?? ''}`;
}

/** Emplacements distincts encore debout (les `vanished` ne comptent plus, §24). */
function standingLocations(locations: readonly ScoredLocation[]): ScoredLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (location.status === 'vanished') return false;
    const key = locationKey(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Termes d'historique : +15 si présent, +5 par tranche de 10 versions concernées. */
function historyTerms(locations: readonly ScoredLocation[]): AppliedScoreTerm[] {
  const readable = locations.filter(
    (location) => location.containerType === 'version' && location.status === 'present',
  );
  if (readable.length === 0) return [];
  const terms = [appliedTerm('history-present', `${readable.length} version(s) historique(s) encore lisible(s)`)];
  const distinct = new Set(readable.map((location) => location.versionNumber ?? location.pageId)).size;
  const chunks = Math.floor(distinct / HISTORY_CHUNK_VERSIONS);
  if (chunks > 0) {
    terms.push(
      appliedTerm(
        'history-depth',
        `${distinct} version(s) concernée(s) → ${chunks} tranche(s) de ${HISTORY_CHUNK_VERSIONS}`,
        chunks * (SCORE_TERM_BY_ID.get('history-depth')?.points ?? 0),
      ),
    );
  }
  return terms;
}

/** UN SEUL palier de lecteurs, choisi par la borne haute de la fourchette (§8). */
export function readersTierTerm(readersHigh: number): AppliedScoreTerm | null {
  const tier = READERS_TIERS.find((candidate) => readersHigh > candidate.above);
  if (!tier) return null;
  return appliedTerm(tier.id, `borne haute de la fourchette : ${readersHigh} lecteur(s) potentiel(s)`);
}

/** +10 si rotation inconnue depuis plus de 90 jours (§8). */
function rotationTerm(input: DangerScoreInput): AppliedScoreTerm | null {
  if (input.rotatedAt) return null;
  const days = daysSince(input.firstSeenAt, input.now ?? new Date().toISOString());
  if (days <= ROTATION_UNKNOWN_DAYS) return null;
  return appliedTerm('rotation-unknown-90d', `première observation il y a ${days} jour(s), aucune attestation de rotation humaine`);
}

/** +10 si la même empreinte vit sur 3 emplacements distincts ou plus (§8, §11). */
function propagationTerm(locations: readonly ScoredLocation[]): AppliedScoreTerm | null {
  const standing = standingLocations(locations);
  if (standing.length < PROPAGATION_MIN_LOCATIONS) return null;
  return appliedTerm('propagation-3', `${standing.length} emplacements distincts encore debout`);
}

/** Malus du §8 : test/exemple/doc (−30), factice connue (−20), archivée/restreinte (−15). */
function malusTerms(input: DangerScoreInput): AppliedScoreTerm[] {
  const terms: AppliedScoreTerm[] = [];
  if (input.testContent) {
    terms.push(appliedTerm('test-content', 'contexte de test, d’exemple ou de documentation (motif ou LLM)'));
  }
  if (input.knownFake) {
    terms.push(appliedTerm('known-fake', 'empreinte correspondant à une valeur factice connue'));
  }
  if (input.archived) {
    terms.push(appliedTerm('archived-restricted', 'page archivée'));
  } else if (input.readers.high < ARCHIVED_RESTRICTED_MAX_READERS) {
    terms.push(
      appliedTerm(
        'archived-restricted',
        `lecture restreinte : borne haute ${input.readers.high} < ${ARCHIVED_RESTRICTED_MAX_READERS} lecteur(s)`,
      ),
    );
  }
  return terms;
}

/**
 * Calcule le score de danger d'un foyer : base par famille, puis chaque terme
 * du catalogue §8 dans l'ordre du cahier. Le total est borné 0-100 par
 * `computeDanger` (domain) — jamais recopié ici.
 */
export function computeDangerScore(input: DangerScoreInput): DangerScoreResult {
  const terms: AppliedScoreTerm[] = [baseTerm(input.family)];
  const currentCount = input.locations.filter(
    (location) => location.status === 'present' && location.containerType !== 'version',
  ).length;
  if (currentCount > 0) {
    terms.push(appliedTerm('current-version', `${currentCount} emplacement(s) dans la version courante`));
  }
  terms.push(...historyTerms(input.locations));
  const tier = readersTierTerm(input.readers.high);
  if (tier) terms.push(tier);
  if (input.sharing === 'public' || input.sharing === 'anyone-with-link') {
    terms.push(appliedTerm('public-share', `état du partage : ${input.sharing}`));
  }
  if (input.aiSurface.presumedIndexed) {
    terms.push(appliedTerm('ai-surface', 'hypothèse conservatrice : page lisible par Rovo, présumée indexée (§13)'));
  }
  const rotation = rotationTerm(input);
  if (rotation) terms.push(rotation);
  const propagation = propagationTerm(input.locations);
  if (propagation) terms.push(propagation);
  terms.push(...malusTerms(input));
  return { total: computeDanger(terms), terms };
}
