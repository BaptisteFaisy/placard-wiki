/**
 * La mesure de couverture d'un gîte est **cumulée à la journée** : une passe
 * incrémentale qui ne trouve rien de neuf (0 page lue) ne doit PAS effacer la
 * mesure de la journée — sinon le pourcentage retombe à 0 % après la première
 * passe et le chiffre affiché aux juges ment.
 *
 * Règle : on garde le **plus haut** de chaque compteur vu dans la journée
 * (pages lues / non lues / inaccessibles) — c'est une borne haute honnête :
 * « au mieux vu aujourd'hui », et la méthode du rapport le dit.
 * Un jour nouveau repart de zéro (la ligne est remplacée, pas fusionnée).
 *
 * Module unique partagé par les deux dépôts (SQL et mémoire) : une seule
 * implémentation de la règle.
 */

import type { GiteScanRecord } from './ports';

/** Le jour (YYYY-MM-DD) d'un horodatage ISO. */
export function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Deux horodatages appartiennent-ils à la même journée ? */
export function sameDay(a: string, b: string): boolean {
  return dayOf(a) === dayOf(b);
}

/**
 * Fusionne la mesure d'un gîte : la plus haute de la journée, la raison la
 * plus récente (la dernière passe qui parle), et l'horodatage de la dernière
 * passe.
 */
export function mergeGiteScan(
  previous: GiteScanRecord | undefined,
  next: GiteScanRecord,
): GiteScanRecord {
  if (previous === undefined) return next;
  if (!sameDay(previous.passAt, next.passAt)) return next;
  return {
    gite: next.gite,
    pagesRead: Math.max(previous.pagesRead, next.pagesRead),
    pagesUnread: Math.max(previous.pagesUnread, next.pagesUnread),
    pagesInaccessible: Math.max(previous.pagesInaccessible, next.pagesInaccessible),
    reason: next.reason !== '' ? next.reason : previous.reason,
    passAt: next.passAt,
  };
}
