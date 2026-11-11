/**
 * Le port Confluence (§21) : l'unique façon dont le paquet parle au wiki.
 *
 * `fetch` est injectable : en production Forge, un adaptateur `asRequest()`
 * l'habille ; en test, le client mémoire (`fixture-client.ts`) implémente le
 * même port sans aucun réseau. Aucune logique de détection ici.
 *
 * ⚠ Chemins d'API v1/v2 **à valider semaine 1** (§22) : les constantes
 * `ENDPOINTS` ci-dessous sont l'hypothèse documentée issue de la lecture de la
 * documentation du 11 novembre 2026 ; `forge lint` + un prototype réel doivent
 * les confirmer avant déploiement. Le port, lui, ne change pas.
 */

/** Réponse HTTP minimale — ce dont le port a besoin, rien de plus. */
export interface ResponseLike {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Fetch injectable (adaptateur `asRequest` en production, mémoire en test). */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<ResponseLike>;

/**
 * Chemins REST documentés — **à valider semaine 1** (§22).
 * `%s` marque les segments dynamiques (identifiant, clé, numéro).
 */
export const ENDPOINTS = {
  /** v1 : page avec corps au format storage et version courante. */
  page: '/wiki/rest/api/content/%s?expand=body.storage,version,metadata.labels',
  /** v2 : liste des versions d'une page (historique — gîte 4). */
  versions: '/wiki/api/v2/pages/%s/versions',
  /** v1 : contenu d'une version précise (numéro en paramètre `version`). */
  versionContent: '/wiki/rest/api/content/%s?version=%s&expand=body.storage',
  /** v1 : commentaires d'une page avec leur corps storage. */
  comments: '/wiki/rest/api/content/%s/child/comment?expand=body.storage,version',
  /** v1 : pièces jointes d'une page (métadonnées, taille, type média). */
  attachments: '/wiki/rest/api/content/%s/child/attachment',
  /** v1 : téléchargement d'une pièce jointe (chemin relatif `download`). */
  attachmentDownload: '/wiki/rest/api/content/%s/child/attachment/%s/download',
  /** v2 : espace avec description (gîte 7). */
  space: '/wiki/api/v2/spaces/%s?description-format=storage',
  /** v2 : modèles de page (gîte 5), filtrables par espace. */
  templates: '/wiki/api/v2/templates',
  /** v1 : recherche CQL paginée (`start` + `limit`). */
  cql: '/wiki/rest/api/content/search',
  /** v1 : restrictions de lecture/écriture d'une page. */
  restrictions: '/wiki/rest/api/content/%s/restriction',
  /** v2 : permissions d'un espace (entrée de @placard-wiki/exposure). */
  spacePermissions: '/wiki/api/v2/spaces/%s/permissions',
} as const;

/** Une page lue : ce qu'il faut pour scanner corps, titre et étiquettes. */
export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  versionNumber: number;
  /** Corps au format storage — texte brut, macros incluses (§6 : « blocs de code et macros »). */
  bodyStorage: string;
  labels: string[];
  lastModifiedAt: string;
}

/** Une ligne d'historique de versions (gîte 4 — l'angle mort des scanners). */
export interface VersionSummary {
  number: number;
  when: string;
  byAccountId?: string;
  message?: string;
}

/** Le contenu d'une version précise — ce qui reste lisible dans la cave. */
export interface VersionContent {
  number: number;
  title: string;
  bodyStorage: string;
}

/** Un commentaire de page (gîte 2). */
export interface CommentItem {
  id: string;
  bodyStorage: string;
  versionNumber: number;
  createdAt?: string;
}

/** Métadonnées d'une pièce jointe (gîte 3) — la taille décide de la lecture. */
export interface AttachmentMeta {
  id: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
}

/** Résultat d'un téléchargement borné : lu (texte) ou non lu (raison). */
export interface AttachmentDownload {
  /** Texte décodé UTF-8 — absent si le fichier n'a pas été lu. */
  text?: string;
  sizeBytes: number;
  /** Contenu tronqué à la borne demandée (jamais de lecture partielle silencieuse). */
  truncated: boolean;
  skippedReason?: string;
}

/** Description d'un espace (gîte 7 — l'endroit le plus lu). */
export interface SpaceDescription {
  key: string;
  name: string;
  /** Description au format storage — absente si l'espace n'en a pas. */
  descriptionStorage?: string;
  homepageId?: string;
}

/** Un modèle de page (gîte 5 — amplification : chaque nouvelle page recopie). */
export interface TemplateMeta {
  id: string;
  title: string;
  spaceKey?: string;
  bodyStorage: string;
}

/** Restrictions d'une page : qui est privé de lecture (entrée d'exposition). */
export interface PageRestrictions {
  read: string[];
  update: string[];
}

/** Permissions d'un espace, brutes : types et sujets (groupes, utilisateurs). */
export interface SpacePermissionEntry {
  type: 'known' | 'unknown' | 'anyone';
  principal: string;
  operation: 'read' | 'administer' | 'create';
}

/**
 * État du partage « anyone with the link » (§22 : à valider par prototype).
 * Tant que l'API ne le confirme pas, `unknown` + hypothèse conservatrice
 * affichée comme telle — jamais une valeur inventée.
 */
export interface SharingState {
  anyoneWithLink: boolean | 'unknown';
  method: string;
}

/** Une page de résultats CQL (pagination par `start`). */
export interface CqlResultPage {
  results: Array<{ id: string; title: string; type: 'page' | 'blogpost'; spaceKey?: string; lastModifiedAt?: string }>;
  start: number;
  limit: number;
  size: number;
  /** `start` de la prochaine page — absent quand tout a été lu. */
  nextStart?: number;
}

/** Le port : tout ce que les lecteurs savent faire avec Confluence. */
export interface ConfluenceClient {
  getPage(pageId: string): Promise<ConfluencePage>;
  listVersions(pageId: string): Promise<VersionSummary[]>;
  getVersionContent(pageId: string, versionNumber: number): Promise<VersionContent>;
  listComments(pageId: string): Promise<CommentItem[]>;
  listAttachments(pageId: string): Promise<AttachmentMeta[]>;
  downloadAttachment(pageId: string, attachmentId: string, maxBytes: number): Promise<AttachmentDownload>;
  getSpaceDescription(spaceKey: string): Promise<SpaceDescription>;
  listTemplates(spaceKey?: string): Promise<TemplateMeta[]>;
  searchCql(cql: string, start: number, limit: number): Promise<CqlResultPage>;
  getRestrictions(pageId: string): Promise<PageRestrictions>;
  getSpacePermissions(spaceKey: string): Promise<SpacePermissionEntry[]>;
  getSharingState(pageId: string): Promise<SharingState>;
}
