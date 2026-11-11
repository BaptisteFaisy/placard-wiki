/**
 * Vues dérivées du registre (§10, §16) : lignes du registre, bâtiment,
 * couverture, file d'adoption et état du balayage.
 *
 * Règle PW-23 : ces vues ne transportent que des empreintes, aperçus masqués,
 * scores et agrégats — jamais de valeur brute. La visibilité par foyer est
 * tranchée par le résolveur (`visibleTo`), pas ici.
 */

import type {
  BuildingModel,
  CoverageReport,
  Foyer,
  RegistryRow,
} from '@placard-wiki/domain';
import type { ServiceContext } from './ports.js';

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

/** Couverture (§19) : pièces jointes non lues et pourquoi, angles morts déclarés. */
export async function coverageReport(ctx: ServiceContext): Promise<CoverageReport> {
  const perGite: CoverageReport['perGite'] = [
    { gite: 'corps-de-page', scanned: 0, skipped: 0 },
    { gite: 'pieces-jointes', scanned: 0, skipped: 0 },
  ];
  const blindSpots = [
    'Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.',
    'Captures d’écran : secrets non détectés par un balayage texte (§24).',
  ];
  const missingRights = [
    'read:graph:document / read:graph:project : résolution de propriétaire par le graphe à valider (§12, §22).',
  ];
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