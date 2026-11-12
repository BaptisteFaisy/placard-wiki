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
  executePurge,
  verifyPurge,
  decidePurgeRequest,
  sealFoyer,
  NO_PURGE_CLIENT_REASON,
} from '@placard-wiki/ritual';
import type { RedactionSource, PurgeDecision, PurgeTarget, PurgeHistoryParams } from '@placard-wiki/ritual';
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

/** La demande de purge, et ce que l'app a pu en faire. */
export interface PurgeServiceResult {
  request: PurgeRequest;
  /**
   * L'app peut-elle purger via l'API : `true` seulement si l'identité de l'app
   * accède à l'historique (probe sans 401/403). Sinon `false`, même si la
   * plateforme le permet pour un administrateur (204 mesuré, porté par `reason`).
   */
  apiCanPurge: boolean;
  /** L'app a-t-elle exécuté la purge elle-même ? */
  executed: boolean;
  /** La purge est-elle **vérifiée** (la version n'est plus lisible) ? */
  verified: boolean;
  /** La raison exacte quand le foyer reste ouvert — jamais vide. */
  reason: string;
}

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

/** Les cibles de purge : les emplacements « version » du foyer, ou une liste donnée. */
function purgeTargets(foyer: Foyer, pageId?: string, versionNumbers?: readonly number[]): PurgeTarget[] {
  if (versionNumbers !== undefined && pageId !== undefined) {
    return [{ pageId, versionNumbers: [...versionNumbers] }];
  }
  return foyer.locations
    .filter((l) => l.containerType === 'version' && l.versionNumber !== undefined)
    .map((l) => ({ pageId: l.pageId, versionNumbers: [l.versionNumber as number] }));
}

/** Le port de purge de l'app : absent = l'app ne peut ni purger ni vérifier. */
function purgePortsOf(ctx: ServiceContext): NonNullable<ServiceContext['purge']> {
  return ctx.purge ?? {};
}

/** La branche « l'app n'a pas les droits » : demande groupée, foyer ouvert. */
async function requestPurgeBlocked(
  ctx: ServiceContext,
  foyer: Foyer,
  targets: PurgeTarget[],
  probe: { canPurge: boolean; reason: string },
  params: PurgeHistoryParams,
): Promise<PurgeServiceResult> {
  const outcome = purgeHistory(foyer, targets, probe.canPurge, false, params);
  for (const request of outcome.requests) await ctx.store.purgeRequests.put(request);
  const updated: Foyer = { ...foyer, state: outcome.foyerState };
  await ctx.store.saveFoyer(updated);
  await persistSteps(ctx, updated);
  return {
    request: outcome.requests[0] as PurgeRequest,
    apiCanPurge: probe.canPurge,
    executed: false,
    verified: false,
    reason: probe.reason,
  };
}

/** La branche « l'app a les droits » : purge, puis vérification. */
async function requestPurgeExecute(
  ctx: ServiceContext,
  foyer: Foyer,
  pageId: string,
  versionNumbers: readonly number[],
  ports: NonNullable<ServiceContext['purge']>,
  params: PurgeHistoryParams,
): Promise<PurgeServiceResult> {
  const execution = await executePurge(pageId, versionNumbers, ports.client!);
  const verification = ports.reader === undefined
    ? null
    : await verifyPurge(pageId, versionNumbers, ports.reader, {
      ...(ports.fingerprint === undefined ? {} : { fingerprint: ports.fingerprint }),
      staysOpenState: 'purge-requested',
    });
  const verified = verification?.verified === true;
  const reason = !execution.complete
    ? `La purge n’a pas abouti : ${execution.failures.map((f) => `version ${String(f.versionNumber)} — HTTP ${String(f.status)} (${f.reason})`).join(' ; ')}`
    : verification === null
      ? 'La purge a été exécutée mais l’app ne peut pas la vérifier (identité de l’app : 401 sur l’historique).'
      : verification.reason;
  const updated: Foyer = { ...foyer, state: verified ? 'purged' : 'purge-requested' };
  await ctx.store.saveFoyer(updated);
  await persistSteps(ctx, updated);
  const outcome = purgeHistory(foyer, purgeTargets(foyer, pageId, versionNumbers), true, true, params);
  for (const request of outcome.requests) {
    await ctx.store.purgeRequests.put(verified ? { ...request, state: 'done' } : request);
  }
  return {
    request: outcome.requests[0] as PurgeRequest,
    apiCanPurge: true,
    executed: true,
    verified,
    reason,
  };
}

/**
 * Étape 3 — purge d'historique (§9).
 *
 * Ce que l'API permet vraiment (mesuré le 12 novembre 2026) : la suppression
 * d'une version précise **est possible** (`DELETE …/version/{n}` → 204) — mais
 * l'identité de l'app Forge reçoit 401 sur l'historique (sonde en direct). Donc :
 *
 * - l'app a les droits → elle purge, puis elle **vérifie** : « purgé » seulement
 *   si la version n'est plus lisible ; sinon le foyer reste ouvert, raison à l'appui ;
 * - l'app n'a pas les droits → la demande groupée à l'administrateur, avec la
 *   raison **mesurée** (« HTTP 401… »), et le foyer reste ouvert.
 */
