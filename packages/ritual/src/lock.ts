/**
 * Le verrou central du rituel (PW-09, §9, recette §25.7) :
 * **l'étape 2 (caviarder) est verrouillée tant que la rotation n'a pas été
 * attestée par une personne** — jamais par l'app, jamais par un agent.
 *
 * Adaptation wiki du verrou d'ordre de `@placard/ritual` (PLA-F-23 : pas de
 * purge avant rotation) : ici le verrou porte sur le caviardage, et la preuve
 * exigée est une `RotationAttestation` humaine (ou les champs équivalents
 * déjà enregistrés sur le foyer : `rotatedAt` + `rotationEvidenceRef`).
 */

import type { Foyer, RitualStepState, RotationAttestation } from '@placard-wiki/domain';
import { RITUAL_STEPS } from '@placard-wiki/domain';

/** Raison du verrou, affichée telle quelle (§9 : le verrou s'explique). */
export const REDACT_LOCK_REASON =
  'Caviarder est verrouillé tant que la rotation n’a pas été attestée par une ' +
  'personne : retirer un texte dont la clé est encore vivante ne protège rien ' +
  '(PW-09, recette §25.7). Déposez une attestation avec lien vers la preuve.';

/** États du foyer qui supposent une rotation déjà attestée. */
const POST_ROTATION_STATES = new Set<string>([
  'rotation-attested',
  'redacted',
  'purge-requested',
  'purged',
  'purge-impossible',
  'sealed',
]);

/** L'attestation est-elle valide pour ce foyer (humaine, datée, avec preuve) ? */
export function attestationUnlocks(foyer: Foyer, attestation?: RotationAttestation): boolean {
  if (attestation === undefined) return false;
  return (
    attestation.actorKind === 'human' &&
    attestation.foyerId === foyer.id &&
    attestation.strength === 'attested' &&
    attestation.evidenceRef.trim() !== '' &&
    attestation.attestedAt !== ''
  );
}

/**
 * PW-09 : `canRedact(foyer) === false` sans attestation humaine. Le verrou
 * cède si une attestation valide est fournie, ou si le foyer porte déjà la
 * trace d'une rotation attestée (`rotatedAt` + `rotationEvidenceRef`).
 */
export function canRedact(foyer: Foyer, attestation?: RotationAttestation): boolean {
  if (attestationUnlocks(foyer, attestation)) return true;
  const fromFoyer =
    foyer.rotatedAt !== undefined &&
    foyer.rotatedAt !== '' &&
    foyer.rotationEvidenceRef !== undefined &&
    foyer.rotationEvidenceRef.trim() !== '' &&
    POST_ROTATION_STATES.has(foyer.state);
  return fromFoyer;
}

function step(foyerId: string, name: string, state: RitualStepState['state'], note?: string): RitualStepState {
  return { foyerId, step: name, state, ...(note !== undefined ? { note } : {}) };
}

function redactStepState(foyer: Foyer, unlocked: boolean): RitualStepState {
  if (!unlocked) return step(foyer.id, 'redact', 'locked', REDACT_LOCK_REASON);
  const done = foyer.state !== 'rotation-attested' && POST_ROTATION_STATES.has(foyer.state) && foyer.state !== 'redacted'
    ? false
    : foyer.state === 'redacted' || foyer.state === 'sealed';
  return step(foyer.id, 'redact', done ? 'done' : 'pending');
}

/**
 * Les cinq étapes du rituel dans l'ordre imposé (`RITUAL_STEPS`, domaine —
 * jamais redéfini ici), avec leurs verrous écrits.
 */
export function ritualStepStates(foyer: Foyer, attestation?: RotationAttestation): RitualStepState[] {
  const unlocked = canRedact(foyer, attestation);
  const rotate = step(
    foyer.id,
    'rotate',
    unlocked ? 'done' : 'pending',
    unlocked ? undefined : 'En attente d’une attestation humaine avec lien vers la preuve.',
  );
  const purge = step(
    foyer.id,
    'purge',
    unlocked ? (foyer.state === 'purged' || foyer.state === 'sealed' ? 'done' : 'pending') : 'locked',
    unlocked ? undefined : 'La purge suit le caviardage, qui suit la rotation attestée (§9).',
  );
  return [
    rotate,
    redactStepState(foyer, unlocked),
    purge,
    step(foyer.id, 'prevent', 'pending'),
    step(foyer.id, 'verify', foyer.state === 'sealed' ? 'done' : 'pending'),
  ].map((s) => ({ ...s, step: s.step }));
}

/** Vérifie que le plan couvre bien les cinq étapes, dans l'ordre du domaine. */
export function stepsInOrder(states: RitualStepState[]): boolean {
  return states.map((s) => s.step).join(',') === RITUAL_STEPS.join(',');
}
