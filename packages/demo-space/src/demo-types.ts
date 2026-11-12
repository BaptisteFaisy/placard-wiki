/**
 * Types du rapport de la démo jouable (`pnpm demo`).
 *
 * Le rapport est le **storyboard** du produit : ce que la passe a détecté,
 * ce qu'elle a regroupé, comment elle a noté le danger, ce que le rituel a
 * fait — et ce qu'il n'a pas pu faire.
 *
 * Règle absolue : aucun de ces types ne porte de valeur brute de secret.
 * Les emplacements portent l'aperçu masqué (`[REDACTED:famille](n)`), les
 * foyers portent l'empreinte HMAC, les scores portent leurs termes.
 */

import type { AppliedScoreTerm, Certificate, RedactionDiff } from '@placard-wiki/domain';

/** Ce que la passe a fait (§14) — les compteurs, jamais masqués. */
export interface DemoSweep {
  mode: string;
  scope: string;
  pagesScanned: number;
  attachmentsRead: number;
  attachmentsSkipped: number;
  llmCalls: number;
  foyersTouched: number;
  durationMs: number;
  blindSpots: string[];
}

/** Ce que la passe a trouvé, une fois regroupée en foyers. */
export interface DemoScores {
  /** Nombre de foyers distincts (une empreinte = un foyer). */
  foyers: number;
  /** Nombre d'emplacements (un foyer peut dormir à N endroits). */
  emplacements: number;
  /** Score de danger maximal, 0-100. */
  dangerMax: number;
  /** Famille du foyer le plus dangereux. */
  dangerMaxFamily: string;
  /** Répartition des emplacements par gîte (§6). */
  parGite: Record<string, number>;
  /** Nombre de secrets factices plantés dans l'espace de démonstration. */
  plantes: number;
}

/** Un emplacement montré dans le rapport : l'aperçu masqué, jamais la valeur. */
export interface DemoLocation {
  gite: string;
  pageId: string;
  containerType: string;
  maskedPreview: string;
  status: string;
}

/** Le foyer suivi de bout en bout dans la démo. */
export interface DemoFoyer {
  id: string;
  family: string;
  familyLabel: string;
  score: number;
  scoreTerms: AppliedScoreTerm[];
  locations: DemoLocation[];
}

/** Une étape du rituel, avec son état et sa note. */
export interface DemoStep {
  step: string;
  state: string;
  note?: string;
}

/** Le rituel joué sur le foyer le plus dangereux. */
export interface DemoRitual {
  foyerId: string;
  family: string;
  score: number;
  /** Les deux refus qui protègent la rotation et le caviardage, avant l'attestation. */
  verrou: {
    /** Un agent ne peut pas attester une rotation (§17). */
    refusAgent: string;
    /** Caviarder est verrouillé sans attestation humaine (PW-09). */
    refusCaviardage: string;
  };
  /** L'attestation humaine posée. */
  attestation: { provider: string; attestedAt: string; actorRef: string; state: string };
  /** Le caviardage : diffs masqués et application au nom de la personne. */
  redaction: {
    diffs: RedactionDiff[];
    templateFirst: string[];
    applied: number;
    asUser: string;
    versionComment: string;
    state: string;
  };
  /** La purge : impossible, documentée, foyer laissé ouvert. */
  purge: {
    apiCanPurge: boolean;
    blockedReason: string;
    adminBrief: string;
    state: string;
  };
  /** Les cinq étapes du rituel, dans l'ordre du domaine. */
  steps: DemoStep[];
}

/** Le rapport complet — le storyboard, en données. */
export interface DemoReport {
  scenario: string;
  offline: boolean;
  sweep: DemoSweep;
  scores: DemoScores;
  foyer: DemoFoyer;
  ritual: DemoRitual;
  certificate: Certificate;
  /** Les avertissements de la démo (angles morts, couverture). */
  avertissements: string[];
}
