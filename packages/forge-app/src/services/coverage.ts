/**
 * Couverture RÉELLE (§6, §14, §19, §25.18) : ce que le balayage a réellement
 * pu lire, gîte par gîte, et le pourcentage qui en découle — avec sa méthode.
 *
 * Règle d'honnêteté : aucun chiffre n'est écrit ici. Tout est dérivé de l'état
 * réel du store — les lignes `gite_scan` écrites par la dernière passe, comme
 * le budget du jour. Trois états par gîte, jamais mélangés :
 *
 *   - lu            : le contenu a été lu ;
 *   - non lu        : accessible, mais pas lisible (binaire, trop volumineux) ;
 *   - inaccessible  : accès refusé — « pas de droit », PAS « pas de données ».
 *
 * Et un quatrième cas, qui n'est pas un pourcentage : sans aucune passe, la
 * couverture est INDÉTERMINÉE. Jamais 0 % : 0 % dirait « rien trouvé », alors
 * que rien n'a été regardé.
 *
 * Le vocabulaire est tenu : « angle mort » = ce qu'on ne sait pas voir, déclaré ;
 * « pas de droit » = accès refusé, distinct de « pas de données » (§25.18).
 */

import { GITES } from '@placard-wiki/domain';
import type { AttachmentScanRecord, CoverageReport, Gite, PageScanRecord } from '@placard-wiki/domain';

import type { GiteScanRecord } from '../store/ports';
import type { ServiceContext } from './ports';

/* -------------------------------------------------------------------------
 * Vocabulaire : angle mort vs pas de droit
 * ---------------------------------------------------------------------- */

/** Angles morts déclarés (§6, §19, PW-29) — affichés même quand rien n'a été balayé. */
export const DECLARED_BLIND_SPOTS: readonly string[] = [
  'Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.',
  'Captures d’écran : aucun OCR, les secrets d’une image échappent au balayage texte (§24) — angle mort déclaré.',
  'Modèles de page et description d’espace (gîtes 5 et 7) : hors de la passe de pages (§6) — angle mort déclaré.',
];

/** Droit du graphe à valider (§12, §22) — déclaré même avant toute résolution. */
export const GRAPH_RIGHTS_TO_VALIDATE =
  'read:graph:page:confluence, read:graph:project:atlassian, '
  + 'read:graph:space:confluence : résolution de propriétaire par le graphe, '
  + 'un droit par type d’objet (§12, §22).';

/** Marques textuelles d'un droit manquant (§19) — jamais « pas de données ». */
const MISSING_RIGHT_MARKERS: readonly string[] = [
  'pas de droit', 'droit manquant', 'droits manquants', 'droits insuffisants',
];

/** Le texte déclare-t-il un droit manquant, et non une simple absence de données ? */
export function declaresMissingRight(text: string): boolean {
  const lowered = text.toLowerCase();
  return MISSING_RIGHT_MARKERS.some((marker) => lowered.includes(marker));
}

/* -------------------------------------------------------------------------
 * Le détail mesuré d'un gîte
 * ---------------------------------------------------------------------- */

/** L'état d'un gîte, tel que la passe l'a mesuré — jamais déduit. */
export type GiteCoverageState = 'read' | 'unread' | 'inaccessible' | 'not-attempted';

/** Les compteurs et l'état d'un gîte. */
export interface GiteCoverageDetail {
  /** Pages où le gîte a été lu. */
  pagesRead: number;
  /** Pages accessibles dont une partie n'a pas pu être lue. */
  pagesUnread: number;
  /** Pages où l'accès a été refusé (droits manquants). */
  pagesInaccessible: number;
  /** L'état, en clair. */
  state: GiteCoverageState;
}

/** Une ligne de couverture par gîte : la forme du domaine + la mesure. */
export type GiteCoverageRow = CoverageReport['perGite'][number] & GiteCoverageDetail;

/** Le rapport de couverture : le domaine, plus le chiffre et sa méthode. */
export interface CoverageReportReelle extends CoverageReport {
  perGite: GiteCoverageRow[];
  /** La couverture réelle, en % (null = indéterminée, jamais 0 %). */
  coveragePercent: number | null;
  /** Gîtes effectivement couverts (au moins une page lue). */
  gitesCovered: number;
  /** Gîtes visés (§6). */
  gitesTotal: number;
  /** La méthode, en clair : un pourcentage sans sa méthode ne vaut rien. */
  method: string;
  /** Pages visées par la passe qui a produit la mesure. */
  pagesTargeted: number;
  /** Pages lues, tous gîtes confondus. */
  pagesRead: number;
}

/** Les sept gîtes du §6, dans l'ordre du cahier. */
export const GITE_ORDER: readonly Gite[] = GITES.map((entry) => entry.gite);

