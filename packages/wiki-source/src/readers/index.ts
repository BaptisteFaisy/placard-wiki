/**
 * Les sept lecteurs — un par gîte (§6). Chaque lecteur ramène des
 * `ScannedItem` : du contenu et des métadonnées, aucun jugement.
 *
 * Fichier regroupé : les lecteurs sont courts et partagent la même forme
 * (client → page/espace → éléments). Le gîte se déduit de l'élément via
 * `giteOfItem` (règle du domaine, jamais recopiée ici).
 */

import type { ConfluenceClient, AttachmentMeta, AttachmentDownload } from '../api';
import { ConfluenceHttpError } from '../http-client';
import {
  MAX_ATTACHMENT_BYTES, REASON_FORBIDDEN, REASON_NOT_TEXT, REASON_TOO_LARGE,
  byteLength, childAri, pageAri,
} from '../types';
import type { ScannedItem } from '../types';

/** Types média considérés comme textuels (le reste : binaire, non lu, déclaré). */
const TEXTUAL_MEDIA = new Set([
  'text/plain', 'text/csv', 'text/html', 'text/markdown', 'text/xml',
  'application/json', 'application/x-yaml', 'application/yaml',
  'application/x-sh', 'application/javascript', 'application/xml',
]);

/** Extensions textuelles usuelles quand le type média est absent ou générique. */
const TEXTUAL_EXTENSIONS = [
  '.txt', '.csv', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.log',
  '.env', '.pem', '.ovpn', '.sh', '.py', '.ts', '.js', '.sql', '.conf', '.ini',
];