export async function requestPurge(
  ctx: ServiceContext,
  foyerId: string,
  pageId?: string,
  versionNumbers?: readonly number[],
): Promise<PurgeServiceResult> {
  const foyer = (await ctx.store.getFoyer(foyerId)) as Foyer;
  const targets = purgeTargets(foyer, pageId, versionNumbers);
  const ports = purgePortsOf(ctx);
  const probe = ports.client === undefined
    ? { canPurge: false as const, reason: NO_PURGE_CLIENT_REASON }
    : await ports.client.probe();
  const params = {
    requestedByRef: ctx.actor().accountId ?? 'app',
    clock: ctx.clock,
    ids: ctx.ids,
    // La raison mesurée remplace le libellé générique : l'export CSV la porte.
    blockedReason: probe.reason,
  };
  if (!probe.canPurge) {
    return requestPurgeBlocked(ctx, foyer, targets, probe, params);
  }
  return requestPurgeExecute(ctx, foyer, targets[0]?.pageId ?? '', versionNumbers ?? [], ports, params);
}

/** La décision de l'administrateur sur une demande, et son effet sur le foyer. */
export interface PurgeDecisionInput {
  ids: string[];
  decision: PurgeDecision;
  adminRef?: string;
  motive?: string;
}

/** Le résultat d'une décision : ce qui a changé, et ce qui reste ouvert. */
export interface PurgeDecisionOutcome {
  applied: number;
  refused: number;
  /** Les demandes refusées par la décision (raison écrite). */
  errors: string[];
  /** Les foyers passés à « purgé » — la purge a été **vérifiée**. */
  verified: number;
  /** Les foyers restés ouverts, avec la raison exacte. */
  stillOpen: string[];
}

/**
 * Applique la décision de l'administrateur (§9) : reconnaissance, refus motivé,
 * ou purge déclarée faite — auquel cas l'app **vérifie** avant de dire « purgé ».
 */
export async function applyPurgeDecision(
  ctx: ServiceContext,
  input: PurgeDecisionInput,
): Promise<PurgeDecisionOutcome> {
  const out: PurgeDecisionOutcome = { applied: 0, refused: 0, errors: [], verified: 0, stillOpen: [] };
  for (const id of input.ids) {
    const request = await ctx.store.purgeRequests.get(id);
    if (request === null) {
      out.errors.push(`Demande inconnue : ${id}`);
      continue;
    }
    const decision = decidePurgeRequest(request, input.decision, {
      ...(input.adminRef === undefined ? {} : { adminRef: input.adminRef }),
      ...(input.motive === undefined ? {} : { motive: input.motive }),
    });
    if (!decision.ok || decision.request === undefined) {
      out.errors.push(`${id} : ${decision.reason ?? 'décision refusée'}`);
      continue;
    }
    const next = decision.request;
    await ctx.store.purgeRequests.put(next);
    out.applied += 1;
    if (input.decision === 'refused') {
      out.refused += 1;
      continue;
    }
    if (input.decision !== 'done') continue;
    const check = await verifyRequest(ctx, next);
    if (check.verified) {
      out.verified += 1;
    } else {
      out.stillOpen.push(check.reason);
    }
  }
  return out;
}

/** Vérifie une demande déclarée faite : « purgé » seulement si la version a disparu. */
async function verifyRequest(ctx: ServiceContext, request: PurgeRequest): Promise<{ verified: boolean; reason: string }> {
  const ports = purgePortsOf(ctx);
  const foyer = await ctx.store.getFoyer(request.foyerId);
  if (foyer === null) return { verified: false, reason: 'Foyer introuvable : la purge reste non vérifiée.' };
  if (ports.reader === undefined) {
    const reason =
      'La purge est déclarée faite, mais l’app ne peut pas la vérifier ' +
      '(l’identité de l’app reçoit 401 sur l’historique) : le foyer reste ouvert.';
    await ctx.store.saveFoyer({ ...foyer, state: 'purge-requested' });
    return { verified: false, reason };
  }
  const verification = await verifyPurge(request.pageId, request.versionNumbers, ports.reader, {
    ...(ports.fingerprint === undefined ? {} : { fingerprint: ports.fingerprint }),
    staysOpenState: 'purge-requested',
  });
  if (!verification.verified) {
    await ctx.store.saveFoyer({ ...foyer, state: 'purge-requested' });
    return { verified: false, reason: verification.reason };
  }
  await ctx.store.saveFoyer({ ...foyer, state: 'purged' });
  await persistSteps(ctx, { ...foyer, state: 'purged' });
  return { verified: true, reason: 'La version visée n’est plus lisible : la purge est vérifiée.' };
}

/**
 * Le sceau de cire (§9) : rotation attestée + caviardage + purge vérifiée
 * **ou** purge impossible documentée. Les deux bases sont distinctes et le
 * registre les garde distinctes.
 */
export async function sealFoyerService(
  ctx: ServiceContext,
  foyerId: string,
  purge: { verified?: boolean; impossibleReason?: string } = {},
): Promise<{ ok: true; basis: string; note: string } | { ok: false; reason: string }> {
  const foyer = await ctx.store.getFoyer(foyerId);
  if (foyer === null) return { ok: false, reason: 'Foyer introuvable.' };
  const attestation = attestationFromFoyer(foyer, foyer.rotatedAt ?? '');
  const outcome = sealFoyer({
    foyer,
    ...(attestation === undefined ? {} : { attestation }),
    ...(purge.verified === undefined ? {} : { purgeVerified: purge.verified }),
    ...(purge.impossibleReason === undefined ? {} : { purgeImpossibleReason: purge.impossibleReason }),
  });
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  const updated: Foyer = { ...foyer, state: 'sealed' };
  await ctx.store.saveFoyer(updated);
  const steps = ritualStepStates(updated, attestation);
  for (const step of steps) {
    await ctx.store.ritualSteps.put(
      step.step === 'purge' ? { ...step, attestationRef: outcome.basis } : step,
    );
  }
  return { ok: true, basis: outcome.basis, note: outcome.note };
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