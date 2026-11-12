/**
 * Vues dérivées du registre (§10, §16) : lignes du registre, bâtiment,
 * couverture, file d'adoption et état du balayage.
 *
 * Règle PW-23 : ces vues ne transportent que des empreintes, aperçus masqués,
 * scores et agrégats — jamais de valeur brute. La visibilité par foyer est
 * tranchée par le résolveur (`visibleTo`), pas ici.
 */

import type {
  AttachmentScanRecord,
  BuildingModel,
  CoverageReport,
  Foyer,
  PageScanRecord,
  RegistryRow,
  ScanBudget,
} from '@placard-wiki/domain';
import type { ServiceContext } from './ports';

/** Ligne de registre d'un foyer (information identique au bâtiment, PW-15). */
export async function toRegistryRow(ctx: ServiceContext, foyer: Foyer): Promise<RegistryRow> {
  const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const exposure = primary === '' ? null : await ctx.store.exposures.get(primary);
  const owner = primary === '' ? null : await ctx.store.owners.get(primary);
  const inCurrentVersion = foyer.locations.some((l) => l.status === 'present' && l.containerType !== 'version');
  const inHistory = foyer.locations.some((l) => l.status === 'present' && l.containerType === 'version');
  const row: RegistryRow = {
    foyerId: foyer.id,
    family: foyer.family,
    maskedPreview: foyer.locations[0]?.maskedPreview ?? '[aperçu indisponible]',
    score: foyer.score,
    state: foyer.state,
    spaceKey: foyer.spaceKey ?? exposure?.spaceKey ?? 'inconnu',
    pageTitle: primary,
    pageId: primary,
    locationCount: foyer.locations.length,
    inCurrentVersion,
    inHistory,
    readersLow: exposure?.readers.low ?? 0,
    readersHigh: exposure?.readers.high ?? 0,
    sharing: exposure?.sharing ?? 'space-default',
    aiSurface: exposure?.aiSurface.presumedIndexed ?? false,
    lastSeenAt: foyer.lastSeenAt,
  };
  if (owner?.ownerRef !== undefined) row.ownerRef = owner.ownerRef;
  if (owner !== null) row.ownerMethod = owner.method;
  return row;
}

/** Liste du registre, triée (score/dernière vue/lecteurs), bornée. */
export async function registryRows(
  ctx: ServiceContext,
  query: { spaceKey?: string; family?: Foyer['family']; state?: Foyer['state']; minScore?: number; sort?: string; limit: number },
): Promise<{ rows: RegistryRow[]; total: number }> {
  const foyers = await ctx.store.listFoyers({
    limit: query.limit,
    ...(query.spaceKey !== undefined ? { spaceKey: query.spaceKey } : {}),
    ...(query.family !== undefined ? { family: query.family } : {}),
    ...(query.state !== undefined ? { state: query.state } : {}),
    ...(query.minScore !== undefined ? { minScore: query.minScore } : {}),
  });
  const rows = await Promise.all(foyers.map((f) => toRegistryRow(ctx, f)));
  const sorted = sortRows(rows, query.sort);
  return { rows: sorted, total: sorted.length };
}

function sortRows(rows: RegistryRow[], sort?: string): RegistryRow[] {
  const copy = [...rows];
  if (sort === 'lastSeen') copy.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  else if (sort === 'readers') copy.sort((a, b) => b.readersHigh - a.readersHigh);
  else copy.sort((a, b) => b.score - a.score);
  return copy;
}

/** Le bâtiment (§10) : ailes = espaces, pièces = pages, courants d'air = propagation. */
export async function buildingModel(ctx: ServiceContext, spaceKey?: string): Promise<BuildingModel> {
  const foyers = await ctx.store.listFoyers({
    limit: 100000,
    ...(spaceKey !== undefined ? { spaceKey } : {}),
  });
  const wings = new Map<string, BuildingModel['wings'][number]>();
  for (const foyer of foyers) {
    const space = foyer.spaceKey ?? 'inconnu';
    if (!wings.has(space)) wings.set(space, { spaceKey: space, floors: [], drafts: [] });
    const wing = wings.get(space) as BuildingModel['wings'][number];
    addRooms(wing, foyer);
    addDrafts(wing, foyer);
  }
  return { wings: [...wings.values()] };
}

function addRooms(wing: BuildingModel['wings'][number], foyer: Foyer): void {
  for (const loc of foyer.locations) {
    if (loc.containerType === 'version') continue;
    let floor = wing.floors.find((f) => f.depth === 0);
    if (floor === undefined) {
      floor = { depth: 0, rooms: [] };
      wing.floors.push(floor);
    }
    if (floor.rooms.some((r) => r.pageId === loc.pageId)) continue;
    floor.rooms.push({
      pageId: loc.pageId,
      title: loc.pageId,
      audience: 0,
      locked: false,
      openWindow: false,
      maxDanger: foyer.score,
      cellarOpen: foyer.locations.some((l) => l.containerType === 'version' && l.status === 'present'),
      poster: loc.containerType === 'template',
      walled: false,
      sealCount: foyer.state === 'sealed' ? 1 : 0,
      ribbonCount: foyer.state === 'dismissed' ? 1 : 0,
    });
  }
}

function addDrafts(wing: BuildingModel['wings'][number], foyer: Foyer): void {
  const pages = [...new Set(foyer.locations.filter((l) => l.containerType !== 'version').map((l) => l.pageId))];
  for (let i = 0; i + 1 < pages.length; i += 1) {
    wing.drafts.push({ fromPageId: pages[i] as string, toPageId: pages[i + 1] as string, fingerprint: foyer.fingerprint });
  }
}

