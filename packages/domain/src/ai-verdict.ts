/**
 * Règle de décision « prêt à activer l'IA » (§13, §27) — logique PURE, sans
 * effet de bord. Elle transforme l'état réel (couverture, foyers ouverts,
 * foyers exposés à l'IA, exposition résiduelle) en un verdict daté à quatre
 * états. Les seuils sont paramétrables et justifiés ; aucun secret n'entre
 * dans ce calcul, que des compteurs et des fourchettes.
 */

import { GITES } from './vocabulary';
import type { Gite } from './vocabulary';
import type {
  AiActivationVerdictDetail,
  AiExposedFoyers,
  GiteCoverage,
  OpenFoyersSummary,
  ResidualAiExposure,
} from './types';

/** La méthode du décompte de couverture — affichée, jamais un ratio nu. */
export const GITE_COVERAGE_METHOD_FR =
  'Décompte des 7 gîtes du catalogue (§6) : un gîte est « couvert » quand la passe ' +
  'n’a enregistré ni page ni pièce jointe illisible pour lui. Les modèles de page et ' +
  'la description d’espace ne sont tenus pour couverts que par une passe sans page ' +
  'illisible (hypothèse conservatrice). Sans passe budgétée enregistrée, la couverture ' +
  'est inconnue.';

/** Entrée du décompte de couverture : les non-lus de la passe, jamais des chiffres inventés. */
export interface GiteCoverageInput {
  /** Pages non lues (droits manquants ou inaccessibles) lors de la passe. */
  skippedPages: number;
  /** Pièces jointes non lues lors de la passe. */
  skippedAttachments: number;
  /** Une passe budgétée a-t-elle été enregistrée ? Sans elle, couverture inconnue. */
  hasPass: boolean;
}

/**
 * Couverture en gîtes : couverts / total, avec les gîtes non couverts déclarés.
 * `known: false` quand aucune passe n'a laissé de budget — on ne peut alors
 * pas dire ce qu'il reste à balayer (§14 : la couverture se déclare, jamais
 * ne se devine).
 */
export function giteCoverageOf(input: GiteCoverageInput): GiteCoverage {
  const total = GITES.length;
  const uncovered = new Set<Gite>();
  // Une page illisible prive la passe de tous ses gîtes, modèles et
  // description d'espace inclus (hypothèse conservatrice, §19).
  if (input.skippedPages > 0) {
    uncovered.add('corps-de-page');
    uncovered.add('titres-et-etiquettes');
    uncovered.add('commentaires');
    uncovered.add('historique-de-versions');
    uncovered.add('pieces-jointes');
    uncovered.add('modeles-de-page');
    uncovered.add('description-espace');
  }
  // Des pièces jointes non lues laissent le gîte 3 incomplet, même sans page
  // illisible par ailleurs.
  if (input.skippedAttachments > 0) uncovered.add('pieces-jointes');
  return {
    covered: input.hasPass ? total - uncovered.size : 0,
    total,
    known: input.hasPass,
    method: GITE_COVERAGE_METHOD_FR,
    uncovered: [...uncovered].sort(),
  };
}

/**
 * Seuils de la règle de décision — paramétrables, défauts justifiés :
 *
 * - `dangerRefuse` (80) : un danger ≥ 80 correspond à une clé privée, un JWT
 *   signé ou un mot de passe en clair dans un emplacement très exposé
 *   (`computeDangerScore` place ces combinaisons dans la bande critique).
 *   Activer l'IA avec un tel foyer ouvert est refusé.
 * - `countRefuse` (5) : au-delà d'une poignée de foyers ouverts, l'exposition
 *   est systémique, pas ponctuelle — on refuse tant que le stock n'a pas été
 *   nettoyé.
 * - `readersRefuse` (100) : au-delà d'une petite équipe, donner à lire à
 *   l'assistant revient à exposer les secrets à une audience large. Le doute
 *   profite à la sécurité.
 */
export interface AiActivationThresholds {
  dangerRefuse: number;
  countRefuse: number;
  readersRefuse: number;
}

/** Défauts justifiés ci-dessus (§27). */
export const DEFAULT_AI_ACTIVATION_THRESHOLDS: AiActivationThresholds = {
  dangerRefuse: 80,
  countRefuse: 5,
  readersRefuse: 100,
};

/** Entrée de la règle de décision : l'état réel, déjà agrégé. */
export interface AiActivationDecisionInput {
  coverage: GiteCoverage;
  openFoyers: OpenFoyersSummary;
  aiExposedFoyers: AiExposedFoyers;
  residualExposure: ResidualAiExposure;
  thresholds?: Partial<AiActivationThresholds>;
}

/**
 * Verdict « prêt à activer l'IA » (§27). Ordre des règles, chacune écrite :
 *
 * 1. couverture inconnue → `indéterminé` (on ne conclut pas sans savoir ce
 *    qu'on n'a pas balayé) ;
 * 2. aucun foyer ouvert → `prêt` (rien ne sera donné à lire) ;
 * 3. danger maximal ≥ `dangerRefuse` → `refusé` ;
 * 4. nombre de foyers ouverts ≥ `countRefuse` → `refusé` ;
 * 5. foyers exposés à l'IA et lecteurs ≥ `readersRefuse` → `refusé` ;
 * 6. sinon → `à-nettoyer` (il reste des foyers, sous les seuils de refus).
 */
export function decideAiActivation(input: AiActivationDecisionInput): AiActivationVerdictDetail {
  const t: AiActivationThresholds = { ...DEFAULT_AI_ACTIVATION_THRESHOLDS, ...(input.thresholds ?? {}) };
  if (!input.coverage.known) {
    return {
      verdict: 'indéterminé',
      rule: 'Couverture inconnue : sans passe budgétée enregistrée, impossible de savoir quels gîtes n’ont pas été balayés — le certificat ne conclut pas (§27).',
    };
  }
  if (input.openFoyers.count === 0) {
    return {
      verdict: 'prêt',
      rule: 'Aucun foyer ouvert : rien ne sera donné à lire à l’assistant (§27).',
    };
  }
  if (input.openFoyers.maxDanger >= t.dangerRefuse) {
    return {
      verdict: 'refusé',
      rule: `Danger maximal des foyers ouverts ${input.openFoyers.maxDanger} ≥ ${t.dangerRefuse} (seuil de refus) — activation refusée tant qu’un foyer critique reste ouvert (§27).`,
    };
  }
  if (input.openFoyers.count >= t.countRefuse) {
    return {
      verdict: 'refusé',
      rule: `${input.openFoyers.count} foyers ouverts ≥ ${t.countRefuse} (seuil de refus) — exposition systémique, activation refusée tant que le stock n’est pas nettoyé (§27).`,
    };
  }
  if (input.aiExposedFoyers.count > 0 && input.residualExposure.readersHigh >= t.readersRefuse) {
    return {
      verdict: 'refusé',
      rule: `Exposition résiduelle haute ${input.residualExposure.readersHigh} ≥ ${t.readersRefuse} lecteurs (seuil de refus) sur ${input.aiExposedFoyers.count} foyer(s) exposé(s) à l’IA — activation refusée (§27).`,
    };
  }
  return {
    verdict: 'à-nettoyer',
    rule: `${input.openFoyers.count} foyer(s) ouvert(s) sous les seuils de refus — nettoyage requis avant toute activation de l’IA (§27).`,
  };
}