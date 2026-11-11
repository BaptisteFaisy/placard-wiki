/**
 * Ordre du lot de caviardage (§11) : **le modèle d'abord**, sinon il recopie
 * le secret dans les pages créées ensuite ; puis la version courante ; puis
 * exposition décroissante. Les emplacements déjà traités (`redacted`) ou
 * disparus (`vanished`, §24) sortent du lot — rien à caviarder.
 */

import type { Foyer, FoyerLocation } from '@placard-wiki/domain';

/** Résultat de l'ordonnancement du lot de caviardage. */
export interface RedactionOrder {
  /** Emplacements à traiter, dans l'ordre — chacun aura son diff (§9). */
  orderedLocations: FoyerLocation[];
  /** `true` si le premier emplacement du lot est un modèle de page. */
  templateFirst: boolean;
  /** Emplacements déjà caviardés ou disparus, exclus du lot (information). */
  exclus: FoyerLocation[];
}

/**
 * Étier d'ordonnancement (§11) :
 *   0 — modèle de page (amplification : chaque nouvelle page recopie) ;
 *   1 — version courante (corps, commentaire, pièce jointe, titre, espace) ;
 *   2 — historique de versions (le caviardage n'y peut rien : purge, §9).
 */
function étierDe(loc: FoyerLocation): number {
  if (loc.containerType === 'template') return 0;
  if (loc.containerType === 'version') return 2;
  return 1;
}

/**
 * Ordonne le lot de caviardage d'un foyer.
 *
 * `expositionParPage` (pageId → score d'exposition 0-100, calculé par le lot
 * `exposure`) est optionnel : sans lui, le tri dans chaque étier retombe sur
 * l'ordre chronologique de détection. Limite documentée : l'exposition des
 * commentaires et pièces jointes est approximée par celle de leur page.
 */
export function redactionOrder(
  foyer: Foyer,
  expositionParPage?: ReadonlyMap<string, number>,
): RedactionOrder {
  const àTraiter = foyer.locations.filter((l) => l.status === 'present');
  const exclus = foyer.locations.filter((l) => l.status !== 'present');

  const ordonnés = [...àTraiter].sort((a, b) => {
    const étier = étierDe(a) - étierDe(b);
    if (étier !== 0) return étier;
    if (expositionParPage !== undefined) {
      const expo = (expositionParPage.get(b.pageId) ?? 0) - (expositionParPage.get(a.pageId) ?? 0);
      if (expo !== 0) return expo;
    }
    if (a.detectedAt !== b.detectedAt) return a.detectedAt < b.detectedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    orderedLocations: ordonnés,
    templateFirst: ordonnés[0]?.containerType === 'template',
    exclus,
  };
}
