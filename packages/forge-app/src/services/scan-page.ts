/**
 * Scan d'une page (§6, §7) : lit les sept gîtes via wiki-source, détecte via
 * `@placard-wiki/detectors`, tranche les candidats ambigus via l'oracle LLM
 * (cache par empreinte), et accumule détections + couverture.
 *
 * Règle absolue : aucune valeur brute ne sort d'ici. Les détections portent
 * empreinte HMAC et aperçu masqué ; les pièces jointes non lues portent leur
 * raison (§14, §19 — jamais de silence).
 */

import { createHash } from 'node:crypto';
import { buildQuestion, maskSpans, scanItem } from '@placard-wiki/detectors';
import type { DetectionCandidate, ScanItem } from '@placard-wiki/detectors';
import { readAllPageGites } from '@placard-wiki/wiki-source';
import type { ConfluenceClient, ScannedItem } from '@placard-wiki/wiki-source';
import type {
  AttachmentScanRecord,
  ContainerType,
  ContentField,
  PageScanRecord,
  WikiFamily,
} from '@placard-wiki/domain';
import type { WikiDetection, WikiPageMeta } from '@placard-wiki/propagation';

import type { ServiceContext } from './ports';

/** Version déclarée du moteur de détection (colonne `detectors_version`). */
export const DETECTORS_VERSION = 'wiki-detectors-1';

/** Accumulateur d'une passe de balayage. */
export interface ScanAccumulator {
  detections: WikiDetection[];
  pages: WikiPageMeta[];
  pageScans: PageScanRecord[];
  attachmentScans: AttachmentScanRecord[];
  blindSpots: string[];
  /** Empreintes que l'oracle a jugées « exemple/test » → malus `test-content`. */
  testFingerprints: Set<string>;
  /** Empreintes correspondant à une valeur factice connue → malus `known-fake`. */
  knownFakeFingerprints: Set<string>;
  /** Clé d'espace par page (pour l'exposition et le registre). */
  pageSpace: Map<string, string>;
  attachmentsRead: number;
  attachmentsSkipped: number;
}

export function emptyAccumulator(): ScanAccumulator {
  return {
    detections: [], pages: [], pageScans: [], attachmentScans: [],
    blindSpots: [], testFingerprints: new Set(), knownFakeFingerprints: new Set(),
    pageSpace: new Map(), attachmentsRead: 0, attachmentsSkipped: 0,
  };
}

/** ScannedItem (wiki-source) → ScanItem (detectors). */
function toScanItem(item: ScannedItem): ScanItem | null {
  if (item.text === undefined) return null;
  const out: ScanItem = {
    containerType: item.containerType,
    field: item.field,
    text: item.text,
  };
  if (item.filename !== undefined) out.filename = item.filename;
  if (item.sizeBytes !== undefined) out.sizeBytes = item.sizeBytes;
  return out;
}

/** Candidat + élément → détection wiki (empreinte, jamais la valeur). */
function toDetection(item: ScannedItem, c: DetectionCandidate, detectedAt: string): WikiDetection {
  const out: WikiDetection = {
    fingerprint: c.fingerprint,
    family: c.family as WikiFamily,
    containerType: item.containerType as ContainerType,
    containerAri: item.containerAri,
    pageId: item.pageId,
    field: item.field as ContentField,
    charStart: c.charStart,
    charEnd: c.charEnd,
    maskedPreview: c.maskedPreview,
    detectedAt,
  };
  if (item.versionNumber !== undefined) out.versionNumber = item.versionNumber;
  return out;
}

/** Interroge l'oracle sur un candidat ambigu (famille 9/11) — invite masquée. */
async function resolveAmbiguous(
  ctx: ServiceContext,
  item: ScannedItem,
  candidate: DetectionCandidate,
  acc: ScanAccumulator,
): Promise<void> {
  if (item.text === undefined) return;
  const maskedContext = maskSpans(item.text, [
    { charStart: candidate.charStart, charEnd: candidate.charEnd, family: candidate.family },
  ]);
  const question = buildQuestion(candidate, maskedContext, ctx.hmacKey);
  const answer = await ctx.oracle.ask(question);
  if (!answer.isSecret) acc.testFingerprints.add(candidate.fingerprint);
}

