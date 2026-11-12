/**
 * Le score de danger, et son catalogue de termes (cahier des charges §8).
 * Règle d'honnêteté : aucun score sans ses termes. Chaque terme appliqué est
 * affiché dans la fiche du foyer, avec sa méthode.
 */

import type { WikiFamily } from './vocabulary';

/** Base par famille : 20 – 55 (§8). */
export const BASE_SCORE_BY_FAMILY: Record<WikiFamily, number> = {
  'cloud-key': 55,
  'private-key': 55,
  'platform-token': 50,
  'plaintext-password': 50,
  'connection-string': 50,
  'credential-table': 50,
  'signed-token': 45,
  'bank-data': 45,
  identity: 45,
  'risky-file': 40,
  'suspicious-string': 35,
};

/** Identifiants des termes du score (§8). */
export type ScoreTermId =
  | 'base-family'
  | 'current-version'
  | 'history-present'
  | 'history-depth'
  | 'readers-1000'
  | 'readers-100'
  | 'readers-10'
  | 'public-share'
  | 'ai-surface'
  | 'rotation-unknown-90d'
  | 'propagation-3'
  | 'test-content'
  | 'known-fake'
  | 'archived-restricted';

/** Un terme du catalogue : points, signe, libellés, méthode. */
export interface ScoreTermSpec {
  id: ScoreTermId;
  /** `null` pour la base par famille et les termes à paliers. */
  points: number | null;
  kind: 'base' | 'bonus' | 'malus';
  fr: string;
  en: string;
  /** Comment le terme est appliqué — affiché avec le score. */
  methodFr: string;
  methodEn: string;
}

/** Le catalogue exact du §8, dans l'ordre du cahier. */
export const SCORE_TERMS: readonly ScoreTermSpec[] = [
  {
    id: 'base-family', points: null, kind: 'base',
    fr: 'Base par famille', en: 'Family base score',
    methodFr: '20 – 55 selon la famille de détection (BASE_SCORE_BY_FAMILY).',
    methodEn: '20 – 55 depending on the detection family (BASE_SCORE_BY_FAMILY).',
  },
  {
    id: 'current-version', points: 20, kind: 'bonus',
    fr: 'Toujours présent dans la version courante', en: 'Still present in the current version',
    methodFr: '+20 si au moins un emplacement `present` dans la version actuelle.',
    methodEn: '+20 when at least one location is `present` in the current version.',
  },
  {
    id: 'history-present', points: 15, kind: 'bonus',
    fr: 'Présent dans l’historique', en: 'Present in version history',
    methodFr: '+15 si au moins une ancienne version contient encore l’empreinte.',
    methodEn: '+15 when any older version still contains the fingerprint.',
  },
  {
    id: 'history-depth', points: 5, kind: 'bonus',
    fr: 'Profondeur d’historique', en: 'History depth',
    methodFr: '+5 par tranche de 10 versions concernées.',
    methodEn: '+5 per 10 affected versions.',
  },
  {
    id: 'readers-1000', points: 15, kind: 'bonus',
    fr: 'Lisible par plus de 1 000 personnes', en: 'Readable by more than 1,000 people',
    methodFr: '+15 si la fourchette haute des lecteurs dépasse 1 000 (un seul palier appliqué).',
    methodEn: '+15 when the upper readership bound exceeds 1,000 (a single tier applies).',
  },
  {
    id: 'readers-100', points: 10, kind: 'bonus',
    fr: 'Lisible par plus de 100 personnes', en: 'Readable by more than 100 people',
    methodFr: '+10 si la fourchette haute dépasse 100 sans dépasser 1 000.',
    methodEn: '+10 when the upper bound exceeds 100 but not 1,000.',
  },
  {
    id: 'readers-10', points: 5, kind: 'bonus',
    fr: 'Lisible par plus de 10 personnes', en: 'Readable by more than 10 people',
    methodFr: '+5 si la fourchette haute dépasse 10 sans dépasser 100.',
    methodEn: '+5 when the upper bound exceeds 10 but not 100.',
  },
  {
    id: 'public-share', points: 10, kind: 'bonus',
    fr: 'Page partagée publiquement / « anyone with link »', en: 'Publicly shared / “anyone with link”',
    methodFr: '+10 si l’état de partage est `public` ou `anyone-with-link`.',
    methodEn: '+10 when sharing state is `public` or `anyone-with-link`.',
  },
  {
    id: 'ai-surface', points: 10, kind: 'bonus',
    fr: 'Surface IA : page indexée par Rovo', en: 'AI surface: page indexed by Rovo',
    methodFr: '+10 — hypothèse conservatrice tant que l’index ne peut pas être interrogé (§13).',
    methodEn: '+10 — conservative hypothesis until the index can be queried (§13).',
  },
  {
    id: 'rotation-unknown-90d', points: 10, kind: 'bonus',
    fr: 'Rotation inconnue depuis plus de 90 jours', en: 'Rotation unknown for over 90 days',
    methodFr: '+10 si aucune attestation de rotation et première observation > 90 jours.',
    methodEn: '+10 when no rotation attestation exists and first seen > 90 days ago.',
  },
  {
    id: 'propagation-3', points: 10, kind: 'bonus',
    fr: 'Propagée : même empreinte sur 3 emplacements ou plus', en: 'Propagated: same fingerprint in 3+ locations',
    methodFr: '+10 si le foyer compte au moins 3 emplacements distincts.',
    methodEn: '+10 when the foyer spans at least 3 distinct locations.',
  },
  {
    id: 'test-content', points: -30, kind: 'malus',
    fr: 'Contenu de test, d’exemple ou de documentation', en: 'Test, example or documentation content',
    methodFr: '−30 si le contexte est un exemple de documentation ou une valeur de test (LLM ou motif).',
    methodEn: '−30 when context is a documentation example or test value (LLM or pattern).',
  },
  {
    id: 'known-fake', points: -20, kind: 'malus',
    fr: 'Valeur factice connue', en: 'Known fake value',
    methodFr: '−20 si l’empreinte correspond à une valeur factice connue (AKIAIOSFODNN7EXAMPLE, etc.).',
    methodEn: '−20 when the fingerprint matches a known fake value (AKIAIOSFODNN7EXAMPLE, etc.).',
  },
  {
    id: 'archived-restricted', points: -15, kind: 'malus',
    fr: 'Page archivée ou restreinte à moins de 3 personnes', en: 'Archived page or restricted to fewer than 3 people',
    methodFr: '−15 si la page est archivée, ou si la restriction limite à moins de 3 lecteurs.',
    methodEn: '−15 when the page is archived, or restrictions limit readership below 3.',
  },
];

