/**
 * Sérialisation foyer → lignes SQL (§20) et rehydratation.
 *
 * Chaque ligne est validée à la main (JSON explicite) plutôt que par la base :
 * les capacités exactes de Forge SQL restent à valider la semaine 1 (§20).
 * Aucune valeur brute ne transite : `score_terms_json`, `restrictions_json` et
 * `blind_spots_json` ne contiennent que libellés, méthodes et compteurs.
 */

import type {
  AppliedScoreTerm,
  AttachmentScanRecord,
  Certificate,
  Foyer,
  FoyerLocation,
  PageExposure,
  PageScanRecord,
  PurgeRequest,
  RitualStepState,
  ScanBudget,
  SweepCursor,
} from '@placard-wiki/domain';
import type { OwnerResolution } from '@placard-wiki/domain';
import type {
  AttachmentScanRow,
  BudgetRow,
  CertificateRow,
  ExposureRow,
  FindingRow,
  LocationRow,
  OwnerResolutionRow,
  PageScanRow,
  PurgeRequestRow,
  RitualStepRow,
  SweepCursorRow,
} from '@placard-wiki/domain';

/** JSON robuste : parse tolérant (jamais de crash sur une ligne corrompue). */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

/** Foyer → ligne `finding` (les emplacements, l'espace et la page principale restent ailleurs). */
export function foyerToRow(foyer: Foyer): FindingRow {
  return {
    id: foyer.id,
    fingerprint_hmac: foyer.fingerprint,
    family: foyer.family,
    kind: 'foyer',
    base_score: foyer.baseScore,
    score: foyer.score,
    score_terms_json: json(foyer.scoreTerms),
    state: foyer.state,
    first_seen_at: foyer.firstSeenAt,
    last_seen_at: foyer.lastSeenAt,
    rotated_at: foyer.rotatedAt ?? null,
    rotation_evidence_ref: foyer.rotationEvidenceRef ?? null,
    dismissed_reason: foyer.dismissedReason ?? null,
    dismissed_review_at: foyer.dismissedReviewAt ?? null,
  };
}

/** Ligne `finding` → foyer partiel (les emplacements sont rechargés à part). */
export function foyerFromRow(row: FindingRow, locations: readonly FoyerLocation[] = []): Foyer {
  const scoreTerms = parseJson<AppliedScoreTerm[]>(row.score_terms_json, []);
  const locs = [...locations];
  return {
    id: row.id,
    fingerprint: row.fingerprint_hmac,
    family: row.family as Foyer['family'],
    baseScore: row.base_score,
    score: row.score,
    scoreTerms,
    state: row.state as Foyer['state'],
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    rotatedAt: row.rotated_at ?? undefined,
    rotationEvidenceRef: row.rotation_evidence_ref ?? undefined,
    dismissedReason: row.dismissed_reason ?? undefined,
    dismissedReviewAt: row.dismissed_review_at ?? undefined,
    locations: locs,
    primaryPageId: locs.find((l) => l.status === 'present')?.pageId ?? locs[0]?.pageId,
  };
}

/** Emplacement → ligne `location` (l'emplacement porte l'aperçu masqué, jamais la valeur). */
export function locationToRow(location: FoyerLocation): LocationRow {
  return {
    id: location.id,
    finding_id: location.foyerId,
    container_type: location.containerType,
    container_ari: location.containerAri,
    page_id: location.pageId,
    version_number: location.versionNumber ?? null,
    char_start: location.charStart ?? null,
    char_end: location.charEnd ?? null,
    masked_preview: location.maskedPreview,
    detected_at: location.detectedAt,
    redacted_at: location.redactedAt ?? null,
  };
}

/**
 * Ligne `location` → emplacement.
 *
 * Limites honnêtes : la table `location` du §20 ne porte ni colonne `field` ni
 * colonne `status`. On reconstruit donc `field: 'body'` (le champ du corps est
 * le cas dominant) et le statut `present`/`redacted` depuis `redacted_at`.
 * Le statut `vanished` (page supprimée, §24) est géré par le rituel en mémoire
 * et n'est pas persisté ici — limite assumée, documentée dans le PR.
 */
