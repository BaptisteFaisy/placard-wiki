/**
 * Lot « propagation » (§11) : une empreinte, plusieurs emplacements.
 *
 * - `groupIntoFoyers` : regroupement empreinte → foyer, dédup, fusion,
 *   statuts par emplacement (present / redacted / vanished) ;
 * - `propagationTimeline` : « recopié N fois entre <mois> et <mois>, dont K
 *   par duplication de page » — heuristiques documentées, jamais d'acteur ;
 * - `redactionOrder` : le modèle d'abord, puis la version courante, puis
 *   exposition décroissante ;
 * - machine à états : transitions autorisées, sceau de cire, rubans
 *   revalidés quand la page change (§9, §25.12).
 */

export const PACKAGE_NAME = '@placard-wiki/propagation';
export const PACKAGE_STATUS = 'implemented' as const;

export * from './detection.js';
export * from './group.js';
export * from './timeline.js';
export * from './redaction-order.js';
export * from './state-machine.js';
