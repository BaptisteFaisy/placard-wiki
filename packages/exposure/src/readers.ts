/**
 * Lecteurs potentiels (§8) : une FOURCHETTE, jamais un nombre exact, parce que
 * l'app ne résout pas toujours les groupes imbriqués. Toujours avec sa méthode
 * et ses droits manquants déclarés (« pas de droit » ≠ « pas de données », §23).
 */

import type { ReadersRange, SharingState } from '@placard-wiki/domain';

/** La méthode, affichée avec la fourchette (§8 : aucune exposition sans sa méthode). */
export const READERS_METHOD_FR =
  'Permissions de l’espace + restrictions de la page + état du partage. ' +
  'Les groupes imbriqués non résolus élargissent la fourchette au lieu d’être devinés ; ' +
  'un droit manquant sur le graphe est déclaré, jamais remplacé par un zéro silencieux.';

/** Une restriction de page : utilisateur nommé, ou groupe (parfois non résolu). */
export interface RestrictionEntry {
  type: 'user' | 'group';
  name: string;
  /** Effectif connu du groupe ; absent = groupe imbriqué non résolu. */
  memberCount?: number;
}

/** Ce qu'on sait de l'audience de l'espace. */
export interface SpaceReadership {
  /** Lecteurs de l'espace, si les permissions ont pu être lues. */
  low?: number;
  high?: number;
}

/** Entrée de `readersRange`. */
export interface ReadersInput {
  space: SpaceReadership;
  restrictions: readonly RestrictionEntry[];
  sharing: SharingState;
  /** Effectif total du site — plafond naturel d'un partage public. */
  siteUsers?: number;
  /** Droits manquants sur le graphe de permissions (§25.18). */
  missingRights?: readonly string[];
}

/** Somme des restrictions lisibles : plancher certain, et groupes non résolus. */
function sumRestrictions(restrictions: readonly RestrictionEntry[]): { known: number; unresolved: number } {
  let known = 0;
  let unresolved = 0;
  for (const restriction of restrictions) {
    if (restriction.type === 'user') known += 1;
    else if (restriction.memberCount !== undefined) known += restriction.memberCount;
    else unresolved += 1;
  }
  return { known, unresolved };
}

/** Plafond imposé par le partage : public / « anyone with link » = tout le site. */
function sharingCeiling(input: ReadersInput, caveats: string[]): number | null {
  if (input.sharing !== 'public' && input.sharing !== 'anyone-with-link') return null;
  if (input.siteUsers !== undefined) return input.siteUsers;
  caveats.push('Partage public actif mais audience du site inconnue : la borne haute reste celle de l’espace.');
  return null;
}

/**
 * Fourchette de lecteurs potentiels d'une page (§8).
 * Ordre de décision : restrictions de la page → permissions de l'espace →
 * état du partage (plafond) → droits manquants (caveats, jamais de zéro muet).
 */
export function readersRange(input: ReadersInput): ReadersRange {
  const caveats: string[] = [];
  let low = 0;
  let high = 0;
  if (input.restrictions.length > 0) {
    const { known, unresolved } = sumRestrictions(input.restrictions);
    low = known;
    high = known;
    if (unresolved > 0) {
      // Groupes imbriqués non résolus : la fourchette s'élargit jusqu'à l'espace.
      high = Math.max(high, input.space.high ?? high);
      caveats.push(`${unresolved} groupe(s) imbriqué(s) non résolu(s) : borne haute élargie à l’audience de l’espace.`);
    }
  } else if (input.space.low !== undefined && input.space.high !== undefined) {
    low = input.space.low;
    high = input.space.high;
  } else {
    caveats.push('Permissions de l’espace illisibles : exposition inconnue — « pas de droit » ≠ « pas de données ».');
    high = input.siteUsers ?? 0;
  }
  if (input.sharing === 'restricted' && input.restrictions.length === 0) {
    caveats.push('Partage déclaré « restreint » mais aucune restriction lisible : la fourchette reste celle de l’espace.');
  }
  const ceiling = sharingCeiling(input, caveats);
  if (ceiling !== null) high = Math.max(high, ceiling);
  for (const right of input.missingRights ?? []) {
    caveats.push(`Droit manquant sur le graphe : ${right} — « pas de droit » ≠ « pas de données ».`);
  }
  low = Math.max(0, Math.round(low));
  high = Math.max(low, Math.round(high));
  return { low, high, method: READERS_METHOD_FR, caveats };
}