/** Les gîtes que la passe de pages ne tente jamais (§6) — angle mort déclaré. */
export const NOT_ATTEMPTED_GITES: readonly Gite[] = ['modeles-de-page', 'description-espace'];

/** Raison des gîtes hors de la passe de pages — déclarée, jamais mesurée. */
export const NOT_ATTEMPTED_REASON =
  'hors de la passe de pages (§6) — angle mort déclaré, jamais tenté par le balayage';

/** Raison d'un gîte jamais mesuré alors qu'une passe a eu lieu. */
export const NEVER_MEASURED_REASON =
  'jamais mesuré — la dernière passe n’a pas enregistré ce gîte (compteurs indisponibles)';

/** Le nom français d'un gîte (§6) — pour la méthode, qui est en français. */
function giteLabel(gite: string): string {
  return GITES.find((entry) => entry.gite === gite)?.fr ?? gite;
}

/* -------------------------------------------------------------------------
 * L'échec d'un gîte, reformulé
 * ---------------------------------------------------------------------- */

/**
 * L'échec d'un gîte, reformulé : un accès refusé est un **droit manquant**,
 * jamais une absence de données (§25.18). Le chemin est normalisé (les
 * identifiants de page sont remplacés) pour que la raison soit la même pour
 * toutes les pages d'un gîte.
 */
export function describeGiteFailure(raw: string): string {
  const status = /HTTP (\d{3})/.exec(raw)?.[1] ?? '';
  const path = (/sur (\S+)/.exec(raw)?.[1] ?? '').replace(/\d+/g, '{id}');
  const where = path === '' ? '' : ` sur ${path}`;
  if (status === '401' || status === '403') {
    return `HTTP ${status}${where} — pas de droit (accès refusé), pas absence de données`;
  }
  if (status !== '') return `HTTP ${status}${where} — accès refusé par l’API`;
  return raw;
}

/* -------------------------------------------------------------------------
 * La mesure
 * ---------------------------------------------------------------------- */

/** L'état d'un gîte : le plus grave l'emporte (refus > non lu > lu). */
function stateOf(record: GiteScanRecord): GiteCoverageState {
  if (record.pagesInaccessible > 0) return 'inaccessible';
  if (record.pagesUnread > 0) return 'unread';
  if (record.pagesRead > 0) return 'read';
  return 'not-attempted';
}

/** La ligne d'un gîte, depuis son état persisté. */
function rowOf(gite: Gite, record: GiteScanRecord | undefined): GiteCoverageRow {
  if (record === undefined) {
    const reason = NOT_ATTEMPTED_GITES.includes(gite) ? NOT_ATTEMPTED_REASON : NEVER_MEASURED_REASON;
    return {
      gite, scanned: 0, skipped: 0, reason,
      pagesRead: 0, pagesUnread: 0, pagesInaccessible: 0, state: 'not-attempted',
    };
  }
  const state = stateOf(record);
  const reason = record.reason !== '' ? record.reason : undefined;
  return {
    gite,
    scanned: record.pagesRead,
    skipped: record.pagesUnread + record.pagesInaccessible,
    ...(reason !== undefined ? { reason } : {}),
    pagesRead: record.pagesRead,
    pagesUnread: record.pagesUnread,
    pagesInaccessible: record.pagesInaccessible,
    state,
  };
}

/**
 * Les pages visées par la passe : la plus haute somme des compteurs d'un
 * gîte (lu + non lu + inaccessible = pages ciblées pour ce gîte).
 */
export function pagesTargetedOf(rows: readonly GiteCoverageRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.pagesRead + row.pagesUnread + row.pagesInaccessible), 0);
}

/**
 * Le pourcentage de couverture : pages lues ÷ (gîtes visés × pages visées).
 * C'est la part des cases (gîte, page) réellement lues — chaque gîte pèse le
 * même, et un gîte lu à moitié ne compte qu'à moitié.
 */
export function coveragePercentOf(pagesRead: number, gitesTotal: number, pagesTargeted: number): number | null {
  if (gitesTotal <= 0 || pagesTargeted <= 0) return null;
  return Math.round((100 * pagesRead) / (gitesTotal * pagesTargeted) * 10) / 10;
}

/** Le nombre de gîtes effectivement couverts (au moins une page lue). */
export function gitesCoveredOf(rows: readonly GiteCoverageRow[]): number {
  return rows.filter((row) => row.pagesRead > 0).length;
}

/** La part lue d'un gîte, en clair : « 264/264 pages lues ». */
function readPart(row: GiteCoverageRow): string {
  const targeted = row.pagesRead + row.pagesUnread + row.pagesInaccessible;
  return `${String(row.pagesRead)}/${String(targeted)} pages lues`;
}

