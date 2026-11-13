/**
 * Couverture RÉELLE (§6, §14, §19, §25.18) : ce que le balayage a réellement
 * pu lire, gîte par gôte, et le pourcentage qui en découle — avec sa méthode.
 *
 * Deux mesures, jamais confondues :
 *
 *  - la mesure **par élément** (`scanned`, `skipped`) : ce que la passe a lu
 *    dans le store — un corps de page, une pièce jointe, un commentaire ;
 *  - la mesure **par page** (`pagesRead`, `pagesUnread`, `pagesInaccessible`) :
 *    l'état de chaque gîte, page par page — c'est elle qui donne le
 *    pourcentage de couverture et son dénominateur.
 *
 * Règle d'honnêteté : aucun chiffre n'est écrit ici. Tout est dérivé de l'état
 * réel du store — les lignes `gite_scan` (mesure par page) et `gite_coverage`
 * (mesure par élément, cumulée sur la journée) écrites par la dernière passe,
 * comme le budget du jour. Trois états par gîte, jamais mélangés :
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
import type {
  AttachmentScanRecord,
  CoverageReportReelle,
  Gite,
  GiteCoverageRow,
  PageScanRecord,
} from '@placard-wiki/domain';

import type { GiteCoverageLine, GiteScanRecord } from '../store/ports';
import type { ServiceContext } from './ports';

/**
 * Les types de la couverture enrichie appartiennent au domaine : le contrat
 * public de l'API live les décrit, et le site les consomme (§19).
 */
export type {
  CoverageReportReelle,
  GiteCoverageDetail,
  GiteCoverageRow,
  GiteCoverageState,
} from '@placard-wiki/domain';

/* -------------------------------------------------------------------------
 * Vocabulaire : angle mort vs pas de droit
 * ---------------------------------------------------------------------- */

/**
 * Angles morts déclarés (§6, §19, PW-29) — affichés même quand rien n'a été
 * balayé.
 *
 * Le gîte 7 (description d'espace) n'y est plus : la passe le lit (§6), donc
 * ce n'est plus un angle mort — c'est un gîte mesuré.
 */
