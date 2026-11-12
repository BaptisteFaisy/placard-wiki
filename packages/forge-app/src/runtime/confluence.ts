/**
 * Client Confluence du runtime Forge (§21).
 *
 * Diagnostic mesuré le 12 novembre 2026 sur le site réel, avec l'identité de
 * l'app (`asApp`) :
 *
 *   200  /wiki/rest/api/content/search?cql=…&expand=body.storage,version
 *   410  /wiki/rest/api/content/{id}                 (v1 direct retiré)
 *   410  /wiki/rest/api/content/{id}/child/comment    (v1 direct retiré)
 *   410  /wiki/rest/api/content/{id}/child/attachment (v1 direct retiré)
 *   410  /wiki/rest/api/content/{id}?version=N        (v1 direct retiré)
 *   200  /wiki/rest/api/content/{id}/restriction
 *   200  /wiki/api/v2/pages/{id}?body-format=storage  (corps v2)
 *   200  /wiki/api/v2/pages/{id}/versions             (historique v2)
 *   200  /wiki/api/v2/pages/{id}?version=N&body-format=storage  (corps d'une version)
 *   200  /wiki/api/v2/pages/{id}/attachments          (métadonnées PJ v2)
 *   200  /wiki/rest/api/content/{id}/child/attachment/{id}/download (contenu PJ)
 *
 * Deux causes distinctes ont été mesurées, puis traitées :
 *
 * 1. les 401 « scope does not match » venaient de **scopes granulaires non
 *    accordés** (seuls `search:confluence` et `read:content.restriction:confluence`
 *    l'étaient) ; ils sont désormais dans `manifest.yml`.
 * 2. une fois les scopes accordés, l'API v1 directe renvoie `410 Gone`
 *    (« This deprecated endpoint has been removed ») : cet adaptateur choisit
 *    donc, pour chaque gîte, le chemin qui **répond** (v2 ou recherche CQL).
 *
 * Le `fetch` est injectable : les tests donnent une fixture, jamais de réseau.
 */

import { asApp, assumeTrustedRoute } from '@forge/api';
import { createConfluenceClient, cqlQuote } from '@placard-wiki/wiki-source';
import type {
  AttachmentDownload, AttachmentMeta, ConfluenceClient, ConfluencePage, CommentItem,
  FetchLike, ResponseLike, SpaceDescription, VersionContent, VersionSummary,
} from '@placard-wiki/wiki-source';
import { REASON_FORBIDDEN } from '@placard-wiki/wiki-source';

/** Fetch Forge de production, injecté par défaut. */
async function forgeFetch(url: string): Promise<ResponseLike> {
  const response = await asApp().requestConfluence(assumeTrustedRoute(url));
  return {
    status: response.status,
    ok: response.ok,
    json: () => response.json(),
    text: () => response.text(),
  };
}