/** Les gîtes couverts, en clair : « corps de page (264/264 pages lues) ». */
function coveredList(rows: readonly GiteCoverageRow[]): string {
  const covered = rows.filter((row) => row.pagesRead > 0);
  if (covered.length === 0) return 'aucun gîte couvert';
  return covered.map((row) => `${giteLabel(row.gite)} (${readPart(row)})`).join(', ');
}

/** Les gîtes refusés, en clair — avec le nombre de pages et la raison. */
function refusedList(rows: readonly GiteCoverageRow[]): string {
  const refused = rows.filter((row) => row.pagesInaccessible > 0);
  if (refused.length === 0) return '';
  const details = refused
    .map((row) => `${giteLabel(row.gite)} (${String(row.pagesInaccessible)} pages — ${row.reason ?? 'raison absente'})`)
    .join(' ; ');
  return ` Accès refusé — pas de droit, pas absence de données : ${details}.`;
}

/** Les gîtes jamais tentés, en clair — angle mort déclaré. */
function untouchedList(rows: readonly GiteCoverageRow[]): string {
  const untouched = rows.filter((row) => row.state === 'not-attempted');
  if (untouched.length === 0) return '';
  const names = untouched.map((row) => giteLabel(row.gite)).join(', ');
  return ` Jamais tentés : ${names} — ${NOT_ATTEMPTED_REASON}.`;
}

/** La méthode, en clair : le chiffre ET sa façon de l'obtenir. */
function methodOf(rows: readonly GiteCoverageRow[], percent: number | null, pagesTargeted: number): string {
  if (percent === null) {
    return 'Pas de passe : couverture indéterminée — aucun balayage enregistré, donc aucune mesure. '
      + 'Jamais 0 % : 0 % dirait « rien trouvé », alors que rien n’a été regardé.';
  }
  const pagesRead = rows.reduce((total, row) => total + row.pagesRead, 0);
  const covered = gitesCoveredOf(rows);
  const formula = 'Couverture = (pages lues, tous gîtes) ÷ (gîtes visés × pages visées) = '
    + `${String(pagesRead)} ÷ (${String(GITE_ORDER.length)} × ${String(pagesTargeted)}) = ${String(percent)} %.`;
  return formula
    + ` ${String(covered)} gîte(s) couvert(s) sur ${String(GITE_ORDER.length)} : ${coveredList(rows)}.`
    + refusedList(rows)
    + untouchedList(rows);
}

/* -------------------------------------------------------------------------
 * Le rapport
 * ---------------------------------------------------------------------- */

/** Les lignes de couverture, depuis l'état persisté des gîtes. */
function rowsOf(records: readonly GiteScanRecord[]): GiteCoverageRow[] {
  const byGite = new Map(records.map((record) => [record.gite, record]));
  return GITE_ORDER.map((gite) => rowOf(gite, byGite.get(gite)));
}

/** Le repli : l'état que le store prouve, quand les compteurs par gîte n'ont
 * pas encore été enregistrés (passe antérieure à la mesure par gîte). Le
 * chiffre reste dérivé du store — jamais d'une constante.
 */
function legacyRows(budget: BudgetLike, unreadPages: number): GiteCoverageRow[] {
  const rows = rowsOf([]);
  const corps = rows.find((row) => row.gite === 'corps-de-page');
  const pieces = rows.find((row) => row.gite === 'pieces-jointes');
  if (corps !== undefined) {
    corps.pagesRead = Math.max(0, budget.pagesScanned - unreadPages);
    corps.pagesUnread = unreadPages;
    // Sans aucune page visée, le gîte n'a pas été mesuré — il n'est pas « lu ».
    if (corps.pagesRead + corps.pagesUnread > 0) {
      corps.state = unreadPages > 0 ? 'unread' : 'read';
    }
    corps.reason = 'dérivé du budget du jour et des scans de page — pas d’une passe par gîte';
  }
  if (pieces !== undefined) {
    pieces.pagesRead = budget.attachmentsRead;
    pieces.pagesUnread = budget.attachmentsSkipped;
    if (pieces.pagesRead + pieces.pagesUnread > 0) {
      pieces.state = pieces.pagesUnread > 0 ? 'unread' : 'read';
    }
    pieces.reason = 'dérivé du budget du jour — pas d’une passe par gîte';
  }
  return rows;
}

/** La forme minimale du budget dont le repli a besoin. */
interface BudgetLike {
  pagesScanned: number;
  attachmentsRead: number;
  attachmentsSkipped: number;
}

/** Le détail des pages non lues : identifiant + raison (§19). */
function unreadPageDetail(unread: readonly PageScanRecord[]): string {
  const lines = unread.map((record) => `Page ${record.pageId} — ${record.skippedReason ?? 'raison absente'}`);
  return [...new Set(lines)].join(' · ');
}

