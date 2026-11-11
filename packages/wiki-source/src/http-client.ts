/**
 * Implémentation HTTP du port `ConfluenceClient` — `fetch` est injecté, donc
 * testable sans réseau et adaptable au runtime Forge (`asRequest`).
 *
 * Les chemins suivent `ENDPOINTS` (api.ts) : **à valider semaine 1** (§22).
 * Toute réponse 403 devient une raison de non-lecture déclarée (`REASON_FORBIDDEN`) :
 * les droits manquants sont distingués de « pas de données » (§19).
 */

import { ENDPOINTS } from './api.js';
import type {
  AttachmentDownload, AttachmentMeta, CqlResultPage, CommentItem, ConfluenceClient,
  ConfluencePage, FetchLike, PageRestrictions, SharingState, SpaceDescription,
  SpacePermissionEntry, TemplateMeta, VersionContent, VersionSummary,
} from './api.js';
import { MAX_ATTACHMENT_BYTES, REASON_FORBIDDEN } from './types.js';

/** Erreur portée par le client HTTP : le statut compte pour la couverture. */
export class ConfluenceHttpError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`Confluence HTTP ${status} sur ${path}`);
  }
}

function fmt(template: string, ...parts: Array<string | number>): string {
  let out = template;
  for (const part of parts) out = out.replace('%s', encodeURIComponent(String(part)));
  return out;
}

/** Objet brut → page typée. Les champs absents deviennent des vides explicites. */
function toPage(raw: Record<string, unknown>): ConfluencePage {
  const version = (raw['version'] ?? {}) as Record<string, unknown>;
  const space = (raw['space'] ?? {}) as Record<string, unknown>;
  const body = ((raw['body'] ?? {}) as Record<string, unknown>)['storage'] as Record<string, unknown> | undefined;
  const labelsRaw = ((((raw['metadata'] ?? {}) as Record<string, unknown>)['labels'] ?? {}) as Record<string, unknown>)['results'] as Array<Record<string, unknown>> | undefined;
  return {
    id: String(raw['id'] ?? ''),
    title: String(raw['title'] ?? ''),
    spaceKey: String(space['key'] ?? ''),
    versionNumber: Number(version['number'] ?? 1),
    bodyStorage: String(body?.['value'] ?? ''),
    labels: (labelsRaw ?? []).map((l) => String(l['name'] ?? '')),
    lastModifiedAt: String(version['when'] ?? ''),
  };
}

