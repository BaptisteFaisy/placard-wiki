/**
 * Le masquage de la démo — une seule règle : **rien de lisible ne sort**.
 *
 * Le diff de caviardage du produit montre la ligne entière, cible masquée ;
 * sur une ligne qui contient plusieurs valeurs (un tableau d'identifiants),
 * les voisins restent donc visibles. C'est un choix d'affichage du produit ;
 * la démo, elle, ne peut rien laisser fuir : elle masque **tous** les
 * secrets de la ligne avant de la montrer.
 *
 * Le masquage réutilise le moteur de détection (`scanItem`) : mêmes familles,
 * mêmes aperçus que le registre — `[REDACTED:famille](n)` ou `AKIA...(20)`.
 */

import { scanItem } from '../../detectors/src/index';
import type { RedactionDiff } from '@placard-wiki/domain';

import { SECRET_FIXTURES } from './fixtures/index';

/** Masque tous les secrets d'une ligne, un par un, avec leur aperçu masqué. */
export function masquerLigne(ligne: string, hmacKey: string): string {
  const candidats = scanItem({ containerType: 'page', field: 'body', text: ligne }, { hmacKey });
  const spans = [...candidats].sort((a, b) => a.charStart - b.charStart);
  let sortie = '';
  let curseur = 0;
  for (const candidat of spans) {
    if (candidat.charEnd <= candidat.charStart) continue;
    if (candidat.charStart < curseur) continue;
    sortie += ligne.slice(curseur, candidat.charStart) + candidat.maskedPreview;
    curseur = candidat.charEnd;
  }
  return sortie + ligne.slice(curseur);
}

/** Masque une ligne en laissant intact un fragment (le marqueur de remplacement). */
export function masquerEnGarder(ligne: string, aGarder: string, hmacKey: string): string {
  if (aGarder === '') return masquerLigne(ligne, hmacKey);
  return ligne
    .split(aGarder)
    .map((partie) => masquerLigne(partie, hmacKey))
    .join(aGarder);
}

/** Un diff de caviardage dont les deux lignes sont intégralement masquées. */
export function masquerDiff(diff: RedactionDiff, hmacKey: string): RedactionDiff {
  return {
    ...diff,
    maskedBefore: masquerLigne(diff.maskedBefore, hmacKey),
    after: masquerEnGarder(diff.after, diff.replacement, hmacKey),
  };
}

/** Les valeurs factices plantées dans l'espace de démo — jamais écrites en clair. */
export function valeursFactices(): string[] {
  return SECRET_FIXTURES.map((fixture) => fixture.value).filter((value) => value.length >= 6);
}

/** Première valeur brute trouvée dans un texte, ou `undefined` si le texte est propre. */
export function valeurBruteDans(texte: string): string | undefined {
  return valeursFactices().find((valeur) => texte.includes(valeur));
}
