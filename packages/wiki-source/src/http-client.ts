/**
 * Implémentation HTTP du port `ConfluenceClient` — `fetch` est injecté, donc
 * testable sans réseau et adaptable au runtime Forge (`asRequest`).
 *
 * Les chemins suivent `ENDPOINTS` (api.ts) : **à valider semaine 1** (§22).
 * Toute réponse 403 devient une raison de non-lecture déclarée (`REASON_FORBIDDEN`) :
 * les droits manquants sont distingués de « pas de données » (§19).
 */

import { ENDPOINTS } from './api';
import type {
  AttachmentDownload, AttachmentMeta, CqlResultPage, CommentItem, ConfluenceClient,
  ConfluencePage, FetchLike, PageRestrictions, ResponseLike, SharingState, SpaceDescription,
  SpacePermissionEntry, TemplateMeta, VersionContent, VersionSummary,
} from './api';
import { MAX_ATTACHMENT_BYTES, REASON_FORBIDDEN } from './types';

/** Erreur portée par le client HTTP : le statut compte pour la couverture. */
export class ConfluenceHttpError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`Confluence HTTP ${status} sur ${path}`);
  }
}

/** Contexte HTTP partagé par les méthodes : GET json, GET liste, GET brut. */
interface HttpCtx {
  getJson(path: string): Promise<unknown>;
  results<T>(path: string): Promise<T[]>;
  raw(path: string): Promise<ResponseLike>;
}

function fmt(template: string, ...parts: Array<string | number>): string {
  let out = template;
  for (const part of parts) out = out.replace('%s', encodeURIComponent(String(part)));
  return out;
}

function record(raw: unknown, key: string): Record<string, unknown> {
  return ((raw as Record<string, unknown>)[key] ?? {}) as Record<string, unknown>;
}

function str(raw: Record<string, unknown>, key: string): string {
  return raw[key] === undefined ? '' : String(raw[key]);
}

/** Objet brut → page typée. Les champs absents deviennent des vides explicites. */
function toPage(raw: Record<string, unknown>): ConfluencePage {
  const version = record(raw, 'version');
  const body = record(record(raw, 'body'), 'storage');
  const labelsRaw = record(record(record(raw, 'metadata'), 'labels'), 'results');
  return {
    id: str(raw, 'id'),
    title: str(raw, 'title'),
    spaceKey: str(record(raw, 'space'), 'key'),
    versionNumber: Number(version['number'] ?? 1),
    bodyStorage: String(body['value'] ?? ''),
    labels: Object.values(labelsRaw).map((l) => String((l as Record<string, unknown>)['name'] ?? '')),
    lastModifiedAt: String(version['when'] ?? ''),
  };
}

/** Ligne brute → commentaire typé. */
function toComment(r: Record<string, unknown>): CommentItem {
  const body = record(record(r, 'body'), 'storage');
  const version = record(r, 'version');
  return {
    id: str(r, 'id'),
    bodyStorage: String(body['value'] ?? ''),
    versionNumber: Number(version['number'] ?? 1),
    createdAt: version['when'] === undefined ? undefined : String(version['when']),
  };
}

/** Ligne brute → métadonnées de pièce jointe. */
function toAttachment(r: Record<string, unknown>): AttachmentMeta {
  const ext = record(r, 'extensions');
  return {
    id: str(r, 'id'),
    filename: str(r, 'title'),
    mediaType: String(ext['mediaType'] ?? 'application/octet-stream'),
    sizeBytes: Number(ext['fileSize'] ?? 0),
  };
}

/** Ligne brute → résultat CQL. */
function toCqlRow(r: Record<string, unknown>): CqlResultPage['results'][number] {
  const version = record(r, 'version');
  return {
    id: str(r, 'id'),
    title: str(r, 'title'),
    type: r['type'] === 'blogpost' ? 'blogpost' : 'page',
    spaceKey: record(r, 'space')['key'] === undefined ? undefined : String(record(r, 'space')['key']),
    lastModifiedAt: version['when'] === undefined ? undefined : String(version['when']),
  };
}

/** Gîtes 1, 4 et 6 — page, versions, contenu d'une version précise. */
function pageVersionMethods(ctx: HttpCtx): Pick<ConfluenceClient, 'getPage' | 'listVersions' | 'getVersionContent'> {
  return {
    async getPage(pageId) {
      return toPage((await ctx.getJson(fmt(ENDPOINTS.page, pageId))) as Record<string, unknown>);
    },
    async listVersions(pageId): Promise<VersionSummary[]> {
      const rows = await ctx.results<Record<string, unknown>>(fmt(ENDPOINTS.versions, pageId));
      return rows.map((r) => ({
        number: Number(r['versionNumber'] ?? r['number'] ?? 0),
        when: String(r['createdAt'] ?? r['when'] ?? ''),
        byAccountId: r['authorId'] === undefined ? undefined : String(r['authorId']),
        message: r['message'] === undefined ? undefined : String(r['message']),
      }));
    },
    async getVersionContent(pageId, versionNumber): Promise<VersionContent> {
      const raw = (await ctx.getJson(fmt(ENDPOINTS.versionContent, pageId, versionNumber))) as Record<string, unknown>;
      const page = toPage(raw);
      return { number: versionNumber, title: page.title, bodyStorage: page.bodyStorage };
    },
  };
}

