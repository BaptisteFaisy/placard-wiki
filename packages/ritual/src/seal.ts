/**
 * Le sceau de cire (§9) : un foyer ne se scelle que si le rituel est complet.
 *
 * Trois conditions, cumulatives :
 *
 * 1. rotation **attestée par une personne** (PW-09) ;
 * 2. caviardage **fait** ;
 * 3. purge **vérifiée** (la version n'est plus lisible) **ou** purge
 *    **impossible documentée** (la raison écrite).
 *
 * Les deux issues de la condition 3 sont **distinctes**, et le code de statut
 * le dit : `purge-verifiee` ≠ `purge-impossible-documentee`. Un sceau posé sur
 * une purge impossible n'affirme **pas** que l'historique a été effacé — il
 * affirme que l'impossibilité est documentée. C'est la distinction que le
 * registre doit garder.
 */

import type { Foyer, RotationAttestation } from '@placard-wiki/domain';

import { canRedact } from './lock';

/** La base du sceau : deux états distincts, jamais confondus. */
export type PurgeBasis = 'purge-verifiee' | 'purge-impossible-documentee';

/** Les libellés affichés, pour un lecteur humain. */
export const PURGE_BASIS_LABELS: Record<PurgeBasis, string> = {
  'purge-verifiee': 'Purge vérifiée — la version n’est plus lisible.',
  'purge-impossible-documentee':
    'Purge impossible documentée — l’historique reste lisible, l’impossibilité est écrite.',
};

/** Les états du foyer qui impliquent un caviardage déjà fait. */
const POST_REDACTION_STATES = new Set<string>([
  'redacted', 'purge-requested', 'purged', 'purge-impossible', 'sealed',
]);

export interface SealInput {
  foyer: Foyer;
  attestation?: RotationAttestation;
  /** La purge a été vérifiée : la version visée n'est plus lisible. */
  purgeVerified?: boolean;
  /** La purge est impossible : la raison écrite, qui fait foi. */
  purgeImpossibleReason?: string;
}

export type SealOutcome =
  | { ok: true; basis: PurgeBasis; state: 'sealed'; note: string }
  | { ok: false; reason: string };

/**
 * Le sceau :rotation attestée + caviardage fait + purge vérifiée ou
 * impossible documentée. Pure — la persistance est du ressort de l'appelant.
 */
export function sealFoyer(input: SealInput): SealOutcome {
  const { foyer } = input;
  if (!canRedact(foyer, input.attestation)) {
    return {
      ok: false,
      reason:
        'Le sceau exige une rotation attestée par une personne : sans attestation humaine, ' +
        'le foyer reste ouvert (PW-09).',
    };
  }
  if (!POST_REDACTION_STATES.has(foyer.state)) {
    return { ok: false, reason: 'Le sceau exige un caviardage effectué : le foyer n’en est pas à ce stade.' };
  }
  if (input.purgeVerified === true) {
    return { ok: true, basis: 'purge-verifiee', state: 'sealed', note: PURGE_BASIS_LABELS['purge-verifiee'] };
  }
  const reason = input.purgeImpossibleReason?.trim() ?? '';
  if (reason !== '') {
    return {
      ok: true,
      basis: 'purge-impossible-documentee',
      state: 'sealed',
      note: `${PURGE_BASIS_LABELS['purge-impossible-documentee']} Motif : ${reason}`,
    };
  }
  return {
    ok: false,
    reason:
      'Le sceau exige une purge vérifiée, ou une purge impossible documentée : ' +
      'ni l’une ni l’autre n’est établie pour ce foyer.',
  };
}
