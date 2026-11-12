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
  Gite,
  PageScanRecord,
  WikiFamily,
} from '@placard-wiki/domain';
import type { WikiDetection, WikiPageMeta } from '@placard-wiki/propagation';

import type { ServiceContext } from './ports';
import { describeGiteFailure } from './coverage';
import type { GiteCoverageLine } from '../store/ports';

/** Version déclarée du moteur de détection (colonne `detectors_version`). */
export const DETECTORS_VERSION = 'wiki-detectors-1';

/**
 * Ce qu'un gîte a donné sur une page : lu, accessible mais pas entièrement lu,
 * ou inaccessible. C'est la MATIÈRE PREMIÈRE de la couverture réelle — elle
 * est comptée page par page, jamais estimée (§14, §19).
 */
export interface GiteOutcome {
  /** Le gîte (§6). */
  gite: Gite;
  /** Pages où le gîte a été lu. */
  pagesRead: number;
  /** Pages accessibles dont une partie n'a pas pu être lue (binaire, taille…). */
  pagesUnread: number;
  /** Pages où l'accès a été refusé — droits manquants, pas « pas de données ». */
  pagesInaccessible: number;
  /** Raisons distinctes (jamais de valeur, jamais de texte de page). */
  reasons: string[];
}

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
  /**
   * Couverture par gîte (§6) : ce que la passe a **réellement** lu, en
   * ÉLÉMENTS (un corps de page, une pièce jointe, un commentaire).
   * Clé = nom de gîte ; la valeur porte les compteurs et, si le gîte a été
   * illisible, la raison exacte (scope manquant, chemin retiré…).
   */
  gites: Map<string, GiteCoverageLine>;
  /**
   * Ce que chaque gîte a donné, page par page — la couverture mesurée.
   * C'est la mesure qui porte le pourcentage : elle dit, pour chaque gîte,
   * combien de PAGES ont été lues, illisibles ou refusées.
   */
  giteOutcomes: Map<Gite, GiteOutcome>;
}

export function emptyAccumulator(): ScanAccumulator {
  return {
    detections: [], pages: [], pageScans: [], attachmentScans: [],
    blindSpots: [], testFingerprints: new Set(), knownFakeFingerprints: new Set(),
    pageSpace: new Map(), attachmentsRead: 0, attachmentsSkipped: 0,
    gites: new Map(),
    giteOutcomes: new Map(),
  };
}

/** Note la lecture (ou l'échec) d'un gîte dans l'accumulateur de la passe. */
export function noteGite(
  acc: ScanAccumulator,
  gite: Gite,
  scanned: number,
  reason?: string,
): void {
  const previous = acc.gites.get(gite);
  acc.gites.set(gite, {
    gite,
    scanned: (previous?.scanned ?? 0) + scanned,
    skipped: previous?.skipped ?? 0,
    ...(reason !== undefined ? { reason } : previous?.reason !== undefined ? { reason: previous.reason } : {}),
  });
}

/**
 * Agrège le résultat d'un gîte (une page) dans l'accumulateur de la passe.
 *
 * Compteur de PAGES : c'est la mesure qui porte le pourcentage de couverture
 * et son dénominateur (§14, §19).
 */
