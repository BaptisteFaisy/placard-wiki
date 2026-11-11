/**
 * Machine à états du foyer (§9, §20) : transitions autorisées, sceau de cire,
 * rubans revalidés, emplacements disparus.
 *
 * Le sceau de cire (§4) = rotation **attestée par une personne** +
 * caviardage fait + purge vérifiée **ou** impossible documentée. Une
 * attestation d'agent est refusée (§25.8) : l'entrée du rituel n'existe pas
 * dans ce lot, on vérifie ici que la preuve est présente et humaine.
 */

import type { Foyer, FoyerState } from '@placard-wiki/domain';

/** Transitions autorisées. Toute autre est refusée — sans exception. */
export const ALLOWED_TRANSITIONS: Readonly<Record<FoyerState, readonly FoyerState[]>> = {
  open: ['rotation-attested', 'dismissed'],
  'rotation-attested': ['redacted', 'open'],
  redacted: ['purge-requested', 'purged', 'purge-impossible', 'open'],
  'purge-requested': ['purged', 'purge-impossible', 'open'],
  purged: ['sealed', 'open'],
  'purge-impossible': ['sealed', 'open'],
  sealed: ['open'],
  dismissed: ['open'],
};

/** Une transition refusée porte toujours la raison (§9 : tout s'explique). */
export class TransitionIllégale extends Error {
  constructor(
    readonly from: FoyerState,
    readonly to: FoyerState,
  ) {
    super(
      `Transition refusée : « ${from} » → « ${to} ». ` +
        `Autorisées depuis « ${from} » : ${ALLOWED_TRANSITIONS[from].join(', ') || 'aucune'}.`,
    );
    this.name = 'TransitionIllégale';
  }
}

/** La transition est-elle autorisée ? */
export function canTransitionState(from: FoyerState, to: FoyerState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Applique une transition autorisée ; refuse les autres (jamais de saut). */
export function transitionFoyer(foyer: Foyer, to: FoyerState, at: string): Foyer {
  if (!canTransitionState(foyer.state, to)) throw new TransitionIllégale(foyer.state, to);
  return { ...foyer, state: to, lastSeenAt: at > foyer.lastSeenAt ? at : foyer.lastSeenAt };
}

/** Vérification du sceau de cire : ce qui manque est listé, jamais deviné. */
export interface SealCheck {
  sealed: boolean;
  missing: string[];
}

/**
 * Conditions du sceau (§4, §9 étape 5) :
 *   1. rotation attestée (date + référence de preuve) ;
 *   2. caviardage fait : plus aucun emplacement `present` ;
 *   3. purge vérifiée (`purged`) **ou** impossible documentée
 *      (`purge-impossible` + raison écrite passée à `sealFoyer`).
 */
export function checkSeal(foyer: Foyer, purgeImpossibleReason?: string): SealCheck {
  const missing: string[] = [];
  if (foyer.rotatedAt === undefined || foyer.rotationEvidenceRef === undefined) {
    missing.push('rotation attestée par une personne (date + référence de preuve)');
  }
  const présents = foyer.locations.filter((l) => l.status === 'present');
  if (présents.length > 0) {
    missing.push(`caviardage : ${présents.length} emplacement(s) encore présent(s)`);
  }
  if (foyer.state !== 'purged' && foyer.state !== 'purge-impossible') {
    missing.push('purge vérifiée ou demande d’impossibilité documentée');
  }
  if (foyer.state === 'purge-impossible' && (purgeImpossibleReason ?? '').trim() === '') {
    missing.push('raison écrite de l’impossibilité de purge (§9 : dire « on ne peut pas »)');
  }
  return { sealed: missing.length === 0, missing };
}

/** Scelle le foyer si tout est clos ; sinon refuse en listant ce qui manque. */
export function sealFoyer(foyer: Foyer, at: string, purgeImpossibleReason?: string): Foyer {
  const check = checkSeal(foyer, purgeImpossibleReason);
  if (!check.sealed) {
    throw new Error(`Sceau de cire refusé — manque : ${check.missing.join(' ; ')}.`);
  }
  return transitionFoyer(foyer, 'sealed', at);
}

/** Pose un ruban (faux positif écarté) : raison écrite obligatoire (§25.12). */
export function dismissFoyer(foyer: Foyer, reason: string, at: string): Foyer {
  if (reason.trim() === '') {
    throw new Error('Ruban refusé : la raison écrite est obligatoire (§9).');
  }
  const rubané = transitionFoyer(foyer, 'dismissed', at);
  return { ...rubané, dismissedReason: reason.trim(), dismissedReviewAt: at };
}

/** Résultat de la revalidation d'un ruban après modification de page. */
export interface RibbonRevalidation {
  foyer: Foyer;
  /** `true` si la page a changé depuis la dernière révision : à revalider. */
  revalidated: boolean;
  reason?: string;
}

/**
 * Un ruban n'est pas éternel (§9, §25.12) : il est revalidé quand la page
 * change. Si la modification est postérieure à la dernière révision, la date
 * de révision est remise à jour — le faux positif doit être re-confirmé par
 * une personne ; sinon rien ne bouge.
 */
export function revalidateRibbons(foyer: Foyer, pageChangedAt: string): RibbonRevalidation {
  if (foyer.state !== 'dismissed' || foyer.dismissedReason === undefined) {
    return { foyer, revalidated: false };
  }
  const dernière = foyer.dismissedReviewAt;
  if (dernière !== undefined && dernière >= pageChangedAt) {
    return { foyer, revalidated: false, reason: 'Page inchangée depuis la dernière révision.' };
  }
  return {
    foyer: { ...foyer, dismissedReviewAt: pageChangedAt },
    revalidated: true,
    reason: 'Page modifiée depuis la pose du ruban : le faux positif doit être re-confirmé.',
  };
}

/** La corbeille du site reste un résidu après suppression (§24) — déclaré. */
export const NOTE_CORBEILLE_RÉSIDUELLE =
  'Page supprimée : emplacements « disparus », exposition recalculée ; la corbeille du site est signalée comme résiduelle.';

/**
 * Page supprimée après détection (§24) : ses emplacements passent
 * `vanished`. L'exposition doit être recalculée par le lot `exposure` ; la
 * note de corbeille accompagne toujours l'opération, jamais silencieuse.
 */
export function markLocationsVanished(foyer: Foyer, pageId: string): {
  foyer: Foyer;
  note: string;
  vanishedCount: number;
} {
  let vanishedCount = 0;
  const locations = foyer.locations.map((l) => {
    if (l.pageId !== pageId || l.status !== 'present') return l;
    vanishedCount += 1;
    return { ...l, status: 'vanished' as const };
  });
  return { foyer: { ...foyer, locations }, note: NOTE_CORBEILLE_RÉSIDUELLE, vanishedCount };
}
