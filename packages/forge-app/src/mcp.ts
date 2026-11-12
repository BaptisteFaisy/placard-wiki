/**
 * Les treize outils MCP (§17), chacun sa fonction (une action = une fonction,
 * pour qu'un agent puisse les appeler une par une).
 *
 * Règles absolues :
 * - aucun outil ne renvoie de valeur brute ; aucun n'en accepte en entrée hors
 *   `check-text`, dont le texte n'est ni stocké ni journalisé ;
 * - `record-rotation` refuse un appel dont l'auteur est un agent :
 *   l'attestation est humaine (la surface MCP est une surface d'agent) ;
 * - un foyer n'est visible que par qui peut lire la page (PW-23) : sinon
 *   agrégats par espace.
 */

import { scanItem } from '@placard-wiki/detectors';
import { visibleTo } from '@placard-wiki/exposure';
import type { Foyer } from '@placard-wiki/domain';

import { getServiceContext } from './runtime/context';
import {
  applyRedactionService,
  attestRotation,
  computePageExposure,
  dismiss,
  generateCertificate,
  openTicket,
  redactionPreview,
  registryRows,
  runSweep,
  surfaceViewsForFingerprint,
} from './services/index';
import type { ServiceContext } from './services/ports';

const ctxRef = (): Promise<ServiceContext> => getServiceContext();

/** Vue d'un foyer pour un agent : empreinte, aperçu masqué, famille, score et termes. */
function foyerView(foyer: Foyer): Record<string, unknown> {
  return {
    foyerId: foyer.id,
    family: foyer.family,
    fingerprint: foyer.fingerprint,
    maskedPreview: foyer.locations[0]?.maskedPreview ?? '[aperçu indisponible]',
    score: foyer.score,
    scoreTerms: foyer.scoreTerms,
    state: foyer.state,
    locationCount: foyer.locations.length,
  };
}

/** L'acteur courant peut-il lire tous les emplacements du foyer (PW-23) ? */
async function canReadFoyer(ctx: ServiceContext, foyer: Foyer): Promise<boolean> {
  const pageIds = [...new Set(foyer.locations.map((l) => l.pageId))];
  for (const pageId of pageIds) {
    if (!(await ctx.access.canReadPage(pageId))) return false;
  }
  return true;
}

export async function scanPage(payload: { pageId: string }): Promise<unknown> {
  const ctx = await ctxRef();
  await runSweep(ctx, { mode: 'on-demand', scope: payload.pageId, maxPages: 1 });
  const foyers = await ctx.store.listFoyers({ limit: 200 });
  const onPage = foyers.filter((f) => f.locations.some((l) => l.pageId === payload.pageId));
  const visible: unknown[] = [];
  for (const foyer of onPage) {
    const canRead = await canReadFoyer(ctx, foyer);
    const owner = await ctx.store.owners.get(payload.pageId);
    visible.push(visibleTo(canRead, foyer, owner?.ownerRef));
  }
  return { pageId: payload.pageId, foyers: visible };
}

export async function scanSpace(payload: { spaceKey: string; limit?: number }): Promise<unknown> {
  const ctx = await ctxRef();
  // Un espace se balaie par CQL (`space = …`) : le régime « à la demande »
  // attend, lui, un identifiant de page — l'utiliser ici ne scannerait rien.
  const result = await runSweep(ctx, { mode: 'full', scope: payload.spaceKey, maxPages: payload.limit ?? 25 });
  return {
    spaceKey: payload.spaceKey,
    pagesScanned: result.pagesScanned,
    foyersTouched: result.foyersTouched,
    done: result.done,
    nextCursor: result.nextCursor,
    blindSpots: result.blindSpots,
  };
}

export async function listExposedSecrets(payload: {
  spaceKey?: string; minScore?: number; state?: string; limit?: number;
}): Promise<unknown> {
  const ctx = await ctxRef();
  const { rows } = await registryRows(ctx, {
    limit: payload.limit ?? 50,
    sort: 'score',
    ...(payload.spaceKey !== undefined ? { spaceKey: payload.spaceKey } : {}),
    ...(payload.minScore !== undefined ? { minScore: payload.minScore } : {}),
    ...(payload.state !== undefined ? { state: payload.state as Foyer['state'] } : {}),
  });
  // Aucune valeur brute : les lignes du registre portent empreinte + aperçu masqué.
  return { foyers: rows };
}

export async function getFinding(payload: { findingId: string }): Promise<unknown> {
  const ctx = await ctxRef();
  const foyer = await ctx.store.getFoyer(payload.findingId);
  if (foyer === null) return { error: 'foyer-introuvable' };
  const canRead = await canReadFoyer(ctx, foyer);
  const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const owner = primary === '' ? null : await ctx.store.owners.get(primary);
  const ritual = await ctx.store.ritualSteps.listByFinding(foyer.id);
  return { view: visibleTo(canRead, foyer, owner?.ownerRef), ritual };
}

