/**
 * Le schéma Forge SQL (cahier des charges §20) : onze tables, aucune valeur
 * de secret, aucun texte de page, aucune pièce jointe.
 *
 * DDL volontairement sobre (colonnes typées, pas de contraintes exotiques) :
 * les capacités exactes de Forge SQL font partie des points à valider la
 * première semaine (docs/VALIDATION-22.md). Les lignes sont relues et
 * validées côté applicatif (zod) plutôt que par la base.
 */

/** Les onze tables du §20. */
export const TABLE_NAMES = [
  'finding',
  'location',
  'exposure',
  'page_scan',
  'attachment_scan',
  'ritual_step',
  'purge_request',
  'owner_resolution',
  'certificate',
  'sweep_cursor',
  'budget',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

/** DDL par table — la source de vérité du schéma. */
export const TABLE_DDL: Record<TableName, string> = {
  finding: `CREATE TABLE IF NOT EXISTS finding (
  id TEXT,
  fingerprint_hmac TEXT,
  family TEXT,
  kind TEXT,
  base_score INTEGER,
  score INTEGER,
  score_terms_json TEXT,
  state TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  rotated_at TEXT,
  rotation_evidence_ref TEXT,
  dismissed_reason TEXT,
  dismissed_review_at TEXT
)`,
  location: `CREATE TABLE IF NOT EXISTS location (
  id TEXT,
  finding_id TEXT,
  container_type TEXT,
  container_ari TEXT,
  page_id TEXT,
  version_number INTEGER,
  char_start INTEGER,
  char_end INTEGER,
  masked_preview TEXT,
  detected_at TEXT,
  redacted_at TEXT
)`,
  exposure: `CREATE TABLE IF NOT EXISTS exposure (
  page_id TEXT,
  space_key TEXT,
  readers_low INTEGER,
  readers_high INTEGER,
  sharing_state TEXT,
  restrictions_json TEXT,
  ai_surface INTEGER,
  computed_at TEXT
)`,
  page_scan: `CREATE TABLE IF NOT EXISTS page_scan (
  page_id TEXT,
  content_hash TEXT,
  version_scanned INTEGER,
  scanned_at TEXT,
  detectors_version TEXT,
  llm_calls INTEGER,
  tokens INTEGER,
  skipped_reason TEXT
)`,
  attachment_scan: `CREATE TABLE IF NOT EXISTS attachment_scan (
  attachment_id TEXT,
  page_id TEXT,
  filename TEXT,
  mime TEXT,
  size INTEGER,
  read_state TEXT,
  skipped_reason TEXT,
  findings_count INTEGER
)`,
  ritual_step: `CREATE TABLE IF NOT EXISTS ritual_step (
  id TEXT,
  finding_id TEXT,
  step TEXT,
  state TEXT,
  actor_ref TEXT,
  attestation_ref TEXT,
  at TEXT
)`,
  purge_request: `CREATE TABLE IF NOT EXISTS purge_request (
  id TEXT,
  finding_id TEXT,
  page_id TEXT,
  version_numbers_json TEXT,
  requested_at TEXT,
  requested_by_ref TEXT,
  state TEXT,
  admin_ref TEXT
)`,
  owner_resolution: `CREATE TABLE IF NOT EXISTS owner_resolution (
  page_id TEXT,
  owner_ref TEXT,
  method TEXT,
  confidence TEXT,
  resolved_at TEXT
)`,
  certificate: `CREATE TABLE IF NOT EXISTS certificate (
  id TEXT,
  scope TEXT,
  issued_at TEXT,
  open INTEGER,
  rotated INTEGER,
  redacted INTEGER,
  purged INTEGER,
  residual_exposure TEXT,
  blind_spots_json TEXT,
  content_hash TEXT
)`,
  sweep_cursor: `CREATE TABLE IF NOT EXISTS sweep_cursor (
  scope TEXT,
  mode TEXT,
  last_page_id TEXT,
  last_modified_at TEXT,
  run_at TEXT
)`,
  budget: `CREATE TABLE IF NOT EXISTS budget (
  day TEXT,
  pages_scanned INTEGER,
  attachments_read INTEGER,
  attachments_skipped INTEGER,
  llm_calls INTEGER,
  tokens INTEGER,
  cost_estimate REAL
)`,
};

/** Ligne `finding` telle que stockée (§20). */
export interface FindingRow {
  id: string;
  fingerprint_hmac: string;
  family: string;
  kind: string;
  base_score: number;
  score: number;
  /** JSON : AppliedScoreTerm[] — chaque terme appliqué est conservé. */
  score_terms_json: string;
  state: string;
  first_seen_at: string;
  last_seen_at: string;
  rotated_at?: string | null;
  rotation_evidence_ref?: string | null;
  dismissed_reason?: string | null;
  dismissed_review_at?: string | null;
}

/** Ligne `location` telle que stockée (§20). */
export interface LocationRow {
  id: string;
  finding_id: string;
  container_type: string;
  container_ari: string;
  page_id: string;
  version_number?: number | null;
  char_start?: number | null;
  char_end?: number | null;
  masked_preview: string;
  detected_at: string;
  redacted_at?: string | null;
}

/** Ligne `exposure` telle que stockée (§20). */
export interface ExposureRow {
  page_id: string;
  space_key: string;
  readers_low: number;
  readers_high: number;
  sharing_state: string;
  restrictions_json: string;
  /** 1 = page présumée indexée par Rovo (hypothèse conservatrice, §13). */
  ai_surface: number;
  computed_at: string;
}

/** Ligne `page_scan` telle que stockée (§20). */
export interface PageScanRow {
  page_id: string;
  content_hash: string;
  version_scanned: number;
  scanned_at: string;
  detectors_version: string;
  llm_calls: number;
  tokens: number;
  skipped_reason?: string | null;
}

/** Ligne `attachment_scan` telle que stockée (§20). */
export interface AttachmentScanRow {
  attachment_id: string;
  page_id: string;
  filename: string;
  mime: string;
  size: number;
  read_state: string;
  skipped_reason?: string | null;
  findings_count: number;
}

/** Ligne `ritual_step` telle que stockée (§20). */
export interface RitualStepRow {
  id: string;
  finding_id: string;
  step: string;
  state: string;
  actor_ref?: string | null;
  attestation_ref?: string | null;
  at?: string | null;
}

/** Ligne `purge_request` telle que stockée (§20). */
export interface PurgeRequestRow {
  id: string;
  finding_id: string;
  page_id: string;
  version_numbers_json: string;
  requested_at: string;
  requested_by_ref: string;
  state: string;
  admin_ref?: string | null;
}

/** Ligne `owner_resolution` telle que stockée (§20). */
export interface OwnerResolutionRow {
  page_id: string;
  owner_ref?: string | null;
  method: string;
  confidence: string;
  resolved_at: string;
}

/** Ligne `certificate` telle que stockée (§20). */
export interface CertificateRow {
  id: string;
  scope: string;
  issued_at: string;
  open: number;
  rotated: number;
  redacted: number;
  purged: number;
  residual_exposure: string;
  blind_spots_json: string;
  content_hash: string;
}

/** Ligne `sweep_cursor` telle que stockée (§20). */
export interface SweepCursorRow {
  scope: string;
  mode: string;
  last_page_id?: string | null;
  last_modified_at?: string | null;
  run_at?: string | null;
}

/** Ligne `budget` telle que stockée (§20). */
export interface BudgetRow {
  day: string;
  pages_scanned: number;
  attachments_read: number;
  attachments_skipped: number;
  llm_calls: number;
  tokens: number;
  cost_estimate: number;
}
