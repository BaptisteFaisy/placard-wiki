/**
 * Le ruban (faux positif écarté, §9, PW-16) : il exige **une raison écrite,
 * une personne et une date de révision** — les trois, jamais moins (recette
 * §25.12). Un ruban n'est pas éternel : il est revalidé quand la page change.
 *
 * Le ruban n'efface rien : le foyer passe en `dismissed`, l'emplacement reste
 * listé, et la raison écrite est conservée pour l'audit.
 */

import type { Foyer } from '@placard-wiki/domain';

import type { ClockPort } from './ports.js';

export interface RibbonInput {
  foyerId: string;
  /** Raison écrite — jamais vide (§25.12). */
  reason: string;
  /** La personne qui écarte le foyer — le ruban est nominatif. */
  actorRef: string;
  /** Date de révision (ISO) — un ruban n'est pas éternel. */
  reviewAt: string;
}

export type RibbonResult =
  | {
      ok: true;
      attachedAt: string;
      patch: {
        state: 'dismissed';
        dismissedReason: string;
        dismissedReviewAt: string;
      };
    }
  | { ok: false; reason: string };

/** Refus écrits (§25.12) — un ruban sans raison écrite est refusé. */
export const REFUSAL_NO_REASON =
  'Ruban refusé : la raison écrite est obligatoire (§25.12). « Faux positif » ' +
  "n'est pas une raison — dites pourquoi, pour qui, jusqu'à révision.";
export const REFUSAL_NO_ACTOR =
  'Ruban refusé : le ruban est nominatif — la personne qui écarte le foyer est requise (§25.12).';
export const REFUSAL_NO_REVIEW =
  'Ruban refusé : la date de révision est obligatoire (§25.12) — un ruban n’est pas éternel.';

/** Pose (ou revalide) le ruban : les trois champs obligatoires sont vérifiés. */
export function attachRibbon(input: RibbonInput, clock: ClockPort): RibbonResult {
  if (input.reason.trim() === '') return { ok: false, reason: REFUSAL_NO_REASON };
  if (input.actorRef.trim() === '') return { ok: false, reason: REFUSAL_NO_ACTOR };
  if (input.reviewAt.trim() === '' || Number.isNaN(new Date(input.reviewAt).getTime())) {
    return { ok: false, reason: REFUSAL_NO_REVIEW };
  }
  return {
    ok: true,
    attachedAt: clock.now(),
    patch: {
      state: 'dismissed',
      dismissedReason: input.reason.trim(),
      dismissedReviewAt: input.reviewAt,
    },
  };
}

/**
 * Le ruban doit-il être revalidé ? Dès que la page a changé **après** la pose
 * du ruban, l'écartement ne vaut plus : la détection repasse, le ruban est
 * revalidé ou retiré (§9, §25.12).
 */
export function ribbonNeedsRevalidation(ribbonAttachedAt: string, pageChangedAt: string): boolean {
  const attached = new Date(ribbonAttachedAt).getTime();
  const changed = new Date(pageChangedAt).getTime();
  if (Number.isNaN(attached) || Number.isNaN(changed)) return true;
  return changed > attached;
}

/**
 * Un foyer rubanné dont la page a changé redevient visible comme « à
 * revalider » : l'app ne prétend jamais qu'un ruban périmé tranche encore.
 */
export function dismissedStillHolds(foyer: Foyer, ribbonAttachedAt: string, pageChangedAt: string): boolean {
  if (foyer.state !== 'dismissed') return false;
  return !ribbonNeedsRevalidation(ribbonAttachedAt, pageChangedAt);
}
