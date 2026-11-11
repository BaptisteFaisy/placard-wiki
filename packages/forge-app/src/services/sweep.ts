/**
 * Orchestration du balayage (§14, §19) : `runSweep` enchaîne wiki-source
 * (lecteurs), detectors (scan), exposure (score/lecteurs) et propagation
 * (foyers), puis écrit via le store. Trois régimes : incrémental (CQL
 * lastModified + curseur), complet (tranches d'espaces), à la demande.
 *
 * Le balayage est borné (`maxPages`) et repris sur curseur : une passe longue
 * s'arrête et repart exactement là où elle en était (§14).
 */

import {
  INITIAL_CURSOR,
  cqlFullTranche,
  cqlIncremental,
  deserializeCursor,
  searchPaginated,
  serializeCursor,
  toSweepCursor,
} from '@placard-wiki/wiki-source';
import type { PageCursor } from '@placard-wiki/wiki-source';
import { groupIntoFoyers } from '@placard-wiki/propagation';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { Foyer, PageExposure, ScanBudget, WikiFamily } from '@placard-wiki/domain';

import type { ServiceContext, SweepResult } from './ports.js';
import { computePageExposure } from './exposure.js';
import { scoreFoyer } from './scoring.js';
import { emptyAccumulator, scanPageInto } from './scan-page.js';
import type { ScanAccumulator } from './scan-page.js';

/** Paramètres d'un balayage borné. */
export interface SweepParams {
  mode: 'incremental' | 'full' | 'on-demand';
  /** Clé d'espace (incrémental/complet) ou identifiant de page (à la demande). */
  scope: string;
  /** Curseur sérialisé d'une passe interrompue. */
  cursor?: string;
  /** Borne de la passe (défaut 50 pages). */
  maxPages?: number;
}

/** Date plancher pour un premier balayage incrémental (tout l'historique). */
const EPOCH = '1970-01-01T00:00:00.000Z';

const ALL_FAMILIES = Object.keys(FAMILY_LABELS) as WikiFamily[];

/** Familles désactivées par espace (PW-24) : tout sauf `familiesEnabled`. */
async function disabledFamilies(ctx: ServiceContext, scope: string): Promise<WikiFamily[]> {
  if (scope === 'site' || scope === '') return [];
  const settings = await ctx.store.settings.get(scope);
  const enabled = new Set(settings.familiesEnabled);
  return ALL_FAMILIES.filter((f) => !enabled.has(f));
}

/** Récupère les identifiants de page de la tranche (CQL paginé, §14). */
async function collectPageIds(
  ctx: ServiceContext,
  params: SweepParams,
  maxPages: number,
): Promise<{ pageIds: string[]; cursor: PageCursor; done: boolean }> {
  if (params.mode === 'on-demand') {
    return { pageIds: [params.scope], cursor: { ...INITIAL_CURSOR, done: true }, done: true };
  }
  const from = deserializeCursor(params.cursor);
  let cql: string;
  if (params.mode === 'incremental') {
    const stored = await ctx.store.cursors.get(params.scope, 'incremental');
    const since = stored?.lastModifiedAt ?? EPOCH;
    cql = cqlIncremental(since, params.scope === 'site' ? undefined : params.scope);
  } else {
    cql = cqlFullTranche(params.scope);
  }
  const pageIds: string[] = [];
  let cursor: PageCursor = from;
  let done = false;
  for await (const batch of searchPaginated(ctx.confluence, cql, { limit: 25, maxItems: maxPages, from })) {
    for (const item of batch.items) pageIds.push(item.id);
    cursor = batch.cursor;
    done = batch.cursor.done;
    if (pageIds.length >= maxPages) break;
  }
  return { pageIds, cursor, done };
}

/** Scanne la tranche de pages dans l'accumulateur. */
async function scanSlice(
  ctx: ServiceContext,
  pageIds: readonly string[],
  acc: ScanAccumulator,
  disabled: readonly WikiFamily[],
): Promise<void> {
  for (const pageId of pageIds) {
    await scanPageInto(ctx, pageId, acc, disabled);
  }
}

/** Calcule et persiste l'exposition de chaque page touchée. */
async function computeExposures(
  ctx: ServiceContext,
  acc: ScanAccumulator,
): Promise<Map<string, PageExposure>> {
  const byPage = new Map<string, PageExposure>();
  const pageIds = new Set<string>();
  for (const d of acc.detections) pageIds.add(d.pageId);
  for (const p of acc.pages) pageIds.add(p.pageId);
  for (const pageId of pageIds) {
    const spaceKey = acc.pageSpace.get(pageId) ?? '';
    const exposure = await computePageExposure(ctx.confluence, pageId, spaceKey, {
      siteUsers: ctx.siteUsers,
      now: ctx.clock.now(),
    });
    byPage.set(pageId, exposure);
    await ctx.store.exposures.put(exposure);
  }
  return byPage;
}