/** Angles morts déclarés (§6, §19, PW-29) — affichés même quand rien n'a été balayé. */
export const DECLARED_BLIND_SPOTS: readonly string[] = [
  'Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.',
  'Captures d’écran : aucun OCR, les secrets d’une image échappent au balayage texte (§24) — angle mort déclaré.',
  'Modèles de page et description d’espace (gîtes 5 et 7) : hors de la passe de pages (§6) — angle mort déclaré.',
];

/** Droit du graphe à valider (§12, §22) — déclaré même avant toute résolution. */
export const GRAPH_RIGHTS_TO_VALIDATE =
  'read:graph:document / read:graph:project : résolution de propriétaire par le graphe à valider (§12, §22).';

/** Marques textuelles d'un droit manquant (§19) — jamais « pas de données ». */
const MISSING_RIGHT_MARKERS: readonly string[] = [
  'pas de droit', 'droit manquant', 'droits manquants', 'droits insuffisants',
];

/** Le texte déclare-t-il un droit manquant, et non une simple absence de données ? */
export function declaresMissingRight(text: string): boolean {
  const lowered = text.toLowerCase();
  return MISSING_RIGHT_MARKERS.some((marker) => lowered.includes(marker));
}

/** Une ligne de couverture par gîte : lus, non lus, et pourquoi (§14). */
type GiteCoverage = CoverageReport['perGite'][number];

/** Budget du jour — compteurs de la dernière passe, null si aucune passe. */
function budgetOfDay(ctx: ServiceContext): Promise<ScanBudget | null> {
  return ctx.store.budget.get(ctx.clock.now().slice(0, 10));
}

/** Libellé d'une pièce jointe non lue : nom (ou ARI) + raison (§14, PW-19). */
function attachmentLabel(record: AttachmentScanRecord): string {
  const name = record.filename === '' ? record.attachmentId : record.filename;
  return `${name} — ${record.skippedReason ?? 'raison absente'}`;
}

/** Gîte 3 — pièces jointes : chaque non-lue est listée avec sa raison. */
async function attachmentGite(ctx: ServiceContext): Promise<GiteCoverage> {
  const budget = await budgetOfDay(ctx);
  const unread = await ctx.store.attachmentScans.listSkipped();
  const reasons = [...new Set(unread.map(attachmentLabel))];
  const gite: GiteCoverage = { gite: 'pieces-jointes', scanned: budget?.attachmentsRead ?? 0, skipped: unread.length };
  return reasons.length === 0 ? gite : { ...gite, reason: reasons.join(' · ') };
}

/** Libellé d'une page non lue : identifiant + raison (§19). */
function pageLabel(record: PageScanRecord): string {
  return `Page ${record.pageId} — ${record.skippedReason ?? 'raison absente'}`;
}

/** Gîte 1 — corps de page : pages lues = tentées − illisibles, non lues listées. */
async function pageGite(ctx: ServiceContext): Promise<GiteCoverage> {
  const budget = await budgetOfDay(ctx);
  const unread = await ctx.store.pageScans.listSkipped();
  const attempted = budget?.pagesScanned ?? 0;
  const gite: GiteCoverage = {
    gite: 'corps-de-page',
    scanned: Math.max(0, attempted - unread.length),
    skipped: unread.length,
  };
  return unread.length === 0 ? gite : { ...gite, reason: [...new Set(unread.map(pageLabel))].join(' · ') };
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

/** Pages non lues : droit manquant → droits, sinon angle mort déclaré (§19). */
async function classifyUnreadPages(ctx: ServiceContext): Promise<{ rights: string[]; blind: string[] }> {
  const unread = await ctx.store.pageScans.listSkipped();
  const rights: string[] = [];
  const blind: string[] = [];
  for (const record of unread) {
    const reason = record.skippedReason ?? 'raison absente';
    (declaresMissingRight(reason) ? rights : blind).push(pageLabel(record));
  }
  return { rights, blind };
}

/**
 * Couverture (§19) : état réel du store, jamais des compteurs statiques.
 * « Pas de droit » est distingué de « pas de données » (§25.18), chaque pièce
 * jointe non lue porte sa raison (§25.17, PW-19) et les angles morts restent
 * déclarés même quand aucune passe n'a eu lieu.
 */
export async function coverageReport(ctx: ServiceContext): Promise<CoverageReport> {
  const perGite = [await pageGite(ctx), await attachmentGite(ctx)];
  const unreadPages = await classifyUnreadPages(ctx);
  const blindSpots = [...DECLARED_BLIND_SPOTS, ...unreadPages.blind];
  const missingRights = [GRAPH_RIGHTS_TO_VALIDATE, ...await graphMissingRights(ctx), ...unreadPages.rights];
  return { perGite, blindSpots, missingRights };
}

/** File d'adoption (§12) : pages sans propriétaire résolu. */
export async function adoptionList(
  ctx: ServiceContext,
): Promise<{ pages: Array<{ pageId: string; title: string; spaceKey: string; lastEditors: string[] }> }> {
  const unresolved = await ctx.store.owners.listUnresolved();
  const pages = unresolved.map((pageId) => ({ pageId, title: pageId, spaceKey: 'inconnu', lastEditors: [] }));
  return { pages };
}