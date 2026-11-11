/**
 * PW-23 — « Pas de fuite par le scanner » (§23) et « personne sans droit de
 * lecture sur une page signalée : existence et propriétaire seulement, jamais
 * le contenu » (§24).
 *
 * Le scanner ne doit pas devenir un moyen d'apprendre ce qu'on n'a pas le
 * droit de lire : sans droit de lecture, la vue se réduit à un agrégat
 * d'espace (existence + propriétaire) — jamais l'empreinte, la famille, le
 * score, l'aperçu masqué ni les emplacements du foyer.
 *
 * Limite assumée : `callerCanReadPage` porte sur la page principale du foyer.
 * Quand un foyer s'étend sur plusieurs pages (§11), c'est l'appelant
 * (forge-app) qui calcule la conjonction des droits sur TOUS les emplacements
 * avant de passer `true`.
 */

import type { Foyer } from '@placard-wiki/domain';

/** Vue complète : l'appelant peut lire la page où vit le foyer. */
export interface FullFoyerView {
  kind: 'full';
  foyer: Foyer;
}

/** Agrégat d'espace : existence + propriétaire, et rien d'autre (PW-23). */
export interface SpaceAggregateView {
  kind: 'space-aggregate';
  exists: true;
  spaceKey: string;
  /** Propriétaire nommé pour l'audit — jamais classé (§23). */
  ownerRef?: string;
}

/** Ce qu'un appelant donné peut voir d'un foyer. */
export type FoyerView = FullFoyerView | SpaceAggregateView;

/** Clé d'espace affichée quand le foyer n'en déclare pas. */
export const UNKNOWN_SPACE_KEY = 'inconnu';

/** Foyer complet si la lecture est autorisée, sinon agrégat d'espace (PW-23). */
export function visibleTo(callerCanReadPage: boolean, foyer: Foyer, ownerRef?: string): FoyerView {
  if (callerCanReadPage) return { kind: 'full', foyer };
  const view: SpaceAggregateView = {
    kind: 'space-aggregate',
    exists: true,
    spaceKey: foyer.spaceKey ?? UNKNOWN_SPACE_KEY,
  };
  if (ownerRef !== undefined) view.ownerRef = ownerRef;
  return view;
}