/** Regroupe, score et persiste les foyers de la tranche. */
async function finalizeFoyers(
  ctx: ServiceContext,
  acc: ScanAccumulator,
  exposures: ReadonlyMap<string, PageExposure>,
): Promise<number> {
  const fingerprints = [...new Set(acc.detections.map((d) => d.fingerprint))];
  const existing = (
    await Promise.all(fingerprints.map((fp) => ctx.store.findings.byFingerprint(fp)))
  ).filter((f): f is Foyer => f !== null);
  const foyers = groupIntoFoyers(acc.detections, existing, acc.pages);
  for (const foyer of foyers) {
    const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId;
    const exposure = primary === undefined ? null : exposures.get(primary) ?? null;
    const scored = scoreFoyer(foyer, exposure, {
      testContent: acc.testFingerprints.has(foyer.fingerprint),
      knownFake: acc.knownFakeFingerprints.has(foyer.fingerprint),
      rotatedAt: foyer.rotatedAt,
      now: ctx.clock.now(),
    });
    const withSpace = exposure === null ? scored : { ...scored, spaceKey: exposure.spaceKey };
    await ctx.store.saveFoyer(withSpace);
  }
  return foyers.length;
}

/** Persiste scans de page et de pièces jointes (couverture déclarée, §14). */
async function persistScans(ctx: ServiceContext, acc: ScanAccumulator): Promise<void> {
  for (const record of acc.pageScans) await ctx.store.pageScans.put(record);
  for (const record of acc.attachmentScans) await ctx.store.attachmentScans.put(record);
}

/** Met à jour le budget du jour (§14) — compteurs jamais masqués. */
async function updateBudget(ctx: ServiceContext, acc: ScanAccumulator, pages: number, ms: number): Promise<void> {
  const day = ctx.clock.now().slice(0, 10);
  const stats = ctx.oracle.stats();
  const prev = await ctx.store.budget.get(day);
  const budget: ScanBudget = {
    day,
    pagesScanned: (prev?.pagesScanned ?? 0) + pages,
    attachmentsRead: (prev?.attachmentsRead ?? 0) + acc.attachmentsRead,
    attachmentsSkipped: (prev?.attachmentsSkipped ?? 0) + acc.attachmentsSkipped,
    llmCalls: stats.calls,
    tokens: (prev?.tokens ?? 0),
    costEstimate: prev?.costEstimate ?? 0,
    skipped: acc.attachmentScans
      .filter((a) => a.readState !== 'read')
      .map((a) => ({ kind: a.readState, reason: a.skippedReason ?? 'non lu', count: 1 })),
    lastPassMs: ms,
  };
  await ctx.store.budget.put(budget);
}

/** Lance un balayage borné (§14). */
export async function runSweep(ctx: ServiceContext, params: SweepParams): Promise<SweepResult> {
  const startedAt = ctx.clock.now();
  const t0 = Date.now();
  const maxPages = params.maxPages ?? 50;
  const disabled = await disabledFamilies(ctx, params.scope);
  const { pageIds, cursor, done } = await collectPageIds(ctx, params, maxPages);
  const acc = emptyAccumulator();
  await scanSlice(ctx, pageIds, acc, disabled);
  const exposures = await computeExposures(ctx, acc);
  const foyersTouched = await finalizeFoyers(ctx, acc, exposures);
  await persistScans(ctx, acc);
  const durationMs = Date.now() - t0;
  await updateBudget(ctx, acc, pageIds.length, durationMs);
  const runAt = ctx.clock.now();
  const sweepCursor = toSweepCursor(params.scope, params.mode, cursor, runAt);
  await ctx.store.cursors.put(sweepCursor);
  const blindSpots = [...new Set(acc.blindSpots)];
  return {
    mode: params.mode,
    scope: params.scope,
    pagesScanned: pageIds.length,
    attachmentsRead: acc.attachmentsRead,
    attachmentsSkipped: acc.attachmentsSkipped,
    llmCalls: ctx.oracle.stats().calls,
    tokens: 0,
    foyersTouched,
    nextCursor: done ? null : serializeCursor(cursor),
    done,
    blindSpots,
    startedAt,
    durationMs,
  };
}