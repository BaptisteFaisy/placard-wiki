/**
 * Étape 1 du rituel (§9) : l'attestation de rotation.
 *
 * L'attestation est un fait horodaté posé **par une personne**, avec un lien
 * vers la preuve (ticket fournisseur, capture du journal d'audit). C'est une
 * preuve *attestée*, pas une preuve *machine* — et le registre le dit
 * (`strength: 'attested'`, la seule valeur possible).
 *
 * Verrou dur (§17, recette §25.8) : un **agent** ne peut pas attester. Le
 * refus est explicite, écrit, jamais silencieux.
 */

import type { RotationAttestation } from '@placard-wiki/domain';

import type { ClockPort } from './ports';

/** Les huit fournisseurs du rituel (§9) — liste fermée, `generic` compris. */
export const ROTATION_PROVIDERS = [
  'AWS',
  'GitHub',
  'Stripe',
  'OpenAI',
  'Slack',
  'Google Workspace',
  'internal-db',
  'generic',
] as const;

export type RotationProvider = (typeof ROTATION_PROVIDERS)[number];

/** Le fournisseur est-il dans la liste fermée du §9 ? */
export function isKnownProvider(provider: string): provider is RotationProvider {
  return (ROTATION_PROVIDERS as readonly string[]).includes(provider);
}

/** Charge d'une demande d'attestation (calquée sur `ritual/attest`, bridge). */
export interface AttestRotationInput {
  foyerId: string;
  provider: string;
  evidenceRef: string;
  actorRef: string;
  /** Un agent est refusé (§17) : l'attestation est humaine. */
  actorKind: 'human' | 'agent';
}

export type AttestRotationResult =
  | { ok: true; attestation: RotationAttestation }
  | { ok: false; reason: string };

function refuse(reason: string): AttestRotationResult {
  return { ok: false, reason };
}

/** Refus écrits — jamais de refus silencieux (§5). */
export const REFUSAL_AGENT =
  'Un agent ne peut pas attester une rotation (§17, recette §25.8) : ' +
  "l'attestation est un fait horodaté posé par une personne, avec un lien vers la preuve.";
export const REFUSAL_NO_EVIDENCE =
  "Attestation refusée : le lien vers la preuve est vide. Une attestation sans preuve " +
  "(ticket fournisseur, capture du journal d'audit) n'est pas une attestation.";
export const REFUSAL_UNKNOWN_PROVIDER =
  'Attestation refusée : fournisseur inconnu. Liste attendue : ' + ROTATION_PROVIDERS.join(', ') + '.';

/**
 * Valide la demande et produit l'attestation horodatée `strength: 'attested'`.
 * Toute donnée posée par le rituel passe par `clock` (jamais `Date.now()` en
 * direct) — la date est celle de l'attestation, jamais celle de la clé (§20).
 */
export function attestRotation(input: AttestRotationInput, clock: ClockPort): AttestRotationResult {
  if (input.actorKind !== 'human') return refuse(REFUSAL_AGENT);
  if (input.foyerId.trim() === '') return refuse('Attestation refusée : foyer absent (foyerId vide).');
  if (input.actorRef.trim() === '') {
    return refuse("Attestation refusée : l'attestation est nominative — acteur vide.");
  }
  if (input.evidenceRef.trim() === '') return refuse(REFUSAL_NO_EVIDENCE);
  if (!isKnownProvider(input.provider)) return refuse(REFUSAL_UNKNOWN_PROVIDER);
  const attestation: RotationAttestation = {
    foyerId: input.foyerId,
    actorRef: input.actorRef,
    actorKind: 'human',
    provider: input.provider,
    evidenceRef: input.evidenceRef.trim(),
    attestedAt: clock.now(),
    strength: 'attested',
  };
  return { ok: true, attestation };
}