/**
 * Trace une empreinte : les emplacements **du site** et les **surfaces
 * externes** connues (PW-31).
 *
 * Le rendu porte la méthode et la source de chaque observation — jamais une
 * valeur brute. Quand les empreintes ne sont pas comparables (namespaces
 * différents), l'outil le dit au lieu de rendre une liste vide qui ferait
 * croire à une absence de fuite.
 */
export async function traceFingerprint(payload: { fingerprint: string }): Promise<unknown> {
  const ctx = await ctxRef();
  const foyer = await ctx.store.findings.byFingerprint(payload.fingerprint);
  const { views, match } = await surfaceViewsForFingerprint(ctx, payload.fingerprint);
  return {
    fingerprint: payload.fingerprint,
    ...(foyer !== null ? { family: foyer.family } : {}),
    locations: foyer === null ? [] : foyer.locations.map((l) => ({
      containerType: l.containerType, pageId: l.pageId,
      versionNumber: l.versionNumber, gite: l.gite, status: l.status,
      maskedPreview: l.maskedPreview,
    })),
    surfaces: views,
    namespace: {
      id: ctx.namespace.id,
      shared: ctx.namespace.shared,
      ...(ctx.namespace.shared ? {} : {
        caveat:
          'Empreintes propres à cette installation : une autre surface ne produit la même ' +
          'empreinte que si elle partage la clé du namespace (PW-31).',
      }),
    },
    comparison: {
      comparable: match.comparable,
      namespaces: match.namespaces,
      divergent: match.divergent,
      message: match.message,
    },
  };
}

export async function getExposure(payload: { pageId: string }): Promise<unknown> {
  const ctx = await ctxRef();
  const stored = await ctx.store.exposures.get(payload.pageId);
  if (stored !== null) return stored;
  return computePageExposure(ctx.confluence, payload.pageId, '', { siteUsers: ctx.siteUsers });
}

export async function getCertificate(payload: { spaceKey?: string; site?: boolean }): Promise<unknown> {
  const ctx = await ctxRef();
  const scope = payload.site === true || payload.spaceKey === undefined ? 'site' : payload.spaceKey;
  const existing = await ctx.store.certificates.latest(scope);
  return existing ?? generateCertificate(ctx, scope);
}

/** Le seul outil qui accepte du texte — jamais stocké, jamais journalisé (§17). */
export async function checkText(payload: { text: string }): Promise<unknown> {
  const ctx = await ctxRef();
  // Aucune persistance, aucun journal : le texte ne quitte pas cette exécution.
  const candidates = scanItem(
    { containerType: 'page', field: 'text', text: payload.text },
    { hmacKey: ctx.hmacKey },
  );
  return {
    detected: candidates.map((c) => ({
      family: c.family,
      fingerprint: c.fingerprint,
      maskedPreview: c.maskedPreview,
      ambiguous: c.ambiguous,
    })),
    honesty: 'Texte examiné avant publication : ni stocké, ni journalisé (§17).',
  };
}

/** Réservé aux personnes : la surface MCP est une surface d'agent → refus (§17). */
export async function recordRotation(payload: {
  findingId: string; provider: string; evidenceRef: string;
}): Promise<unknown> {
  const ctx = await ctxRef();
  // L'attestation est un fait humain (§9). Un agent (surface MCP) est refusé ;
  // une personne atteste depuis l'écran du rituel (résolveur `ritual/attest`).
  return attestRotation(ctx, {
    foyerId: payload.findingId,
    provider: payload.provider,
    evidenceRef: payload.evidenceRef,
    actorRef: ctx.actor().accountId ?? 'agent',
    actorKind: 'agent',
  });
}

export async function requestRedaction(payload: { findingId: string; scope?: string }): Promise<unknown> {
  const ctx = await ctxRef();
  return redactionPreview(ctx, payload.findingId);
}

export async function applyRedaction(payload: {
  findingId: string; approvedBy: string; comment: string;
}): Promise<unknown> {
  const ctx = await ctxRef();
  return applyRedactionService(ctx, payload.findingId, payload.approvedBy, payload.comment);
}

export async function dismissFinding(payload: {
  findingId: string; reason: string; reviewAt: string;
}): Promise<unknown> {
  const ctx = await ctxRef();
  return dismiss(ctx, payload.findingId, payload.reason, payload.reviewAt, ctx.actor().accountId ?? 'inconnu');
}

export async function openRemediationTicket(payload: {
  findingId: string; projectKey: string;
}): Promise<unknown> {
  const ctx = await ctxRef();
  return openTicket(ctx, payload.findingId, payload.projectKey);
}