/** Lookup par identifiant. */
export const SCORE_TERM_BY_ID: ReadonlyMap<ScoreTermId, ScoreTermSpec> = new Map(
  SCORE_TERMS.map((t) => [t.id, t]),
);

/**
 * Somme des termes appliqués, bornée à 0-100 (§8).
 * Aucun arrondi fantaisiste : le total est la somme exacte, bornée.
 */
export function computeDanger(terms: Array<{ points: number }>): number {
  const total = terms.reduce((acc, t) => acc + t.points, 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

/** Fourchette d’heures de remise en état par famille (§8 : rotation + caviardage + purge + vérification). */
export const REMEDIATION_COST_HOURS: Record<WikiFamily, { low: number; high: number }> = {
  'cloud-key': { low: 2, high: 6 },
  'private-key': { low: 2, high: 5 },
  'platform-token': { low: 1, high: 4 },
  'plaintext-password': { low: 1, high: 3 },
  'connection-string': { low: 2, high: 5 },
  'credential-table': { low: 2, high: 6 },
  'signed-token': { low: 1, high: 3 },
  'bank-data': { low: 2, high: 6 },
  identity: { low: 3, high: 8 },
  'risky-file': { low: 2, high: 8 },
  'suspicious-string': { low: 1, high: 4 },
};

/** La méthode du coût de remise en état, affichée avec la fourchette. */
export const REMEDIATION_COST_METHOD = {
  fr: 'Fourchette en heures par famille : rotation + caviardage + purge + vérification. Estimée depuis les rituels déjà clos sur cette installation ; réévaluée à chaque sceau de cire.',
  en: 'Hour range per family: rotation + redaction + purge + verification. Estimated from rituals already sealed on this installation; re-evaluated at every wax seal.',
} as const;