export function accumulateGiteOutcome(acc: ScanAccumulator, outcome: GiteOutcome): void {
  const current = acc.giteOutcomes.get(outcome.gite);
  if (current === undefined) {
    acc.giteOutcomes.set(outcome.gite, { ...outcome, reasons: [...outcome.reasons] });
    return;
  }
  current.pagesRead += outcome.pagesRead;
  current.pagesUnread += outcome.pagesUnread;
  current.pagesInaccessible += outcome.pagesInaccessible;
  for (const reason of outcome.reasons) {
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
  }
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

/**
 * Découpe les intervalles des autres candidats pour qu'aucun ne chevauche le
 * span du candidat qui pose question — sans pour autant l'écarter : une règle
 * large (un tableau d'identifiants) peut contenir la valeur ambiguë, et c'est
 * elle qui masque le reste. Écarter la règle large laisserait les autres
 * valeurs du tableau en clair dans l'invite.
 */
function sansChevauchement(
  candidats: readonly DetectionCandidate[],
  prioritaire: DetectionCandidate,
): Array<{ charStart: number; charEnd: number; family: string }> {
  const out: Array<{ charStart: number; charEnd: number; family: string }> = [];
  for (const autre of candidats) {
    if (autre === prioritaire) continue;
    const avant = autre.charStart < prioritaire.charStart && autre.charEnd > prioritaire.charStart;
    const apres = autre.charEnd > prioritaire.charEnd && autre.charStart < prioritaire.charEnd;
    if (!avant && !apres) {
      out.push({ charStart: autre.charStart, charEnd: autre.charEnd, family: autre.family });
      continue;
    }
    if (autre.charStart < prioritaire.charStart) {
      out.push({ charStart: autre.charStart, charEnd: prioritaire.charStart, family: autre.family });
    }
    if (autre.charEnd > prioritaire.charEnd) {
      out.push({ charStart: prioritaire.charEnd, charEnd: autre.charEnd, family: autre.family });
    }
  }
  return out;
}

/**
 * Interroge l'oracle sur un candidat ambigu (famille 9/11) — invite masquée.
 *
 * ⚠ Le contexte masqué couvre **tous** les candidats détectés dans l'élément,
 * pas seulement celui qui pose question. Sinon une valeur voisine (une clé
 * cloud dans le même tableau d'identifiants) resterait en clair dans l'invite
 * envoyée au modèle — mesuré le 12 novembre 2026, c'est ce que la preuve de
 * non-fuite a mis au jour.
 *
 * Le span du candidat qui pose question passe en premier : il gagne tout
 * chevauchement, pour qu'aucune valeur ne survive au masquage.
 */
async function resolveAmbiguous(
  ctx: ServiceContext,
  item: ScannedItem,
  candidate: DetectionCandidate,
  candidats: readonly DetectionCandidate[],
  acc: ScanAccumulator,
): Promise<void> {
  if (item.text === undefined) return;
  const maskedContext = maskSpans(item.text, [
    { charStart: candidate.charStart, charEnd: candidate.charEnd, family: candidate.family },
    ...sansChevauchement(candidats, candidate),
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
export async function scanOneItem(
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
    if (c.ambiguous) await resolveAmbiguous(ctx, item, c, candidates, acc);
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
  gite: Gite;
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
 * manquants, chemin retiré) est déclaré en angle mort ; il ne fait pas perdre
 * la page entière — mesuré le 12 novembre 2026 : l'identité de l'app n'a
 * accès qu'à la recherche, pas aux points d'accès directs de contenu.
 *
 * Renvoie aussi les échecs : c'est au tour de la page de décider si l'échec
 * est un DROIT manquant (page entière illisible) ou un angle mort partiel.
 * Chaque gîte est noté dans l'accumulateur : la couverture mesure ce qui a
 * été **lu**, pas ce qui était espéré.
 */
async function readPageGites(
  ctx: ServiceContext,
  pageId: string,
  acc: ScanAccumulator,
): Promise<{ items: ScannedItem[]; failures: string[] }> {
  const items: ScannedItem[] = [];
  const failures: string[] = [];
  for (const gite of PAGE_GITES) {
    try {
      const read = await gite.read(ctx.confluence, pageId);
      items.push(...read);
      noteGite(acc, gite.gite, read.length);
      accumulateGiteOutcome(acc, outcomeOf(gite.gite, read));
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const reason = describeGiteFailure(raw);
      failures.push(`« ${gite.gite} » : ${reason}`);
      noteGite(acc, gite.gite, 0, raw);
      accumulateGiteOutcome(acc, {
        gite: gite.gite,
        pagesRead: 0,
        pagesUnread: 0,
        pagesInaccessible: 1,
        reasons: [reason],
      });
    }
  }
  return { items, failures };
}

/**
 * Le verdict d'un gîte sur UNE page : lu, partiellement lu, ou inaccessible.
 *
 * Un gîte dont un élément n'a pas pu être lu (binaire, trop volumineux) n'est
 * pas « lu » : il est *partiellement* lu. Un gîte inaccessible est un accès
 * refusé — droits manquants, jamais « pas de données » (§25.18).
 */
function outcomeOf(gite: Gite, items: readonly ScannedItem[]): GiteOutcome {
  const reasons = [...new Set(items
    .filter((item) => item.skippedReason !== undefined)
    .map((item) => item.skippedReason as string))];
  return {
    gite,
    pagesRead: reasons.length === 0 ? 1 : 0,
    pagesUnread: reasons.length === 0 ? 0 : 1,
    pagesInaccessible: 0,
    reasons,
  };
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
  const { items, failures } = await readPageGites(ctx, pageId, acc);
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