export const DECLARED_BLIND_SPOTS: readonly string[] = [
  'Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.',
  'Captures d’écran : aucun OCR, les secrets d’une image échappent au balayage texte (§24) — angle mort déclaré.',
  'Modèles de page (gîte 5) : hors de la passe de pages (§6) — angle mort déclaré.',
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
 * Les sept gîtes et leurs états
 * ---------------------------------------------------------------------- */

/** Les sept gîtes du §6, dans l'ordre du cahier. */
export const GITE_ORDER: readonly Gite[] = GITES.map((entry) => entry.gite);

/**
 * Les gîtes que la passe de pages ne tente jamais (§6) — angle mort déclaré.
 *
 * Le gîte 7 (description d'espace) n'y est plus : la passe le lit une fois par
 * espace, donc il est mesuré.
 */
export const NOT_ATTEMPTED_GITES: readonly Gite[] = ['modeles-de-page'];

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

/** L'état d'un gîte : le plus grave l'emporte (refus > non lu > lu). */
function stateOf(record: GiteScanRecord): GiteCoverageRow['state'] {
  if (record.pagesInaccessible > 0) return 'inaccessible';
  if (record.pagesUnread > 0) return 'unread';
  if (record.pagesRead > 0) return 'read';
  return 'not-attempted';
}

/* -------------------------------------------------------------------------
 * La mesure par élément (ce que la passe a lu dans le store)
 * ---------------------------------------------------------------------- */

/** La forme minimale du budget dont la mesure fine a besoin. */
interface BudgetLike {
  pagesScanned: number;
  attachmentsRead: number;
  attachmentsSkipped: number;
}

/** Les compteurs d'éléments d'un gîte, avec sa raison. */
interface ElementCounts {
  scanned: number;
  skipped: number;
  reason?: string;
}

/** Le détail des pages non lues : identifiant + raison (§19). */
function unreadPageDetail(unread: readonly PageScanRecord[]): string | undefined {
  if (unread.length === 0) return undefined;
  const lines = unread.map((record) => `Page ${record.pageId} — ${record.skippedReason ?? 'raison absente'}`);
  return [...new Set(lines)].join(' · ');
}

/** Le détail des pièces jointes non lues : nom + raison (§14, PW-19). */
function unreadAttachmentDetail(unread: readonly AttachmentScanRecord[]): string | undefined {
  if (unread.length === 0) return undefined;
  const lines = unread.map((record) => {
    const name = record.filename === '' ? record.attachmentId : record.filename;
    return `${name} — ${record.skippedReason ?? 'raison absente'}`;
  });
  return [...new Set(lines)].join(' · ');
}

/**
 * La mesure fine d'un gîte, lue dans le store (`page_scan`,
 * `attachment_scan`) et le budget du jour.
 *
 * Elle n'existe que si une passe a eu lieu (le budget est connu) : sans
 * budget, la mesure par élément serait un zéro muet — on lui préfère la
 * mesure par page.
 */
function fineCounts(
  gite: Gite,
  counts: BudgetLike,
  unreadPages: readonly PageScanRecord[],
  unreadAttachments: readonly AttachmentScanRecord[],
): ElementCounts | undefined {
  if (gite === 'corps-de-page') {
    const unread = unreadPages.length;
    return {
      scanned: Math.max(0, counts.pagesScanned - unread),
      skipped: unread,
      ...(unreadPageDetail(unreadPages) !== undefined
        ? { reason: unreadPageDetail(unreadPages) as string }
        : {}),
    };
  }
  if (gite === 'pieces-jointes') {
    const unread = unreadAttachments.length;
    return {
      scanned: counts.attachmentsRead,
      skipped: unread,
      ...(unreadAttachmentDetail(unreadAttachments) !== undefined
        ? { reason: unreadAttachmentDetail(unreadAttachments) as string }
        : {}),
    };
  }
  return undefined;
}

/* -------------------------------------------------------------------------
 * La mesure par page (l'état de chaque gîte, page par page)
 * ---------------------------------------------------------------------- */

/** Les compteurs d'éléments quand la mesure fine du store manque. */
function elementCountsOf(
  scan: GiteScanRecord | undefined,
  line: GiteCoverageLine | undefined,
): ElementCounts {
  if (line !== undefined) return { scanned: line.scanned, skipped: line.skipped };
  if (scan === undefined) return { scanned: 0, skipped: 0 };
  return { scanned: scan.pagesRead, skipped: scan.pagesUnread + scan.pagesInaccessible };
}

/** La raison d'un gîte : la plus précise des trois mesures, sinon le doute. */
function reasonOf(
  scan: GiteScanRecord | undefined,
  line: GiteCoverageLine | undefined,
  gite: Gite,
): string | undefined {
  if (line?.reason !== undefined) return line.reason;
  if (scan !== undefined) return scan.reason === '' ? undefined : scan.reason;
  if (NOT_ATTEMPTED_GITES.includes(gite)) return NOT_ATTEMPTED_REASON;
  return NEVER_MEASURED_REASON;
}

/**
 * La ligne d'un gîte : la mesure par page, et la mesure par élément quand le
 * store en porte une.
 *
 * Priorité des compteurs : la mesure fine du store (éléments) d'abord, la
 * mesure de la passe (`gite_coverage`) ensuite, la mesure par page en dernier
 * recours. La raison, elle, est la plus précise des trois.
 */
function rowFor(
  gite: Gite,
  scan: GiteScanRecord | undefined,
  line: GiteCoverageLine | undefined,
  elements: ElementCounts | undefined,
): GiteCoverageRow {
  const pages = scan === undefined
    ? { pagesRead: 0, pagesUnread: 0, pagesInaccessible: 0, state: 'not-attempted' as const }
    : {
      pagesRead: scan.pagesRead,
      pagesUnread: scan.pagesUnread,
      pagesInaccessible: scan.pagesInaccessible,
      state: stateOf(scan),
    };
  const counted = elements ?? elementCountsOf(scan, line);
  const reason = elements?.reason ?? reasonOf(scan, line, gite);
  return {
    gite,
    scanned: counted.scanned,
    skipped: counted.skipped,
    ...(reason !== undefined ? { reason } : {}),
    ...pages,
  };
}

/* -------------------------------------------------------------------------
 * Le pourcentage et sa méthode
 * ---------------------------------------------------------------------- */

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
  const untouched = rows.filter((row) => row.state === 'not-attempted' && row.pagesRead === 0
    && row.pagesUnread === 0 && row.pagesInaccessible === 0);
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
    + `${String(pagesRead)} ÷ (${String(GITE_ORDER.length)} × ${String(pagesTargeted)}) = ${String(percent)} %. `
    + 'Mesure cumulée sur la journée : une passe sans nouveau contenu ne fait pas '
    + 'retomber le chiffre.';
  return formula
    + ` ${String(covered)} gîte(s) couvert(s) sur ${String(GITE_ORDER.length)} : ${coveredList(rows)}.`
    + refusedList(rows)
    + untouchedList(rows);
}

/* -------------------------------------------------------------------------
 * Le rapport
 * ---------------------------------------------------------------------- */

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

/** Les entrées du rapport : une par gîte, les sept toujours listées. */
function rowsOf(
  scans: readonly GiteScanRecord[],
  lines: readonly GiteCoverageLine[],
  counts: BudgetLike,
  unreadPages: readonly PageScanRecord[],
  unreadAttachments: readonly AttachmentScanRecord[],
  known: boolean,
): GiteCoverageRow[] {
  const byScan = new Map(scans.map((record) => [record.gite, record]));
  const byLine = new Map(lines.map((line) => [line.gite, line]));
  return GITE_ORDER.map((gite) => rowFor(
    gite,
    byScan.get(gite),
    byLine.get(gite),
    known ? fineCounts(gite, counts, unreadPages, unreadAttachments) : undefined,
  ));
}

/**
 * Le rapport de couverture (§19) : l'état réel du store, jamais des compteurs
 * statiques. « Pas de droit » est distingué de « pas de données » (§25.18),
 * chaque pièce jointe non lue porte sa raison (§25.17, PW-19) et les angles
 * morts restent déclarés même quand aucune passe n'a eu lieu.
 */
export async function coverageReport(ctx: ServiceContext): Promise<CoverageReportReelle> {
  const day = ctx.clock.now().slice(0, 10);
  const budget = await ctx.store.budget.get(day);
  const unreadPages = await ctx.store.pageScans.listSkipped();
  const unreadAttachments = await ctx.store.attachmentScans.listSkipped();
  const scans = await ctx.store.giteScans.list();
  const lines = await ctx.store.giteCoverage.list(day);
  const unread = classifyUnreadPages(unreadPages);
  const counts: BudgetLike = budget ?? { pagesScanned: 0, attachmentsRead: 0, attachmentsSkipped: 0 };
  const rows = rowsOf(scans, lines, counts, unreadPages, unreadAttachments, budget !== null);
  const pagesTargeted = pagesTargetedOf(rows);
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