/** Fabrique le client : `baseUrl` + `fetch` injecté + jeton porteur. */
export function createConfluenceClient(fetchImpl: FetchLike, baseUrl: string, token: string): ConfluenceClient {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  async function getJson(path: string): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, { method: 'GET', headers });
    if (response.status === 403) throw new ConfluenceHttpError(403, path);
    if (!response.ok) throw new ConfluenceHttpError(response.status, path);
    return response.json();
  }

  async function results<T>(path: string): Promise<T[]> {
    const raw = (await getJson(path)) as Record<string, unknown>;
    return (raw['results'] ?? []) as T[];
  }

  return {
    async getPage(pageId) {
      return toPage((await getJson(fmt(ENDPOINTS.page, pageId))) as Record<string, unknown>);
    },
    async listVersions(pageId) {
      const rows = await results<Record<string, unknown>>(fmt(ENDPOINTS.versions, pageId));
      return rows.map((r): VersionSummary => ({
        number: Number(r['versionNumber'] ?? r['number'] ?? 0),
        when: String(r['createdAt'] ?? r['when'] ?? ''),
        byAccountId: r['authorId'] === undefined ? undefined : String(r['authorId']),
        message: r['message'] === undefined ? undefined : String(r['message']),
      }));
    },
    async getVersionContent(pageId, versionNumber) {
      const raw = (await getJson(fmt(ENDPOINTS.versionContent, pageId, versionNumber))) as Record<string, unknown>;
      const page = toPage(raw);
      return { number: versionNumber, title: page.title, bodyStorage: page.bodyStorage };
    },
    async listComments(pageId) {
      const rows = await results<Record<string, unknown>>(fmt(ENDPOINTS.comments, pageId));
      return rows.map((r): CommentItem => {
        const body = ((r['body'] ?? {}) as Record<string, unknown>)['storage'] as Record<string, unknown> | undefined;
        const version = (r['version'] ?? {}) as Record<string, unknown>;
        return {
          id: String(r['id'] ?? ''),
          bodyStorage: String(body?.['value'] ?? ''),
          versionNumber: Number(version['number'] ?? 1),
          createdAt: version['when'] === undefined ? undefined : String(version['when']),
        };
      });
    },
    async listAttachments(pageId) {
      const rows = await results<Record<string, unknown>>(fmt(ENDPOINTS.attachments, pageId));
      return rows.map((r): AttachmentMeta => {
        const ext = (r['extensions'] ?? {}) as Record<string, unknown>;
        return {
          id: String(r['id'] ?? ''),
          filename: String(r['title'] ?? ''),
          mediaType: String(ext['mediaType'] ?? 'application/octet-stream'),
          sizeBytes: Number(ext['fileSize'] ?? 0),
        };
      });
    },
    // Téléchargement borné : on lit au plus `maxBytes` octets, jamais plus (§14).
    async downloadAttachment(pageId, attachmentId, maxBytes): Promise<AttachmentDownload> {
      const bound = Math.min(maxBytes, MAX_ATTACHMENT_BYTES);
      const path = fmt(ENDPOINTS.attachmentDownload, pageId, attachmentId);
      const response = await fetchImpl(`${baseUrl}${path}`, { method: 'GET', headers });
      if (response.status === 403) return { sizeBytes: 0, truncated: false, skippedReason: REASON_FORBIDDEN };
      if (!response.ok) throw new ConfluenceHttpError(response.status, path);
      const text = await response.text();
      const sizeBytes = new TextEncoder().encode(text).length;
      return { text: text.slice(0, bound), sizeBytes, truncated: sizeBytes > bound };
    },
    async getSpaceDescription(spaceKey) {
      const raw = (await getJson(fmt(ENDPOINTS.space, spaceKey))) as Record<string, unknown>;
      const description = raw['description'] as Record<string, unknown> | undefined;
      const storage = description?.['storage'] as Record<string, unknown> | undefined;
      return {
        key: spaceKey,
        name: String(raw['name'] ?? ''),
        descriptionStorage: storage?.['value'] === undefined ? undefined : String(storage['value']),
        homepageId: raw['homepageId'] === undefined ? undefined : String(raw['homepageId']),
      };
    },
    async listTemplates(spaceKey) {
      const query = spaceKey ? `?space-id=${encodeURIComponent(spaceKey)}` : '';
      const rows = await results<Record<string, unknown>>(`${ENDPOINTS.templates}${query}`);
      return rows.map((r): TemplateMeta => ({
        id: String(r['id'] ?? ''),
        title: String(r['title'] ?? ''),
        spaceKey: r['spaceKey'] === undefined ? undefined : String(r['spaceKey']),
        bodyStorage: String(r['bodyStorage'] ?? ''),
      }));
    },
    async searchCql(cql, start, limit): Promise<CqlResultPage> {
      const query = `?cql=${encodeURIComponent(cql)}&start=${start}&limit=${limit}`;
      const raw = (await getJson(`${ENDPOINTS.cql}${query}`)) as Record<string, unknown>;
      const rows = (raw['results'] ?? []) as Array<Record<string, unknown>>;
      const size = rows.length;
      const next = size === limit ? start + size : undefined;
      return {
        results: rows.map((r) => {
          const space = (r['space'] ?? {}) as Record<string, unknown>;
          const version = (r['version'] ?? {}) as Record<string, unknown>;
          return {
            id: String(r['id'] ?? ''),
            title: String(r['title'] ?? ''),
            type: r['type'] === 'blogpost' ? 'blogpost' as const : 'page' as const,
            spaceKey: space['key'] === undefined ? undefined : String(space['key']),
            lastModifiedAt: version['when'] === undefined ? undefined : String(version['when']),
          };
        }),
        start, limit, size,
        nextStart: next,
      };
    },
    async getRestrictions(pageId): Promise<PageRestrictions> {
      const rows = await results<Record<string, unknown>>(fmt(ENDPOINTS.restrictions, pageId));
      const pick = (op: string): string[] => {
        const entry = rows.find((r) => r['operation'] === op);
        const restrictions = (entry?.['restrictions'] ?? {}) as Record<string, unknown>;
        const subjects = [
          ...((restrictions['user'] ?? {}) as Record<string, unknown> ? Object.keys((restrictions['user'] ?? {}) as object) : []),
          ...((restrictions['group'] ?? {}) as Record<string, unknown> ? Object.keys((restrictions['group'] ?? {}) as object) : []),
        ];
        return subjects;
      };
      return { read: pick('read'), update: pick('update') };
    },
    async getSpacePermissions(spaceKey): Promise<SpacePermissionEntry[]> {
      const rows = await results<Record<string, unknown>>(fmt(ENDPOINTS.spacePermissions, spaceKey));
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
