/**
 * Service du rituel (§9) : attestation de rotation, caviardage (verrou PW-09),
 * purge d'historique (étape honnête), ruban, ticket Jira et certificat.
 *
 * Toute la logique métier vient de `@placard-wiki/ritual` (pure) ; ce service
 * ne fait que brancher les ports (store, écriture de page, Jira) et persister.
 * Aucune valeur brute n'est manipulée : le caviardage travaille sur des
 * positions dans le texte courant, jamais sur la valeur.
 */

import {
  applyRedaction,
  attestRotation as attestRotationPure,
  certificate as buildCertificate,
  jiraTicketPayload,
  purgeHistory,
  attachRibbon,
  redactionPreview as redactionPreviewPure,
  ritualStepStates,
} from '@placard-wiki/ritual';
import type { RedactionSource } from '@placard-wiki/ritual';
import type {
  Certificate,
  Foyer,
  OwnerResolution,
  PurgeRequest,
  RedactionDiff,
  RitualStepState,
  RotationAttestation,
} from '@placard-wiki/domain';

import type { ServiceContext } from './ports';
import { resolveOwner } from './owner';

/** Reconstruit l'attestation d'un foyer depuis ses champs persistés (§9). */
function attestationFromFoyer(foyer: Foyer, actorRef: string): RotationAttestation | undefined {
  if (foyer.rotatedAt === undefined || foyer.rotationEvidenceRef === undefined) return undefined;
  return {
    foyerId: foyer.id,
    actorRef,
    actorKind: 'human',
    provider: 'generic',
    evidenceRef: foyer.rotationEvidenceRef,
    attestedAt: foyer.rotatedAt,
    strength: 'attested',
  };
}

/** Persiste l'état des cinq étapes du rituel pour un foyer. */
async function persistSteps(ctx: ServiceContext, foyer: Foyer, attestation?: RotationAttestation): Promise<void> {
  const steps = ritualStepStates(foyer, attestation);
  for (const step of steps) await ctx.store.ritualSteps.put(step);
}

/** Étape 1 — attestation de rotation (refusée à un agent, §17). */
export async function attestRotation(
  ctx: ServiceContext,
  input: { foyerId: string; provider: string; evidenceRef: string; actorRef: string; actorKind: 'human' | 'agent' },
): Promise<{ ok: true; attestedAt: string } | { ok: false; reason: string }> {
  const result = attestRotationPure(input, ctx.clock);
  if (!result.ok) return { ok: false, reason: result.reason };
  const foyer = await ctx.store.getFoyer(input.foyerId);
  if (foyer === null) return { ok: false, reason: 'Foyer introuvable.' };
  const attestedAt = result.attestation.attestedAt;
  const updated: Foyer = {
    ...foyer,
    state: foyer.state === 'open' ? 'rotation-attested' : foyer.state,
    rotatedAt: attestedAt,
    rotationEvidenceRef: result.attestation.evidenceRef,
  };
  await ctx.store.saveFoyer(updated);
  const step: RitualStepState = {
    foyerId: foyer.id, step: 'rotate', state: 'done',
    actorRef: input.actorRef, attestationRef: result.attestation.evidenceRef, at: attestedAt,
  };
  await ctx.store.ritualSteps.put(step);
  await persistSteps(ctx, updated, result.attestation);
  return { ok: true, attestedAt };
}

/** Construit les sources de caviardage depuis le texte courant des pages. */
async function buildRedactionSources(
  ctx: ServiceContext,
  foyer: Foyer,
  locationIds?: readonly string[],
): Promise<RedactionSource[]> {
  const wanted = locationIds === undefined ? foyer.locations : foyer.locations.filter((l) => locationIds.includes(l.id));
  const sources: RedactionSource[] = [];
  for (const loc of wanted) {
    if (loc.status !== 'present') continue;
    if (loc.containerType !== 'page' && loc.containerType !== 'template') continue;
    const page = await ctx.confluence.getPage(loc.pageId).catch(() => null);
    if (page === null) continue;
    if (loc.charStart === undefined || loc.charEnd === undefined) continue;
    sources.push({
      locationId: loc.id,
      pageId: loc.pageId,
      containerType: loc.containerType,
      text: page.bodyStorage,
      occurrences: [{ start: loc.charStart, end: loc.charEnd }],
      maskedPreview: loc.maskedPreview,
    });
  }
  return sources;
}

/** Étape 2 — aperçu du caviardage (diff masqué, modèles d'abord, §9). */
export async function redactionPreview(
  ctx: ServiceContext,
  foyerId: string,
  locationIds?: readonly string[],
): Promise<{ diffs: RedactionDiff[]; templateFirst: string[] } | { ok: false; reason: string }> {
  const foyer = await ctx.store.getFoyer(foyerId);
  if (foyer === null) return { ok: false, reason: 'Foyer introuvable.' };
  const attestation = attestationFromFoyer(foyer, foyer.rotatedAt ?? '');
  if (attestation === undefined) {
    return { ok: false, reason: 'Aperçu refusé : aucune attestation de rotation humaine (PW-09).' };
  }
  const sources = await buildRedactionSources(ctx, foyer, locationIds);
  return redactionPreviewPure(attestation, sources);
}