export function locationFromRow(row: LocationRow): FoyerLocation {
  const isPresent = row.redacted_at === null || row.redacted_at === undefined;
  return {
    id: row.id,
    foyerId: row.finding_id,
    containerType: row.container_type as FoyerLocation['containerType'],
    containerAri: row.container_ari,
    pageId: row.page_id,
    versionNumber: row.version_number ?? undefined,
    charStart: row.char_start ?? undefined,
    charEnd: row.char_end ?? undefined,
    maskedPreview: row.masked_preview,
    detectedAt: row.detected_at,
    redactedAt: row.redacted_at ?? undefined,
    status: isPresent ? 'present' : 'redacted',
    field: 'body',
    gite: giteImpl(row.container_type),
  };
}

/** Règle du gîte (§6) — miroir minimal du domaine (la table ne stocke pas le gîte). */
function giteImpl(containerType: string): string {
  if (containerType === 'version') return 'historique-de-versions';
  if (containerType === 'comment') return 'commentaires';
  if (containerType === 'attachment') return 'pieces-jointes';
  if (containerType === 'template') return 'modeles-de-page';
  if (containerType === 'space-desc') return 'description-espace';
  return 'corps-de-page';
}

/** Exposition → ligne `exposure` (la surface IA est un entier 0/1). */
export function exposureToRow(exposure: PageExposure): ExposureRow {
  return {
    page_id: exposure.pageId,
    space_key: exposure.spaceKey,
    readers_low: exposure.readers.low,
    readers_high: exposure.readers.high,
    sharing_state: exposure.sharing,
    restrictions_json: json(exposure.restrictions),
    ai_surface: exposure.aiSurface.presumedIndexed ? 1 : 0,
    computed_at: exposure.computedAt,
  };
}

/** Ligne `exposure` → exposition. */
export function exposureFromRow(row: ExposureRow): PageExposure {
  return {
    pageId: row.page_id,
    spaceKey: row.space_key,
    readers: { low: row.readers_low, high: row.readers_high, method: '', caveats: [] },
    sharing: row.sharing_state as PageExposure['sharing'],
    restrictions: parseJson<PageExposure['restrictions']>(row.restrictions_json, []),
    aiSurface: { presumedIndexed: row.ai_surface === 1, hypothesis: true, method: '' },
    computedAt: row.computed_at,
  };
}

/** Scan de page → ligne `page_scan`. */
export function pageScanToRow(record: PageScanRecord): PageScanRow {
  return {
    page_id: record.pageId,
    content_hash: record.contentHash,
    version_scanned: record.versionScanned,
    scanned_at: record.scannedAt,
    detectors_version: record.detectorsVersion,
    llm_calls: record.llmCalls,
    tokens: record.tokens,
    skipped_reason: record.skippedReason ?? null,
  };
}

/** Ligne `page_scan` → enregistrement. */
export function pageScanFromRow(row: PageScanRow): PageScanRecord {
  return {
    pageId: row.page_id,
    contentHash: row.content_hash,
    versionScanned: row.version_scanned,
    scannedAt: row.scanned_at,
    detectorsVersion: row.detectors_version,
    llmCalls: row.llm_calls,
    tokens: row.tokens,
    skippedReason: row.skipped_reason ?? undefined,
  };
}

/** Scan de pièce jointe → ligne `attachment_scan`. */
export function attachmentScanToRow(record: AttachmentScanRecord): AttachmentScanRow {
  return {
    attachment_id: record.attachmentId,
    page_id: record.pageId,
    filename: record.filename,
    mime: record.mime,
    size: record.size,
    read_state: record.readState,
    skipped_reason: record.skippedReason ?? null,
    findings_count: record.findingsCount,
  };
}

/** Ligne `attachment_scan` → enregistrement. */
export function attachmentScanFromRow(row: AttachmentScanRow): AttachmentScanRecord {
  return {
    attachmentId: row.attachment_id,
    pageId: row.page_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    readState: row.read_state as AttachmentScanRecord['readState'],
    skippedReason: row.skipped_reason ?? undefined,
    findingsCount: row.findings_count,
  };
}

/** État du rituel → ligne `ritual_step`. */
export function ritualStepToRow(step: RitualStepState): RitualStepRow {
  return {
    id: `${step.foyerId}:${step.step}`,
    finding_id: step.foyerId,
    step: step.step,
    state: step.state,
    actor_ref: step.actorRef ?? null,
    attestation_ref: step.attestationRef ?? null,
    at: step.at ?? null,
  };
}

/** Ligne `ritual_step` → état. */
export function ritualStepFromRow(row: RitualStepRow): RitualStepState {
  const out: RitualStepState = {
    foyerId: row.finding_id,
    step: row.step,
    state: row.state as RitualStepState['state'],
    actorRef: row.actor_ref ?? undefined,
    attestationRef: row.attestation_ref ?? undefined,
    at: row.at ?? undefined,
  };
  return out;
}