/** Enregistre l'état de lecture d'une pièce jointe (couverture déclarée, §14). */
function recordAttachment(acc: ScanAccumulator, item: ScannedItem, findingsCount: number): void {
  if (item.containerType !== 'attachment') return;
  const readState: AttachmentScanRecord['readState'] =
    item.skippedReason === undefined ? 'read'
      : item.skippedReason.includes('volumineux') ? 'too-large'
        : item.skippedReason.includes('binaire') ? 'not-text'
          : 'not-read';
  if (readState === 'read') acc.attachmentsRead += 1;
  else acc.attachmentsSkipped += 1;
  const record: AttachmentScanRecord = {
    attachmentId: item.containerAri,
    pageId: item.pageId,
    filename: item.filename ?? '',
    mime: '',
    size: item.sizeBytes,
    readState,
    findingsCount,
  };
  if (item.skippedReason !== undefined) record.skippedReason = item.skippedReason;
  acc.attachmentScans.push(record);
  if (item.skippedReason !== undefined) {
    acc.blindSpots.push(`Pièce jointe non lue (${item.filename ?? item.containerAri}) : ${item.skippedReason}`);
  }
}

/** Scanne un élément : détections + oracle + couverture pièce jointe. */
async function scanOneItem(
  ctx: ServiceContext,
  item: ScannedItem,
  acc: ScanAccumulator,
  detectedAt: string,
  disabled: readonly WikiFamily[],
): Promise<void> {
  const scan = toScanItem(item);
  const candidates = scan === null ? [] : scanItem(scan, { hmacKey: ctx.hmacKey, disabledFamilies: disabled });
  for (const c of candidates) {
    if (c.isKnownFake) acc.knownFakeFingerprints.add(c.fingerprint);
    if (c.ambiguous) await resolveAmbiguous(ctx, item, c, acc);
    acc.detections.push(toDetection(item, c, detectedAt));
  }
  recordAttachment(acc, item, candidates.length);
}

/** Métadonnées de page pour la timeline de propagation (§11). */
function pageMetaOf(pageId: string, title: string, createdAt: string): WikiPageMeta {
  return { pageId, title, createdAt };
}

/**
 * Scanne une page : tous ses gîtes (corps, titre, étiquettes, commentaires,
 * pièces jointes, historique de versions). Les modèles et la description
 * d'espace sont balayés à part (une fois par espace).
 */
export async function scanPageInto(
  ctx: ServiceContext,
  pageId: string,
  acc: ScanAccumulator,
  disabled: readonly WikiFamily[],
): Promise<void> {
  const detectedAt = ctx.clock.now();
  let items: ScannedItem[];
  try {
    items = await readAllPageGites(ctx.confluence, pageId);
  } catch {
    acc.pageScans.push({
      pageId, contentHash: '', versionScanned: 0, scannedAt: detectedAt,
      detectorsVersion: DETECTORS_VERSION, llmCalls: 0, tokens: 0,
      skippedReason: 'page illisible (droits manquants ou supprimée) : déclaré, pas masqué',
    });
    acc.blindSpots.push(`Page ${pageId} illisible : droits manquants ou contenu supprimé.`);
    return;
  }
  const page = await ctx.confluence.getPage(pageId).catch(() => null);
  if (page !== null) acc.pageSpace.set(pageId, page.spaceKey);
  acc.pages.push(pageMetaOf(pageId, page?.title ?? '', page?.lastModifiedAt ?? detectedAt));
  for (const item of items) {
    await scanOneItem(ctx, item, acc, detectedAt, disabled);
  }
  const bodyText = items.find((i) => i.containerType === 'page' && i.field === 'body')?.text ?? '';
  acc.pageScans.push({
    pageId,
    contentHash: `sha256:${createHash('sha256').update(bodyText).digest('hex')}`,
    versionScanned: page?.versionNumber ?? 0,
    scannedAt: detectedAt,
    detectorsVersion: DETECTORS_VERSION,
    llmCalls: 0,
    tokens: 0,
  });
}

/** Fabrique un client Confluence borné (ré-export pour lisibilité). */
export type { ConfluenceClient };