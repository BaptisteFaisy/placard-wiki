/**
 * Balayage de pré-activation (§13, §27.5) : avant d'activer un assistant sur
 * un nouvel espace, répondre à « qu'est-ce que je m'apprête à donner à lire à
 * mon IA ? » — agrégats par famille, exposition maximale, angles morts
 * déclarés. Que des chiffres et des phrases : jamais de valeur brute, jamais
 * d'aperçu de foyer dans ce rapport (§23).
 */

import { FAMILY_LABELS, type FoyerState, type WikiFamily } from '@placard-wiki/domain';
import { remediationCost } from './remediation';

/** La question à laquelle ce rapport répond (§13). */
export const PRE_ACTIVATION_QUESTION_FR = 'Qu’est-ce que je m’apprête à donner à lire à mon IA ?';

/**
 * États où du texte reste lisible quelque part : rotation attestée mais texte
 * présent (§24), caviardage fait mais historique en attente de purge, purge
 * impossible documentée. `purged`, `sealed` et `dismissed` n'exposent plus.
 */
export const EXPOSED_STATES: readonly FoyerState[] = [
  'open',
  'rotation-attested',
  'redacted',
  'purge-requested',
  'purge-impossible',
];

/** Angles morts de base, toujours déclarés — jamais masqués (§23, §24). */
export const BASE_BLIND_SPOTS_FR: readonly string[] = [
  'Secrets dans des captures d’écran : non détectés par un balayage texte (§24) — angle mort déclaré, pas ignoré en silence.',
  'Surface IA : hypothèse conservatrice uniquement (§13), l’index Rovo réel ne peut pas encore être interrogé.',
];

/** Un foyer vu par le rapport : ce qu'il faut pour agréger, rien de plus. */
export interface PreActivationFoyer {
  id: string;
  family: WikiFamily;
  score: number;
  state: FoyerState;
  /** Hypothèse conservatrice de la surface IA (§13). */
  presumedIndexed: boolean;
}

/** Entrée du rapport de pré-activation. */
export interface PreActivationInput {
  spaceKey: string;
  foyers: readonly PreActivationFoyer[];
  /** Angles morts supplémentaires, déjà rédigés (pièces jointes non lues, droits manquants…). */
  blindSpots?: readonly string[];
  /** Horodatage injectable, pour des rapports déterministes en test. */
  now?: string;
}

/** Agrégat par famille : compte, exposition maximale, coût de remise en état. */
export interface FamilyAggregate {
  family: WikiFamily;
  labelFr: string;
  labelEn: string;
  count: number;
  maxScore: number;
  hoursLow: number;
  hoursHigh: number;
}

/** Le rapport : des chiffres et des angles morts, aucun contenu de foyer. */
export interface PreActivationReport {
  spaceKey: string;
  question: string;
  scannedFoyers: number;
  /** Foyers dont du texte reste lisible (EXPOSED_STATES). */
  exposedFoyers: number;
  presumedIndexedFoyers: number;
  byFamily: FamilyAggregate[];
  maxExposure: { foyerId: string; family: WikiFamily; score: number } | null;
  blindSpots: string[];
  generatedAt: string;
}

/** Un foyer expose-t-il encore du texte à un assistant ? */
export function isExposed(state: FoyerState): boolean {
  return EXPOSED_STATES.includes(state);
}

/** Agrège les foyers d'une famille — appelée avec une liste non vide. */
function aggregateFamily(family: WikiFamily, foyers: readonly PreActivationFoyer[]): FamilyAggregate {
  const cost = remediationCost(family);
  return {
    family,
    labelFr: FAMILY_LABELS[family].fr,
    labelEn: FAMILY_LABELS[family].en,
    count: foyers.length,
    maxScore: Math.max(...foyers.map((foyer) => foyer.score)),
    hoursLow: cost.low * foyers.length,
    hoursHigh: cost.high * foyers.length,
  };
}

/** Exposition maximale parmi les foyers exposés (premier ex æquo retenu). */
function worstExposure(foyers: readonly PreActivationFoyer[]): PreActivationFoyer | null {
  return foyers.reduce<PreActivationFoyer | null>(
    (worst, foyer) => (worst === null || foyer.score > worst.score ? foyer : worst),
    null,
  );
}

/** Construit le rapport de pré-activation d'un espace (§13, §27.5). */
export function preActivationReport(input: PreActivationInput): PreActivationReport {
  const exposed = input.foyers.filter((foyer) => isExposed(foyer.state));
  const families = [...new Set(exposed.map((foyer) => foyer.family))];
  const byFamily = families
    .map((family) => aggregateFamily(family, exposed.filter((foyer) => foyer.family === family)))
    .sort((a, b) => b.maxScore - a.maxScore || a.family.localeCompare(b.family));
  const worst = worstExposure(exposed);
  return {
    spaceKey: input.spaceKey,
    question: PRE_ACTIVATION_QUESTION_FR,
    scannedFoyers: input.foyers.length,
    exposedFoyers: exposed.length,
    presumedIndexedFoyers: exposed.filter((foyer) => foyer.presumedIndexed).length,
    byFamily,
    maxExposure: worst ? { foyerId: worst.id, family: worst.family, score: worst.score } : null,
    blindSpots: [...BASE_BLIND_SPOTS_FR, ...(input.blindSpots ?? [])],
    generatedAt: input.now ?? new Date().toISOString(),
  };
}