/** Demande de purge → ligne `purge_request`. */
export function purgeRequestToRow(request: PurgeRequest): PurgeRequestRow {
  return {
    id: request.id,
    finding_id: request.foyerId,
    page_id: request.pageId,
    version_numbers_json: json(request.versionNumbers),
    requested_at: request.requestedAt,
    requested_by_ref: request.requestedByRef,
    state: request.state,
    admin_ref: request.adminRef ?? null,
  };
}

/** Ligne `purge_request` → demande. */
export function purgeRequestFromRow(row: PurgeRequestRow): PurgeRequest {
  const out: PurgeRequest = {
    id: row.id,
    foyerId: row.finding_id,
    pageId: row.page_id,
    versionNumbers: parseJson<number[]>(row.version_numbers_json, []),
    requestedAt: row.requested_at,
    requestedByRef: row.requested_by_ref,
    state: row.state as PurgeRequest['state'],
    adminRef: row.admin_ref ?? undefined,
  };
  return out;
}

/** Résolution de propriétaire → ligne `owner_resolution`. */
export function ownerToRow(resolution: OwnerResolution): OwnerResolutionRow {
  return {
    page_id: resolution.pageId,
    owner_ref: resolution.ownerRef ?? null,
    method: resolution.method,
    confidence: resolution.confidence,
    resolved_at: resolution.resolvedAt,
  };
}

/** Ligne `owner_resolution` → résolution. */
export function ownerFromRow(row: OwnerResolutionRow): OwnerResolution {
  return {
    pageId: row.page_id,
    ownerRef: row.owner_ref ?? undefined,
    method: row.method as OwnerResolution['method'],
    confidence: row.confidence as OwnerResolution['confidence'],
    resolvedAt: row.resolved_at,
  };
}

/** Certificat → ligne `certificate`. */
export function certificateToRow(cert: Certificate): CertificateRow {
  return {
    id: cert.id,
    scope: cert.scope,
    issued_at: cert.issuedAt,
    open: cert.open,
    rotated: cert.rotated,
    redacted: cert.redacted,
    purged: cert.purged,
    residual_exposure: cert.residualExposure,
    blind_spots_json: json(cert.blindSpots),
    content_hash: cert.contentHash,
  };
}

/** Ligne `certificate` → certificat. */
export function certificateFromRow(row: CertificateRow): Certificate {
  return {
    id: row.id,
    scope: row.scope,
    issuedAt: row.issued_at,
    open: row.open,
    rotated: row.rotated,
    redacted: row.redacted,
    purged: row.purged,
    residualExposure: row.residual_exposure,
    blindSpots: parseJson<string[]>(row.blind_spots_json, []),
    contentHash: row.content_hash,
  };
}

/** Curseur → ligne `sweep_cursor`. */
export function cursorToRow(cursor: SweepCursor): SweepCursorRow {
  return {
    scope: cursor.scope,
    mode: cursor.mode,
    last_page_id: cursor.lastPageId ?? null,
    last_modified_at: cursor.lastModifiedAt ?? null,
    run_at: cursor.runAt ?? null,
  };
}

/** Ligne `sweep_cursor` → curseur. */
export function cursorFromRow(row: SweepCursorRow): SweepCursor {
  return {
    scope: row.scope,
    mode: row.mode as SweepCursor['mode'],
    lastPageId: row.last_page_id ?? undefined,
    lastModifiedAt: row.last_modified_at ?? undefined,
    runAt: row.run_at ?? undefined,
  };
}

/** Budget → ligne `budget`. */
export function budgetToRow(budget: ScanBudget): BudgetRow {
  return {
    day: budget.day,
    pages_scanned: budget.pagesScanned,
    attachments_read: budget.attachmentsRead,
    attachments_skipped: budget.attachmentsSkipped,
    llm_calls: budget.llmCalls,
    tokens: budget.tokens,
    cost_estimate: budget.costEstimate,
  };
}

/** Ligne `budget` → budget (les champs non stockés sont recalculés par le service). */
export function budgetFromRow(row: BudgetRow): ScanBudget {
  return {
    day: row.day,
    pagesScanned: row.pages_scanned,
    attachmentsRead: row.attachments_read,
    attachmentsSkipped: row.attachments_skipped,
    llmCalls: row.llm_calls,
    tokens: row.tokens,
    costEstimate: row.cost_estimate,
    skipped: [],
  };
}