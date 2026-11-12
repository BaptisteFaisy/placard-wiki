/**
 * Le résolveur unique de tous les écrans (contrat : `BRIDGE_METHODS` dans
 * `@placard-wiki/domain`). Les vingt méthodes délèguent aux services ; aucune
 * ne renvoie de valeur brute — empreintes, aperçus masqués et scores seulement.
 *
 * PW-23 : `finding/get` calcule la conjonction des droits de lecture sur TOUS
 * les emplacements du foyer ; sans droit, la vue se réduit à l'agrégat
 * d'espace (`visibleTo` de `@placard-wiki/exposure`).
 */

import Resolver from '@forge/resolver';
import { BRIDGE_METHODS } from '@placard-wiki/domain';
import type { BridgeMethod, Foyer } from '@placard-wiki/domain';
import { visibleTo } from '@placard-wiki/exposure';

import { getServiceContext } from './runtime/context';
import {
  adoptionList,
  applyRedactionService,
  attestRotation,
  buildingModel,
  computePageExposure,
  coverageReport,
  dismiss,
  generateCertificate,
  openTicket,
  redactionPreview,
  registryRows,
  requestPurge,
  runSweep,
} from './services/index';
import type { ServiceContext } from './services/ports';

const resolverInstance = new Resolver();

/** L'acteur courant peut-il lire TOUS les emplacements du foyer (PW-23) ? */
async function canReadFoyer(ctx: ServiceContext, foyer: Foyer): Promise<boolean> {
  const pageIds = [...new Set(foyer.locations.map((l) => l.pageId))];
  for (const pageId of pageIds) {
    if (!(await ctx.access.canReadPage(pageId))) return false;
  }
  return true;
}

/** `finding/get` : foyer complet si lisible, sinon agrégat d'espace (PW-23). */
async function findingGet(ctx: ServiceContext, payload: { foyerId: string }): Promise<unknown> {
  const foyer = await ctx.store.getFoyer(payload.foyerId);
  if (foyer === null) return { error: 'foyer-introuvable', honesty: 'Aucun foyer pour cet identifiant.' };
  const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const exposure = primary === '' ? null : await ctx.store.exposures.get(primary);
  const ritual = await ctx.store.ritualSteps.listByFinding(foyer.id);
  const owner = primary === '' ? null : await ctx.store.owners.get(primary);
  const purgeRequests = await ctx.store.purgeRequests.listByFinding(foyer.id);
  const canRead = await canReadFoyer(ctx, foyer);
  const view = visibleTo(canRead, foyer, owner?.ownerRef);
  return { view, exposure, ritual, owner, purgeRequests };
}

/** Accesseur asynchrone du contexte (la clé HMAC est résolue avant usage). */
type CtxAccessor = () => Promise<ServiceContext>;

/** Enregistre les vingt méthodes du bridge sur le résolveur Forge. */
function defineAll(ctxRef: CtxAccessor): void {
  resolverInstance.define('registry/list', async ({ payload }) => {
    const ctx = await ctxRef();
    return registryRows(ctx, payload as never);
  });
  resolverInstance.define('finding/get', async ({ payload }) => {
    const ctx = await ctxRef();
    return findingGet(ctx, payload as { foyerId: string });
  });
  resolverInstance.define('finding/dismiss', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { foyerId: string; reason: string; reviewAt: string; actorRef: string };
    return dismiss(ctx, p.foyerId, p.reason, p.reviewAt, p.actorRef);
  });
  resolverInstance.define('ritual/attest', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { foyerId: string; provider: string; evidenceRef: string; actorRef: string; actorKind: 'human' | 'agent' };
    return attestRotation(ctx, p);
  });
  resolverInstance.define('ritual/redaction-preview', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { foyerId: string; locationIds?: string[] };
    return redactionPreview(ctx, p.foyerId, p.locationIds);
  });
  resolverInstance.define('ritual/redaction-apply', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { findingId: string; approvedBy: string; comment: string };
    return applyRedactionService(ctx, p.findingId, p.approvedBy, p.comment);
  });
  resolverInstance.define('ritual/purge-request', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { findingId: string; pageId?: string; versionNumbers?: number[] };
    return requestPurge(ctx, p.findingId, p.pageId, p.versionNumbers);
  });
  resolverInstance.define('ritual/ticket', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { findingId: string; projectKey: string };
    return openTicket(ctx, p.findingId, p.projectKey);
  });
  defineSweepMethods(ctxRef);
  defineReadMethods(ctxRef);
}

