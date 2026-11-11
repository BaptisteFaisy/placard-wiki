/**
 * L'espace de démonstration (§15, PW-20) : le site des juges ne contient
 * rien, donc l'app apporte son propre contenu — un faux secret de chaque
 * famille, planté dans chaque gîte (page, commentaire, pièce jointe, version
 * historique, modèle, titre, page partagée publiquement).
 *
 * C'est la démo **et** l'oracle de test : les fixtures servent aussi aux
 * tests des autres paquets. Tout est marqué comme synthétique, et les valeurs
 * viennent de @placard/core (fake-values) — jamais une valeur réelle.
 *
 * Squelette — le lot « demo-space » implémente le seed et les fixtures.
 */

export const PACKAGE_NAME = '@placard-wiki/demo-space';
export const PACKAGE_STATUS = 'skeleton' as const;
