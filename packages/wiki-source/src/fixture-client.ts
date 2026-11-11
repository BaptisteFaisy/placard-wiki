/**
 * Client mémoire offline — implémente le port `ConfluenceClient` à partir d'un
 * jeu de fixtures JSON (`tests/fixtures/*.json`). Aucun réseau, aucune valeur
 * réelle : les contenus des fixtures sont factices et structurels ; quand un
 * test a besoin d'une valeur à forme de secret, il la génère à l'exécution via
 * `@placard/core` (fake-values) — jamais écrite dans le dépôt (PLA-N-09).
 */

import { readFileSync } from 'node:fs';

import type {
  AttachmentDownload, AttachmentMeta, CqlResultPage, CommentItem, ConfluenceClient,
  ConfluencePage, PageRestrictions, SharingState, SpaceDescription,
  SpacePermissionEntry, TemplateMeta, VersionContent, VersionSummary,
} from './api.js';
import { MAX_ATTACHMENT_BYTES, REASON_NOT_TEXT, REASON_TOO_LARGE } from './types.js';

/** Forme du fichier de fixtures — tout est optionnel sauf les pages. */
export interface FixtureData {
  spaces?: SpaceDescription[];
  pages: ConfluencePage[];
  versions?: Record<string, VersionContent[]>;
  comments?: Record<string, CommentItem[]>;
  attachments?: Record<string, AttachmentMeta[]>;
  /** Contenu des pièces jointes : texte factice, ou `binary: true` (non textuel). */
  attachmentContent?: Record<string, { text?: string; binary?: boolean }>;
  templates?: TemplateMeta[];
  restrictions?: Record<string, PageRestrictions>;
  permissions?: Record<string, SpacePermissionEntry[]>;
}

/** Charge un fichier de fixtures (chemin relatif au paquet par défaut). */
export function loadFixtureData(relativePath = 'tests/fixtures/wiki.json'): FixtureData {
  const url = new URL(`../${relativePath}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as FixtureData;
}

/** Filtre CQL minimaliste : ce que les requêtes du paquet produisent vraiment. */
function matchesCql(page: ConfluencePage, cql: string): boolean {
  const id = /id = "([^"]+)"/.exec(cql);
  if (id) return page.id === id[1];
  const space = /space = "([^"]+)"/.exec(cql);
  if (space && page.spaceKey !== space[1]) return false;
  const modified = /lastModified >= "([^"]+)"/.exec(cql);
  if (modified) {
    const pageStamp = page.lastModifiedAt.slice(0, 16).replace('T', ' ');
    if (pageStamp < (modified[1] ?? '')) return false;
  }
  return true;
}

/** Fabrique le client mémoire. Même contrat que le client HTTP — interchangeable. */
export function createFixtureClient(data: FixtureData): ConfluenceClient {
  const pages = new Map(data.pages.map((page) => [page.id, page]));

  function needPage(pageId: string): ConfluencePage {
    const page = pages.get(pageId);
    if (!page) throw new Error(`fixture : page ${pageId} introuvable`);
    return page;
  }

  return {
    async getPage(pageId) {
      return needPage(pageId);
    },
    async listVersions(pageId): Promise<VersionSummary[]> {
      return (data.versions?.[pageId] ?? []).map((v) => ({ number: v.number, when: '', message: undefined }));
    },
    async getVersionContent(pageId, versionNumber): Promise<VersionContent> {
      const found = (data.versions?.[pageId] ?? []).find((v) => v.number === versionNumber);
      if (!found) throw new Error(`fixture : version ${versionNumber} de ${pageId} introuvable`);
      return found;
    },
    async listComments(pageId) {
      return data.comments?.[pageId] ?? [];
    },
    async listAttachments(pageId) {
      return data.attachments?.[pageId] ?? [];
    },
    // Téléchargement borné, avec les mêmes raisons de non-lecture que le réel.
    async downloadAttachment(pageId, attachmentId, maxBytes): Promise<AttachmentDownload> {
      const meta = (data.attachments?.[pageId] ?? []).find((a) => a.id === attachmentId);
      if (!meta) throw new Error(`fixture : pièce jointe ${attachmentId} introuvable`);
      if (meta.sizeBytes > MAX_ATTACHMENT_BYTES) {
        return { sizeBytes: meta.sizeBytes, truncated: false, skippedReason: REASON_TOO_LARGE };
      }
      const content = data.attachmentContent?.[attachmentId];
      if (content?.binary === true || content?.text === undefined) {
        return { sizeBytes: meta.sizeBytes, truncated: false, skippedReason: REASON_NOT_TEXT };
      }
      const bound = Math.min(maxBytes, MAX_ATTACHMENT_BYTES);
      const text = content.text;
      const sizeBytes = new TextEncoder().encode(text).length;
      return { text: text.slice(0, bound), sizeBytes, truncated: sizeBytes > bound };
    },
    async getSpaceDescription(spaceKey): Promise<SpaceDescription> {
      const space = (data.spaces ?? []).find((s) => s.key === spaceKey);
      if (!space) throw new Error(`fixture : espace ${spaceKey} introuvable`);
      return space;
    },
    async listTemplates(spaceKey) {
      const all = data.templates ?? [];
      return spaceKey ? all.filter((t) => t.spaceKey === spaceKey) : all;
    },
    async searchCql(cql, start, limit): Promise<CqlResultPage> {
      const matched = data.pages
        .filter((page) => matchesCql(page, cql))
        .sort((a, b) => a.id.localeCompare(b.id));
      const slice = matched.slice(start, start + limit);
      const nextStart = start + slice.length < matched.length ? start + slice.length : undefined;
      return {
        results: slice.map((page) => ({
          id: page.id, title: page.title, type: 'page' as const,
          spaceKey: page.spaceKey, lastModifiedAt: page.lastModifiedAt,
        })),
        start, limit, size: slice.length, nextStart,
      };
    },
    async getRestrictions(pageId) {
      return data.restrictions?.[pageId] ?? { read: [], update: [] };
    },
    async getSpacePermissions(spaceKey) {
      return data.permissions?.[spaceKey] ?? [];
    },
    // Même hypothèse conservatrice que le client réel (§22).
    async getSharingState(): Promise<SharingState> {
      return {
        anyoneWithLink: 'unknown',
        method: 'fixture : hypothèse conservatrice, état non confirmable par API (§22)',
      };
    },
  };
}