/** Le détail des pièces jointes non lues : nom + raison (§14, PW-19). */
function unreadAttachmentDetail(unread: readonly AttachmentScanRecord[]): string {
  const lines = unread.map((record) => {
    const name = record.filename === '' ? record.attachmentId : record.filename;
    return `${name} — ${record.skippedReason ?? 'raison absente'}`;
  });
  return [...new Set(lines)].join(' · ');
}

/** Assemble deux raisons sans en perdre aucune. */
function mergeReason(base: string | undefined, detail: string): string | undefined {
  if (detail === '') return base;
  if (base === undefined || base === '') return detail;
  return `${base} · ${detail}`;
}

/**
 * Les compteurs « objets » du domaine (pages lues, pièces jointes lues) et le
 * détail de ce qui n'a pas été lu, avec la raison de chaque élément.
 */
function applyDetails(
  rows: GiteCoverageRow[],
  budget: BudgetLike,
  unreadPages: readonly PageScanRecord[],
  unreadAttachments: readonly AttachmentScanRecord[],
): void {
  const corps = rows.find((row) => row.gite === 'corps-de-page');
  if (corps !== undefined) {
    corps.scanned = Math.max(0, budget.pagesScanned - unreadPages.length);
    corps.skipped = unreadPages.length;
    corps.reason = mergeReason(corps.reason, unreadPageDetail(unreadPages));
  }
  const pieces = rows.find((row) => row.gite === 'pieces-jointes');
  if (pieces !== undefined) {
    pieces.scanned = budget.attachmentsRead;
    pieces.skipped = unreadAttachments.length;
    pieces.reason = mergeReason(pieces.reason, unreadAttachmentDetail(unreadAttachments));
  }
}

/**
 * Les pages non lues : droit manquant → droits manquants, sinon angle mort
 * déclaré (§19, §25.18). Jamais « pas de données » pour un accès refusé.
 */
function classifyUnreadPages(
  unread: readonly PageScanRecord[],
): { rights: string[]; blind: string[] } {
  const rights: string[] = [];
  const blind: string[] = [];
  for (const record of unread) {
    const reason = record.skippedReason ?? 'raison absente';
    const line = `Page ${record.pageId} — ${reason}`;
    (declaresMissingRight(reason) ? rights : blind).push(line);
  }
  return { rights, blind };
}

/** Droits manquants du graphe, lus des résolutions de propriétaire (§12, §25.18). */
async function graphMissingRights(ctx: ServiceContext): Promise<string[]> {
  const unresolved = await ctx.store.owners.listUnresolved();
  const lines: string[] = [];
  for (const pageId of unresolved) {
    const caveat = (await ctx.store.owners.get(pageId))?.caveat;
    if (caveat !== undefined && declaresMissingRight(caveat)) {
      lines.push(`Propriétaire par le graphe — page ${pageId} : ${caveat}`);
    }
  }
  return lines;
}

/**
 * Le rapport de couverture (§19) : l'état réel du store, jamais des compteurs
 * statiques. « Pas de droit » est distingué de « pas de données » (§25.18),
 * chaque pièce jointe non lue porte sa raison (§25.17, PW-19) et les angles
 * morts restent déclarés même quand aucune passe n'a eu lieu.
 */
export async function coverageReport(ctx: ServiceContext): Promise<CoverageReportReelle> {
  const records = await ctx.store.giteScans.list();
  const unreadPages = await ctx.store.pageScans.listSkipped();
  const unreadAttachments = await ctx.store.attachmentScans.listSkipped();
  const unread = classifyUnreadPages(unreadPages);
  const budget = await ctx.store.budget.get(ctx.clock.now().slice(0, 10));
  const counts: BudgetLike = budget ?? { pagesScanned: 0, attachmentsRead: 0, attachmentsSkipped: 0 };
  const rows = records.length > 0 ? rowsOf(records) : legacyRows(counts, unreadPages.length);
  applyDetails(rows, counts, unreadPages, unreadAttachments);
  const pagesTargeted = records.length > 0 ? pagesTargetedOf(rows) : counts.pagesScanned;
  const pagesRead = rows.reduce((total, row) => total + row.pagesRead, 0);
  const percent = coveragePercentOf(pagesRead, GITE_ORDER.length, pagesTargeted);
  const report: CoverageReportReelle = {
    perGite: rows,
    blindSpots: [...DECLARED_BLIND_SPOTS, ...unread.blind],
    missingRights: [GRAPH_RIGHTS_TO_VALIDATE, ...unread.rights],
    coveragePercent: percent,
    gitesCovered: gitesCoveredOf(rows),
    gitesTotal: GITE_ORDER.length,
    method: methodOf(rows, percent, pagesTargeted),
    pagesTargeted,
    pagesRead,
  };
  report.missingRights.push(...await graphMissingRights(ctx));
  return report;
}
