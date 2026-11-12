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
import {
  readAttachments, readComments, readPageBody, readTitlesAndLabels, readVersions,
} from '@placard-wiki/wiki-source';
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

/** Un gîte de la page et son lecteur (§6) — lu un par un, jamais tout ou rien. */
interface GiteReader {
  gite: string;
  read: (client: ConfluenceClient, pageId: string) => Promise<ScannedItem[]>;
}

/** Les cinq gîtes d'une page : corps, titres, commentaires, pièces, versions. */
const PAGE_GITES: readonly GiteReader[] = [
  { gite: 'corps-de-page', read: (client, pageId) => readPageBody(client, pageId) },
  { gite: 'titres-et-etiquettes', read: (client, pageId) => readTitlesAndLabels(client, pageId) },
  { gite: 'commentaires', read: (client, pageId) => readComments(client, pageId) },
  { gite: 'pieces-jointes', read: (client, pageId) => readAttachments(client, pageId) },
  { gite: 'historique-de-versions', read: (client, pageId) => readVersions(client, pageId) },
];

/**
 * Lit les gîtes d'une page **un par un**. Un gîte hors de portée (droits
 * manquants, 401) est déclaré en angle mort ; il ne fait pas perdre la page
 * entière — mesuré le 12 novembre 2026 : l'identité de l'app n'a accès qu'à
 * la recherche, pas aux points d'accès directs de contenu.
 *
 * Renvoie aussi les échecs : c'est au tour de la page de décider si l'échec
 * est un DROIT manquant (page entière illisible) ou un angle mort partiel.
 */
async function readPageGites(
  ctx: ServiceContext,
  pageId: string,
): Promise<{ items: ScannedItem[]; failures: string[] }> {
  const items: ScannedItem[] = [];
  const failures: string[] = [];
  for (const gite of PAGE_GITES) {
    try {
      items.push(...await gite.read(ctx.confluence, pageId));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`« ${gite.gite} » : ${reason}`);
    }
  }
  return { items, failures };
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
  const { items, failures } = await readPageGites(ctx, pageId);
  if (items.length === 0) {
    // Page entièrement illisible : c'est un **droit manquant** tant que
    // l'inverse n'est pas prouvé (§25.18). « Pas de données » serait un
    // mensonge : on Declare l'accès refusé, la page ne part pas en angle
    // mort muet, et la raison reste lisible.
    acc.pageScans.push({
      pageId, contentHash: '', versionScanned: 0, scannedAt: detectedAt,
      detectorsVersion: DETECTORS_VERSION, llmCalls: 0, tokens: 0,
      skippedReason: `droits manquants : page ${pageId} illisible (${failures.join(' ; ')}) — accès refusé, pas absence de données`,
    });
    return;
  }
  if (failures.length > 0) {
    acc.blindSpots.push(`Gîtes illisibles de la page ${pageId} : ${failures.join(' ; ')}.`);
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

/**
 * Masque un texte libre (titre de page) : chaque valeur détectée est
 * remplacée par son **aperçu masqué**. Mesuré le 12 novembre 2026 : un titre
 * peut contenir un secret (l'espace de démonstration en contient) — le
 * publier en clair serait une fuite, même sur un faux secret (§23).
 */
export function maskText(text: string, hmacKey: string): string {
  const candidates = scanItem({ containerType: 'page', field: 'title', text }, { hmacKey });
  const spans = [...candidates].sort((a, b) => a.charStart - b.charStart);
  let out = '';
  let cursor = 0;
  for (const candidate of spans) {
    if (candidate.charEnd <= candidate.charStart) continue;
    if (candidate.charStart < cursor) continue; // intervalles chevauchants : le premier gagne
    out += text.slice(cursor, candidate.charStart);
    out += candidate.maskedPreview;
    cursor = candidate.charEnd;
  }
  return out + text.slice(cursor);
}