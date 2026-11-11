/**
 * Oracle de l'espace de démonstration (§15) : le nombre **déclaré** de secrets
 * factices par `{ famille, gîte }`. Les tests de fixtures vérifient que les
 * fixtures plantent exactement ce qui est déclaré ici — le seed et l'oracle
 * lisent la même source (`FAMILY_LABELS`, `GITES`), donc aucun écart possible.
 */

import { FAMILY_LABELS, GITES, type Gite, type WikiFamily } from '@placard-wiki/domain';

/** Une ligne de l'oracle : famille × gîte, avec le compte attendu. */
export interface OracleEntry {
  readonly family: WikiFamily;
  readonly gite: Gite;
  /** Nombre de secrets attendus (deux pour `bank-data` : IBAN + carte). */
  readonly count: number;
}

/**
 * Les 77 entrées (11 familles × 7 gîtes), totalisant 84 secrets factices.
 * `count` est le nombre de numéros de la famille (`bank-data` → 2).
 */
export const DEMO_ORACLE: readonly OracleEntry[] = Object.freeze(
  GITES.flatMap(({ gite }) =>
    (Object.keys(FAMILY_LABELS) as readonly WikiFamily[]).map((family) => ({
      family,
      gite,
      count: FAMILY_LABELS[family].numbers.length,
    })),
  ),
);

/** Nombre total de secrets déclarés (84) — douze numéros × sept gîtes. */
export function totalDeclare(): number {
  return DEMO_ORACLE.reduce((somme, entree) => somme + entree.count, 0);
}