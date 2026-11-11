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
 * Le lot « wiki-source » est implémenté :
 * - les sept gîtes (§6) comme lecteurs distincts (`readers/`) ;
 * - le port `ConfluenceClient` et son implémentation HTTP à fetch injectable
 *   (chemins v1/v2 **à valider semaine 1**, §22) ;
 * - la pagination par curseur et la reprise (balayage borné, §14) ;
 * - l'état de partage et les restrictions (entrée de @placard-wiki/exposure) ;
 * - les fichiers non lus et pourquoi (couverture déclarée, jamais de silence).
 */

export const PACKAGE_NAME = '@placard-wiki/wiki-source';
export const PACKAGE_STATUS = 'implemented' as const;

export * from './types.js';
export * from './api.js';
export * from './http-client.js';
export * from './readers/index.js';
export * from './cql.js';
export * from './cursor.js';
export * from './fixture-client.js';