function isTextual(meta: AttachmentMeta): boolean {
  if (TEXTUAL_MEDIA.has(meta.mediaType)) return true;
  const lower = meta.filename.toLowerCase();
  return TEXTUAL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Transforme un téléchargement borné en élément scanné — jamais d'ignoré silencieux. */
function attachmentItem(pageId: string, meta: AttachmentMeta, download: AttachmentDownload): ScannedItem {
  const base = {
    containerType: 'attachment' as const,
    field: 'text' as const,
    containerAri: childAri('attachment', meta.id),
    pageId,
    filename: meta.filename,
    sizeBytes: meta.sizeBytes,
  };
  if (download.skippedReason !== undefined) return { ...base, skippedReason: download.skippedReason };
  if (download.text === undefined) return { ...base, skippedReason: REASON_NOT_TEXT };
  return { ...base, text: download.text };
}

/** Gîte 1 — corps de page : le cas classique, macros et blocs de code inclus. */
export async function readPageBody(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const page = await client.getPage(pageId);
  return [{
    containerType: 'page', field: 'body', containerAri: pageAri(pageId), pageId,
    versionNumber: page.versionNumber, text: page.bodyStorage, sizeBytes: byteLength(page.bodyStorage),
  }];
}

/** Gîte 6 — titres et étiquettes : visibles dans les résultats de recherche. */
export async function readTitlesAndLabels(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const page = await client.getPage(pageId);
  const items: ScannedItem[] = [{
    containerType: 'page', field: 'title', containerAri: pageAri(pageId), pageId,
    versionNumber: page.versionNumber, text: page.title, sizeBytes: byteLength(page.title),
  }];
  for (const label of page.labels) {
    items.push({
      containerType: 'page', field: 'labels', containerAri: pageAri(pageId), pageId,
      text: label, sizeBytes: byteLength(label),
    });
  }
  return items;
}

/** Gîte 2 — commentaires : jamais relus, souvent hors des sauvegardes de texte. */
export async function readComments(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const comments = await client.listComments(pageId);
  return comments.map((comment): ScannedItem => ({
    containerType: 'comment', field: 'body', containerAri: childAri('comment', comment.id), pageId,
    versionNumber: comment.versionNumber, text: comment.bodyStorage,
    sizeBytes: byteLength(comment.bodyStorage),
  }));
}

/** Gîte 3 — pièces jointes : > 5 Mo ou binaire → non lu + raison (§14, §22). */
export async function readAttachments(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const metas = await client.listAttachments(pageId);
  const items: ScannedItem[] = [];
  for (const meta of metas) {
    items.push(await readOneAttachment(client, pageId, meta));
  }
  return items;
}

async function readOneAttachment(client: ConfluenceClient, pageId: string, meta: AttachmentMeta): Promise<ScannedItem> {
  if (meta.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return {
      containerType: 'attachment', field: 'text', containerAri: childAri('attachment', meta.id),
      pageId, filename: meta.filename, sizeBytes: meta.sizeBytes, skippedReason: REASON_TOO_LARGE,
    };
  }
  if (!isTextual(meta)) {
    return {
      containerType: 'attachment', field: 'text', containerAri: childAri('attachment', meta.id),
      pageId, filename: meta.filename, sizeBytes: meta.sizeBytes, skippedReason: REASON_NOT_TEXT,
    };
  }
  try {
    const download = await client.downloadAttachment(pageId, meta.id, MAX_ATTACHMENT_BYTES);
    return attachmentItem(pageId, meta, download);
  } catch (error) {
    if (error instanceof ConfluenceHttpError && error.status === 403) {
      return {
        containerType: 'attachment', field: 'text', containerAri: childAri('attachment', meta.id),
        pageId, filename: meta.filename, sizeBytes: meta.sizeBytes, skippedReason: REASON_FORBIDDEN,
      };
    }
    throw error;
  }
}

/** Gîte 4 — historique de versions : le secret reste lisible dans la version 3. */
export async function readVersions(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const versions = await client.listVersions(pageId);
  const items: ScannedItem[] = [];
  for (const version of versions) {
    const content = await client.getVersionContent(pageId, version.number);
    items.push({
      containerType: 'version', field: 'body', containerAri: childAri('version', `${pageId}/${version.number}`),
      pageId, versionNumber: version.number, text: content.bodyStorage,
      sizeBytes: byteLength(content.bodyStorage),
    });
  }
  return items;
}

/** Gîte 5 — modèles de page : amplification, chaque nouvelle page recopie. */
export async function readTemplates(client: ConfluenceClient, spaceKey?: string): Promise<ScannedItem[]> {
  const templates = await client.listTemplates(spaceKey);
  return templates.map((template): ScannedItem => ({
    containerType: 'template', field: 'body', containerAri: `ari:cloud:confluence::template/${template.id}`,
    pageId: template.id, text: template.bodyStorage, sizeBytes: byteLength(template.bodyStorage),
  }));
}

/** Gîte 7 — description d'espace et page d'accueil : exposition maximale. */
export async function readSpaceDescription(client: ConfluenceClient, spaceKey: string): Promise<ScannedItem[]> {
  const space = await client.getSpaceDescription(spaceKey);
  const items: ScannedItem[] = [];
  if (space.descriptionStorage !== undefined) {
    items.push({
      containerType: 'space-desc', field: 'description', containerAri: `ari:cloud:confluence::space/${spaceKey}`,
      pageId: space.homepageId ?? spaceKey, text: space.descriptionStorage,
      sizeBytes: byteLength(space.descriptionStorage),
    });
  }
  // La page d'accueil est lue comme une page ordinaire — gîte 1, exposition 7.
  if (space.homepageId !== undefined) {
    items.push(...(await readPageBody(client, space.homepageId)));
  }
  return items;
}

/** Les sept lecteurs d'une page (gîtes 1 à 4 et 6) — une seule fonction d'orchestration. */
export async function readAllPageGites(client: ConfluenceClient, pageId: string): Promise<ScannedItem[]> {
  const [body, titles, comments, attachments, versions] = await Promise.all([
    readPageBody(client, pageId),
    readTitlesAndLabels(client, pageId),
    readComments(client, pageId),
    readAttachments(client, pageId),
    readVersions(client, pageId),
  ]);
  return [...body, ...titles, ...comments, ...attachments, ...versions];
}