/** Étape 2 — application du caviardage `asUser()` (verrou PW-09, §9). */
export async function applyRedactionService(
  ctx: ServiceContext,
  foyerId: string,
  approvedBy: string,
  comment: string,
): Promise<{ applied: number; versionComment: string; asUser: string } | { ok: false; reason: string }> {
  const foyer = await ctx.store.getFoyer(foyerId);
  if (foyer === null) return { ok: false, reason: 'Foyer introuvable.' };
  const attestation = attestationFromFoyer(foyer, approvedBy);
  const sources = await buildRedactionSources(ctx, foyer);
  const result = await applyRedaction(foyer, attestation, { approvedBy, comment, sources }, ctx.storage);
  if (!result.ok) return { ok: false, reason: result.reason };
  const at = ctx.clock.now();
  for (const text of result.texts) {
    await ctx.store.locations.markRedacted(text.locationId, at);
  }
  const updated: Foyer = { ...foyer, state: 'redacted' };
  await ctx.store.saveFoyer(updated);
  await persistSteps(ctx, updated, attestation);
  return { applied: result.applied, versionComment: result.versionComment, asUser: result.asUser };
}

/** Étape 3 — purge d'historique (demande à l'admin, foyer ouvert, §9). */
export async function requestPurge(
  ctx: ServiceContext,
  foyerId: string,
  pageId?: string,
  versionNumbers?: readonly number[],
): Promise<{ request: PurgeRequest; apiCanPurge: boolean }> {
  const foyer = (await ctx.store.getFoyer(foyerId)) as Foyer;
  const targets = versionNumbers === undefined || pageId === undefined
    ? foyer.locations
        .filter((l) => l.containerType === 'version' && l.versionNumber !== undefined)
        .map((l) => ({ pageId: l.pageId, versionNumbers: [l.versionNumber as number] }))
    : [{ pageId, versionNumbers: [...versionNumbers] }];
  // §22 : la purge d'une version précise depuis Forge est à valider semaine 1.
  // En l'état, l'app ne purge jamais elle-même : demande groupée à l'administrateur.
  const outcome = purgeHistory(foyer, targets, false, false, {
    requestedByRef: ctx.actor().accountId ?? 'app',
    clock: ctx.clock,
    ids: ctx.ids,
  });
  for (const request of outcome.requests) await ctx.store.purgeRequests.put(request);
  const updated: Foyer = { ...foyer, state: outcome.foyerState };
  await ctx.store.saveFoyer(updated);
  await persistSteps(ctx, updated);
  return { request: outcome.requests[0] as PurgeRequest, apiCanPurge: outcome.apiCanPurge };
}

/** Étape 1 — ticket Jira de réparation, assigné au propriétaire résolu (§9). */
export async function openTicket(
  ctx: ServiceContext,
  foyerId: string,
  projectKey: string,
): Promise<{ ticketKey: string; url: string }> {
  const foyer = (await ctx.store.getFoyer(foyerId)) as Foyer;
  const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const owner: OwnerResolution = primary === ''
    ? { pageId: '', method: 'adoption-queue', confidence: 'none', resolvedAt: ctx.clock.now() }
    : await resolveOwner(ctx, primary, foyer.spaceKey ?? '');
  const payload = jiraTicketPayload(foyer, owner, projectKey);
  const created = await ctx.jira.createIssue({
    projectKey: payload.projectKey,
    summary: payload.summary,
    description: payload.description,
    labels: payload.labels,
    issueType: payload.issueType,
    priority: payload.priority,
    ...(payload.assignee !== undefined ? { assignee: payload.assignee } : {}),
  });
  return { ticketKey: created.key, url: created.url };
}

/** Ruban — faux positif écarté, raison écrite obligatoire (§9, PW-16). */
export async function dismiss(
  ctx: ServiceContext,
  foyerId: string,
  reason: string,
  reviewAt: string,
  actorRef: string,
): Promise<{ ok: true; reviewAt: string } | { ok: false; reason: string }> {
  const result = attachRibbon({ foyerId, reason, actorRef, reviewAt }, ctx.clock);
  if (!result.ok) return { ok: false, reason: result.reason };
  const foyer = await ctx.store.getFoyer(foyerId);
  if (foyer === null) return { ok: false, reason: 'Foyer introuvable.' };
  const updated: Foyer = {
    ...foyer,
    state: 'dismissed',
    dismissedReason: result.patch.dismissedReason,
    dismissedReviewAt: result.patch.dismissedReviewAt,
  };
  await ctx.store.saveFoyer(updated);
  return { ok: true, reviewAt };
}

/** Étape 5 — certificat daté et chiffré d'un périmètre (§9, PW-17). */
export async function generateCertificate(ctx: ServiceContext, scope: string): Promise<Certificate> {
  const foyers = await ctx.store.listFoyers({ limit: 100000, spaceKey: scope === 'site' ? undefined : scope });
  const open = foyers.filter((f) => f.state === 'open' || f.state === 'rotation-attested').length;
  const rotated = foyers.filter((f) => f.rotatedAt !== undefined).length;
  const redacted = foyers.filter((f) => f.state === 'redacted' || f.state === 'purge-requested' || f.state === 'purged' || f.state === 'sealed').length;
  const purged = foyers.filter((f) => f.state === 'purged' || f.state === 'sealed').length;
  const cert = buildCertificate(
    scope,
    { open, rotated, redacted, purged, residualExposure: `${String(open)} foyer(s) encore exposé(s)` },
    [],
    ctx.hmacKey,
    ctx.clock,
  );
  await ctx.store.certificates.put(cert);
  return cert;
}