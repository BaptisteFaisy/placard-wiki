/**
 * Une empreinte, plusieurs emplacements (§11) : le vrai travail n'est pas de
 * trouver un secret, c'est de trouver **tous** ses emplacements.
 *
 * Le foyer regroupe N emplacements (pages, versions, commentaires, pièces
 * jointes, modèles) sous une empreinte et un état de réparation unique.
 * L'ordre compte : le modèle est traité en premier, sinon il recopie le
 * secret dans les pages créées ensuite.
 *
 * La propagation est datée : « recopié 4 fois entre mars et octobre, dont une
 * fois par duplication de page » — une information sur les habitudes de
 * l'équipe, pas sur les personnes.
 *
 * Squelette — le lot « propagation » implémente le regroupement et la datation.
 */

export const PACKAGE_NAME = '@placard-wiki/propagation';
export const PACKAGE_STATUS = 'skeleton' as const;