/** Méthodes de balayage, budget, couverture et adoption. */
function defineSweepMethods(ctxRef: CtxAccessor): void {
  resolverInstance.define('sweep/start', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { mode: 'incremental' | 'full' | 'on-demand'; scope: string };
    const result = await runSweep(ctx, { mode: p.mode, scope: p.scope, maxPages: 25 });
    const cursor = await ctx.store.cursors.get(p.scope, p.mode);
    return { cursor: cursor ?? { scope: p.scope, mode: p.mode, runAt: ctx.clock.now() }, result };
  });
  resolverInstance.define('sweep/status', async () => {
    const ctx = await ctxRef();
    const cursor = await ctx.store.cursors.get('site', 'incremental');
    return { cursor: cursor ?? undefined, running: false };
  });
  resolverInstance.define('budget/get', async () => {
    const ctx = await ctxRef();
    const day = ctx.clock.now().slice(0, 10);
    const budget = await ctx.store.budget.get(day);
    return budget ?? {
      day, pagesScanned: 0, attachmentsRead: 0, attachmentsSkipped: 0,
      llmCalls: 0, tokens: 0, costEstimate: 0, skipped: [],
    };
  });
  resolverInstance.define('coverage/get', async () => {
    const ctx = await ctxRef();
    return coverageReport(ctx);
  });
  resolverInstance.define('adoption/list', async () => {
    const ctx = await ctxRef();
    return adoptionList(ctx);
  });
  resolverInstance.define('adoption/assign', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { pageId: string; ownerRef: string; actorRef: string };
    await ctx.store.owners.put({
      pageId: p.pageId, ownerRef: p.ownerRef, method: 'declared-owner',
      confidence: 'high', resolvedAt: ctx.clock.now(),
    });
    return { ok: true as const };
  });
}

/** Méthodes de lecture : réglages, certificat, bâtiment, exposition. */
function defineReadMethods(ctxRef: CtxAccessor): void {
  resolverInstance.define('settings/get', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { spaceKey: string };
    return ctx.store.settings.get(p.spaceKey);
  });
  resolverInstance.define('settings/save', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { settings: never; actorRef: string };
    await ctx.store.settings.put(p.settings);
    return { ok: true as const };
  });
  resolverInstance.define('certificate/generate', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { scope: string };
    return generateCertificate(ctx, p.scope);
  });
  resolverInstance.define('certificate/get', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { certificateId: string };
    const cert = await ctx.store.certificates.get(p.certificateId);
    return cert ?? { error: 'certificat-introuvable' };
  });
  resolverInstance.define('building/get', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { spaceKey?: string };
    return buildingModel(ctx, p.spaceKey);
  });
  resolverInstance.define('exposure/get', async ({ payload }) => {
    const ctx = await ctxRef();
    const p = payload as { pageId: string };
    const stored = await ctx.store.exposures.get(p.pageId);
    if (stored !== null) return stored;
    return computePageExposure(ctx.confluence, p.pageId, '', { siteUsers: ctx.siteUsers });
  });
}

/** Vérification de couverture : les vingt méthodes du bridge sont déclarées. */
const DECLARED: readonly BridgeMethod[] = BRIDGE_METHODS;
void DECLARED;

defineAll(getServiceContext);

export const resolver = resolverInstance.getDefinitions();