/** Extrait un objet d'une réponse brute (jamais `undefined` en sortie). */
function obj(raw: unknown, key: string): Record<string, unknown> {
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Lit le JSON d'une réponse 2xx, sinon lève une erreur portant le statut. */
async function jsonOrThrow(fetchImpl: FetchLike, path: string): Promise<unknown> {
  const response = await fetchImpl(path);
  if (!response.ok) throw new Error(`Confluence HTTP ${String(response.status)} sur ${path}`);
  return response.json();
}

/** Ligne brute → page typée (corps storage, version, étiquettes, espace). */
function toPage(raw: Record<string, unknown>, pageId: string): ConfluencePage {
  const version = obj(raw, 'version');
  const body = obj(obj(raw, 'body'), 'storage');
  const labels = obj(obj(obj(raw, 'metadata'), 'labels'), 'results');
  return {
    id: pageId,
    title: typeof raw['title'] === 'string' ? raw['title'] : '',
    spaceKey: spaceKeyOf(raw),
    versionNumber: Number(version['number'] ?? 1),
    bodyStorage: typeof body['value'] === 'string' ? body['value'] : '',
    labels: Object.values(labels).map((l) => String((l as Record<string, unknown>)['name'] ?? '')),
    lastModifiedAt: typeof version['when'] === 'string' ? version['when'] : '',
  };
}

/**
 * Clé de l'espace d'une page. La recherche rend `space` soit comme un objet
 * (`{ key, name }`), soit comme un lien (`/rest/api/space/MSD`) : les deux
 * formes sont lues, sinon les foyers seraient sans espace (§10).
 */
function spaceKeyOf(raw: Record<string, unknown>): string {
  const space = raw['space'];
  if (typeof space === 'object' && space !== null) {
    const key = (space as Record<string, unknown>)['key'];
    if (typeof key === 'string') return key;
  }
  if (typeof space === 'string') {
    const parts = space.split('/');
    return parts[parts.length - 1] ?? '';
  }
  return '';
}

/**
 * Gîte 1 — lit une page par la recherche CQL, le chemin qui répond pour
 * l'identité de l'app (mesuré le 12 novembre 2026).
 */
async function getPageBySearch(fetchImpl: FetchLike, pageId: string): Promise<ConfluencePage> {
  const cql = `id = ${cqlQuote(pageId)}`;
  const path = `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=1`
    + '&expand=body.storage,version,metadata.labels,space';
  const body = (await jsonOrThrow(fetchImpl, path)) as { results?: unknown[] };
  const row = body.results?.[0];
  if (row === undefined) throw new Error(`page ${pageId} introuvable par la recherche Confluence`);
  return toPage(row as Record<string, unknown>, pageId);
}

/**
 * Gîte 2 — commentaires d'une page via la recherche CQL
 * (`type = comment and container = …`). Le corps storage est retourné dans le
 * même appel, contrairement au v1 direct (410 Gone).
 */
async function listCommentsBySearch(fetchImpl: FetchLike, pageId: string): Promise<CommentItem[]> {
  const cql = `type = comment and container = ${pageId}`;
  const path = `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&expand=body.storage,version&limit=200`;
  const body = (await jsonOrThrow(fetchImpl, path)) as { results?: unknown[] };
  const rows = (body.results ?? []) as Array<Record<string, unknown>>;
  return rows.map((row): CommentItem => {
    const storage = obj(obj(row, 'body'), 'storage');
    const version = obj(row, 'version');
    return {
      id: String(row['id'] ?? ''),
      bodyStorage: typeof storage['value'] === 'string' ? storage['value'] : '',
      versionNumber: Number(version['number'] ?? 1),
      createdAt: typeof version['when'] === 'string' ? version['when'] : undefined,
    };
  });
}

/**
 * Gîte 3 — pièces jointes d'une page via l'API v2 (`/pages/{id}/attachments`),
 * qui répond 200 là où le v1 direct renvoie 410 Gone.
 */
async function listAttachmentsV2(fetchImpl: FetchLike, pageId: string): Promise<AttachmentMeta[]> {
  const path = `/wiki/api/v2/pages/${pageId}/attachments?limit=200`;
  const body = (await jsonOrThrow(fetchImpl, path)) as { results?: unknown[] };
  const rows = (body.results ?? []) as Array<Record<string, unknown>>;
  return rows.map((row): AttachmentMeta => ({
    id: String(row['id'] ?? ''),
    filename: String(row['title'] ?? ''),
    mediaType: String(row['mediaType'] ?? 'application/octet-stream'),
    sizeBytes: Number(row['fileSize'] ?? 0),
  }));
}

/**
 * Gîte 3 (suite) — téléchargement du contenu d'une pièce jointe : le v1 de
 * téléchargement répond toujours 200 (le proxy Forge suit la redirection
 * vers le stockage media), contrairement aux autres chemins v1.
 */
async function downloadAttachmentV1(
  fetchImpl: FetchLike,
  pageId: string,
  attachmentId: string,
  maxBytes: number,
): Promise<AttachmentDownload> {
  const path = `/wiki/rest/api/content/${pageId}/child/attachment/${attachmentId}/download`;
  const response = await fetchImpl(path);
  if (response.status === 403) {
    return { sizeBytes: 0, truncated: false, skippedReason: REASON_FORBIDDEN };
  }
  if (!response.ok) throw new Error(`Confluence HTTP ${String(response.status)} sur ${path}`);
  const text = await response.text();
  const sizeBytes = ByteLength(text);
  return { text: text.slice(0, maxBytes), sizeBytes, truncated: sizeBytes > maxBytes };
}

/** Taille en octets (la borne de lecture compte les octets, pas les signes). */
function ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Gîte 4 — historique des versions d'une page via l'API v2
 * (`/pages/{id}/versions`), qui répond 200 là où le v1 renvoie 410 Gone.
 */
async function listVersionsV2(fetchImpl: FetchLike, pageId: string): Promise<VersionSummary[]> {
  const path = `/wiki/api/v2/pages/${pageId}/versions?limit=200`;
  const body = (await jsonOrThrow(fetchImpl, path)) as { results?: unknown[] };
  const rows = (body.results ?? []) as Array<Record<string, unknown>>;
  return rows.map((row): VersionSummary => ({
    number: Number(row['number'] ?? 0),
    when: String(row['createdAt'] ?? ''),
    byAccountId: typeof row['authorId'] === 'string' ? row['authorId'] : undefined,
    message: typeof row['message'] === 'string' ? row['message'] : undefined,
  }));
}

/**
 * Gîte 4 (suite) — corps d'une version précise via l'API v2
 * (`/pages/{id}?version=N&body-format=storage`), qui rend le storage de
 * l'ancienne version là où le v1 (`content?version=N`) est retiré.
 */
async function getVersionContentV2(
  fetchImpl: FetchLike,
  pageId: string,
  versionNumber: number,
): Promise<VersionContent> {
  const path = `/wiki/api/v2/pages/${pageId}?version=${String(versionNumber)}&body-format=storage`;
  const raw = (await jsonOrThrow(fetchImpl, path)) as Record<string, unknown>;
  const storage = obj(obj(raw, 'body'), 'storage');
  return {
    number: versionNumber,
    title: typeof raw['title'] === 'string' ? raw['title'] : '',
    bodyStorage: typeof storage['value'] === 'string' ? storage['value'] : '',
  };
}

/**
 * Gîte 7 — description d'un espace via l'API v2
 * (`/spaces?keys=…&description-format=PLAIN`). Le v1 `/space/{key}` est
 * retiré (410 Gone) ; la v2 répond 200 et rend la description en clair.
 */
async function getSpaceDescriptionV2(
  fetchImpl: FetchLike,
  spaceKey: string,
): Promise<SpaceDescription> {
  const path = `/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}&description-format=PLAIN`;
  const body = (await jsonOrThrow(fetchImpl, path)) as { results?: unknown[] };
  const row = (body.results ?? [])[0] as Record<string, unknown> | undefined;
  if (row === undefined) throw new Error(`espace ${spaceKey} introuvable via l'API v2 Confluence`);
  const description = obj(row, 'description');
  const plain = obj(description, 'plain');
  return {
    key: typeof row['key'] === 'string' ? row['key'] : spaceKey,
    name: typeof row['name'] === 'string' ? row['name'] : spaceKey,
    ...(typeof plain['value'] === 'string' ? { descriptionStorage: plain['value'] } : {}),
    ...(typeof row['homepageId'] === 'string' ? { homepageId: row['homepageId'] } : {}),
  };
}

/**
 * Fabrique le client Confluence du runtime : le client du paquet, avec chaque
 * lecture de gîte redirigée vers le chemin qui répond (v2 ou recherche CQL).
 * Le `fetch` est injectable pour les tests (fixtures, jamais de réseau).
 */
export function createForgeConfluence(
  fetchImpl: FetchLike = forgeFetch as FetchLike,
): ConfluenceClient {
  const base = createConfluenceClient(fetchImpl, '', '');
  return {
    ...base,
    getPage: (pageId: string) => getPageBySearch(fetchImpl, pageId),
    listComments: (pageId: string) => listCommentsBySearch(fetchImpl, pageId),
    listAttachments: (pageId: string) => listAttachmentsV2(fetchImpl, pageId),
    listVersions: (pageId: string) => listVersionsV2(fetchImpl, pageId),
    getVersionContent: (pageId: string, n: number) => getVersionContentV2(fetchImpl, pageId, n),
    getSpaceDescription: (spaceKey: string) => getSpaceDescriptionV2(fetchImpl, spaceKey),
    downloadAttachment: (pageId, attachmentId, maxBytes) =>
      downloadAttachmentV1(fetchImpl, pageId, attachmentId, maxBytes),
  };
}