/** Gîtes 2 et 3 — commentaires, pièces jointes et téléchargement borné (§14). */
function commentAttachmentMethods(ctx: HttpCtx): Pick<ConfluenceClient, 'listComments' | 'listAttachments' | 'downloadAttachment'> {
  return {
    async listComments(pageId) {
      const rows = await ctx.results<Record<string, unknown>>(fmt(ENDPOINTS.comments, pageId));
      return rows.map(toComment);
    },
    async listAttachments(pageId) {
      const rows = await ctx.results<Record<string, unknown>>(fmt(ENDPOINTS.attachments, pageId));
      return rows.map(toAttachment);
    },
    // Téléchargement borné : on lit au plus `maxBytes` octets, jamais plus (§14).
    async downloadAttachment(pageId, attachmentId, maxBytes): Promise<AttachmentDownload> {
      const bound = Math.min(maxBytes, MAX_ATTACHMENT_BYTES);
      const path = fmt(ENDPOINTS.attachmentDownload, pageId, attachmentId);
      const response = await ctx.raw(path);
      if (response.status === 403) return { sizeBytes: 0, truncated: false, skippedReason: REASON_FORBIDDEN };
      if (!response.ok) throw new ConfluenceHttpError(response.status, path);
      const text = await response.text();
      const sizeBytes = new TextEncoder().encode(text).length;
      return { text: text.slice(0, bound), sizeBytes, truncated: sizeBytes > bound };
    },
  };
}

/** Gîtes 5 et 7 — description d'espace et modèles de page. */
function spaceTemplateMethods(ctx: HttpCtx): Pick<ConfluenceClient, 'getSpaceDescription' | 'listTemplates'> {
  return {
    async getSpaceDescription(spaceKey) {
      const raw = (await ctx.getJson(fmt(ENDPOINTS.space, spaceKey))) as Record<string, unknown>;
      const storage = record(record(raw, 'description'), 'storage');
      return {
        key: spaceKey,
        name: str(raw, 'name'),
        descriptionStorage: storage['value'] === undefined ? undefined : String(storage['value']),
        homepageId: raw['homepageId'] === undefined ? undefined : String(raw['homepageId']),
      };
    },
    async listTemplates(spaceKey) {
      const query = spaceKey ? `?space-id=${encodeURIComponent(spaceKey)}` : '';
      const rows = await ctx.results<Record<string, unknown>>(`${ENDPOINTS.templates}${query}`);
      return rows.map((r): TemplateMeta => ({
        id: str(r, 'id'),
        title: str(r, 'title'),
        spaceKey: r['spaceKey'] === undefined ? undefined : String(r['spaceKey']),
        bodyStorage: String(r['bodyStorage'] ?? ''),
      }));
    },
  };
}

/** CQL paginé, restrictions, permissions et état de partage (§8, §14, §22). */
function searchAccessMethods(ctx: HttpCtx): Pick<ConfluenceClient, 'searchCql' | 'getRestrictions' | 'getSpacePermissions' | 'getSharingState'> {
  return {
    async searchCql(cql, start, limit): Promise<CqlResultPage> {
      const query = `?cql=${encodeURIComponent(cql)}&start=${start}&limit=${limit}`;
      const raw = (await ctx.getJson(`${ENDPOINTS.cql}${query}`)) as Record<string, unknown>;
      const rows = (raw['results'] ?? []) as Array<Record<string, unknown>>;
      const size = rows.length;
      return { results: rows.map(toCqlRow), start, limit, size, nextStart: size === limit ? start + size : undefined };
    },
    async getRestrictions(pageId): Promise<PageRestrictions> {
      const rows = await ctx.results<Record<string, unknown>>(fmt(ENDPOINTS.restrictions, pageId));
      const pick = (op: string): string[] => {
        const entry = rows.find((r) => r['operation'] === op);
        const restrictions = record(entry, 'restrictions');
        return [
          ...Object.keys(record(restrictions, 'user')),
          ...Object.keys(record(restrictions, 'group')),
        ];
      };
      return { read: pick('read'), update: pick('update') };
    },
    async getSpacePermissions(spaceKey): Promise<SpacePermissionEntry[]> {
      const rows = await ctx.results<Record<string, unknown>>(fmt(ENDPOINTS.spacePermissions, spaceKey));
      return rows.map((r) => ({
        type: r['type'] === 'anyone' ? 'anyone' as const : r['type'] === 'known' ? 'known' as const : 'unknown' as const,
        principal: String(r['principal'] ?? ''),
        operation: r['operation'] === 'administer' ? 'administer' as const : r['operation'] === 'create' ? 'create' as const : 'read' as const,
      }));
    },
    // §22 : l'état du partage « anyone with the link » reste à valider par
    // prototype — tant qu'il ne l'est pas, `unknown` + méthode déclarée.
    async getSharingState(): Promise<SharingState> {
      return {
        anyoneWithLink: 'unknown',
        method: 'hypothèse conservatrice : état non confirmable par API à ce jour (§22, à valider semaine 1)',
      };
    },
  };
}

/** Fabrique le client : `baseUrl` + `fetch` injecté + jeton porteur. */
export function createConfluenceClient(fetchImpl: FetchLike, baseUrl: string, token: string): ConfluenceClient {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const ctx: HttpCtx = {
    async raw(path: string) {
      return fetchImpl(`${baseUrl}${path}`, { method: 'GET', headers });
    },
    async getJson(path: string) {
      const response = await ctx.raw(path);
      if (response.status === 403) throw new ConfluenceHttpError(403, path);
      if (!response.ok) throw new ConfluenceHttpError(response.status, path);
      return response.json();
    },
    async results<T>(path: string) {
      const raw = (await ctx.getJson(path)) as Record<string, unknown>;
      return (raw['results'] ?? []) as T[];
    },
  };
  return {
    ...pageVersionMethods(ctx),
    ...commentAttachmentMethods(ctx),
    ...spaceTemplateMethods(ctx),
    ...searchAccessMethods(ctx),
  };
}
