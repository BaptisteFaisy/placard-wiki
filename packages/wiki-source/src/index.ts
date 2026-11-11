/**
 * Lecteurs Confluence (§21 : `packages/wiki-source`) — page, version,
 * commentaire, pièce jointe, modèle, description d'espace ; CQL ; curseurs de
 * reprise. Aucune logique de détection ici : ce paquet ramène du contenu et
 * des métadonnées, il ne juge rien.
 *
 * Règle : le contenu lu ne quitte jamais la mémoire d'une exécution sous
 * forme brute — les seules sorties persistées passent par empreinte et aperçu
 * masqué (voir @placard/core).
 *
 * Squelette — le lot « wiki-source » implémente :
 * - les sept gîtes (§6) comme sources distinctes ;
 * - la pagination par curseur (balayage borné, §14) ;
 * - l'état de partage et les restrictions (entrée de @placard-wiki/exposure) ;
 * - les fichiers non lus et pourquoi (couverture déclarée).
 */

export const PACKAGE_NAME = '@placard-wiki/wiki-source';
export const PACKAGE_STATUS = 'skeleton' as const;
