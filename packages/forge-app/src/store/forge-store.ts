/**
 * Store Forge SQL — implémentation de `ForgeStore` sur `@forge/sql` (§20).
 *
 * C'est le SEUL fichier du dépôt qui importe `@forge/sql`. Le schéma est créé
 * par `migrationRunner` à partir du DDL du domaine (`TABLE_DDL`) ; les lignes
 * sont lues/écrites par requêtes paramétrées, jamais interpolées.
 *
 * Limites honnêtes (à valider semaine 1, §22) :
 *  - la table `location` ne porte ni colonne `field` ni `status` (§20) : on
 *    reconstruit `field: 'body'` et le statut depuis `redacted_at` (voir
 *    `serialize.ts`) ; le statut `vanished` (§24) n'est pas persisté ;
 *  - `finding` n'a pas de colonne `space_key` : l'espace est dérivé de
 *    l'exposition de la page principale à la lecture (`rehydrate`).
 *
 * Les tests n'utilisent JAMAIS ce fichier (store en mémoire à la place).
 */

import sql, { migrationRunner } from '@forge/sql';
import type { Result, UpdateQueryResponse } from '@forge/sql';
import { TABLE_DDL, TABLE_NAMES } from '@placard-wiki/domain';
import type {
  AttachmentScanRow, BudgetRow, CertificateRow, ExposureRow, FindingRow,
  LocationRow, OwnerResolutionRow, PageScanRow, PurgeRequestRow, RitualStepRow,
  SweepCursorRow,
} from '@placard-wiki/domain';
import type {
  AttachmentScanRecord, Certificate, Foyer, FoyerLocation, OwnerResolution,
  PageExposure, PageScanRecord, PurgeRequest, RitualStepState, ScanBudget,
  SweepCursor,
} from '@placard-wiki/domain';
import type { SpaceSettings } from '@placard-wiki/domain';

import type { ForgeStore, GiteCoverageLine, ListFoyersQuery } from './ports';
import {
  attachmentScanFromRow, attachmentScanToRow, budgetFromRow, budgetToRow,
  certificateFromRow, certificateToRow, cursorFromRow, cursorToRow,
  exposureFromRow, exposureToRow, foyerFromRow, foyerToRow, locationFromRow,
  locationToRow, ownerFromRow, ownerToRow, pageScanFromRow, pageScanToRow,
  purgeRequestFromRow, purgeRequestToRow, ritualStepFromRow, ritualStepToRow,
} from './serialize';
import { defaultSpaceSettings, rehydrate } from './memory-store';

/** Cache page → espace (la table `finding` n'a pas de colonne `space_key`). */
const spaceCache = new Map<string, string>();

/**
 * DDL de la table technique de l'app : elle ne porte aucune donnée métier du
 * §20 (aucun secret, aucune empreinte) — uniquement le secret applicatif
 * persisté une fois (la clé HMAC, voir `runtime/secret.ts`). Elle reste dans
 * ce fichier, seul endroit du dépôt qui importe `@forge/sql`.
 */
const APP_SECRET_DDL = `CREATE TABLE IF NOT EXISTS app_secret (
  name TEXT,
  value TEXT,
  created_at TEXT
)`;

/**
 * DDL de la table technique de couverture par gîte (§6).
 *
 * Elle ne porte aucune donnée métier : un gîte, deux compteurs et une raison
 * de non-lecture. Elle est technique comme `app_secret` — le schéma métier du
 * §20 reste celui du domaine (`TABLE_DDL`), cette table n'y touche pas.
 */
const GITE_COVERAGE_DDL = `CREATE TABLE IF NOT EXISTS gite_coverage (
  day TEXT,
  gite TEXT,
  scanned INTEGER,
  skipped INTEGER,
  reason TEXT
)`;

/** Promesse de migration du conteneur : créée une fois, réessayée si elle échoue. */
let schemaReady: Promise<void> | null = null;

/** Crée le schéma (§20 : onze tables + la table technique). Idempotent. */
export async function initSchema(): Promise<void> {
  const runner = migrationRunner;
  for (const name of TABLE_NAMES) {
    runner.enqueue(`v001_${name}`, TABLE_DDL[name]);
  }
  runner.enqueue('v001_app_secret', APP_SECRET_DDL);
  runner.enqueue('v001_gite_coverage', GITE_COVERAGE_DDL);
  await runner.run();
}

/**
 * Garantit le schéma AVANT toute requête. Le `migrationRunner` journalise ses
 * passages dans `__migrations` et le DDL est en `CREATE TABLE IF NOT EXISTS` :
 * l'appel est donc idempotent, y compris entre conteneurs. Chaque lecture et
 * chaque écriture attend cette promesse — c'est elle qui manquait et faisait
 * échouer le balayage planifié (« Table 'sweep_cursor' doesn't exist »).
 */
function ensureSchema(): Promise<void> {
  if (schemaReady === null) {
    schemaReady = initSchema().then(
      () => {
        console.info('[placard] schéma SQL prêt (onze tables du §20 + app_secret).');
      },
      (error: unknown) => {
        schemaReady = null; // la passe suivante retente la migration
        throw error;
      },
    );
  }
  return schemaReady;
}

/** Exécute une requête de lecture paramétrée. */
async function select<T>(query: string, params: unknown[]): Promise<T[]> {
  await ensureSchema();
  const res = (await sql.prepare(query).bindParams(...(params as never[])).execute()) as Result<T>;
  return res.rows as T[];
}

/** Exécute une mutation paramétrée (INSERT/UPDATE/DELETE). */
async function mutate(query: string, params: unknown[]): Promise<void> {
  await ensureSchema();
  await (sql.prepare(query).bindParams(...(params as never[])).execute() as Promise<Result<UpdateQueryResponse>>);
}

function spaceOfFn(pageId: string): string | undefined {
  return spaceCache.get(pageId);
}

async function loadFoyer(row: FindingRow): Promise<Foyer> {
  const locs = (await select<LocationRow>('SELECT * FROM location WHERE finding_id = ?', [row.id]))
    .map(locationFromRow);
  return rehydrate(foyerFromRow(row, locs), spaceOfFn);
}

async function insertLocation(loc: FoyerLocation): Promise<void> {
  const row = locationToRow(loc);
  await mutate(
    'INSERT INTO location (id, finding_id, container_type, container_ari, page_id, version_number, char_start, char_end, masked_preview, detected_at, redacted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [row.id, row.finding_id, row.container_type, row.container_ari, row.page_id,
      row.version_number, row.char_start, row.char_end, row.masked_preview,
      row.detected_at, row.redacted_at],
  );
}

function matches(foyer: Foyer, q: ListFoyersQuery): boolean {
  if (q.fingerprint !== undefined && foyer.fingerprint !== q.fingerprint) return false;
  if (q.family !== undefined && foyer.family !== q.family) return false;
  if (q.state !== undefined && foyer.state !== q.state) return false;
  if (q.minScore !== undefined && foyer.score < q.minScore) return false;
  if (q.spaceKey !== undefined && foyer.spaceKey !== q.spaceKey) return false;
  return true;
}

function forgeFindings(): ForgeStore['findings'] {
  return {
    async get(id: string) {
      const rows = await select<FindingRow>('SELECT * FROM finding WHERE id = ? LIMIT 1', [id]);
      return rows[0] === undefined ? null : loadFoyer(rows[0]!);
    },
    async byFingerprint(fp: string) {
      const rows = await select<FindingRow>('SELECT * FROM finding WHERE fingerprint_hmac = ? LIMIT 1', [fp]);
      return rows[0] === undefined ? null : loadFoyer(rows[0]!);
    },
    async list(q: ListFoyersQuery) {
      const rows = await select<FindingRow>('SELECT * FROM finding', []);
      const foyers = await Promise.all(rows.map(loadFoyer));
      return foyers.filter((f) => matches(f, q)).slice(0, q.limit);
    },
    async upsert(foyer: Foyer) {
      const row = foyerToRow(foyer);
      await mutate('DELETE FROM finding WHERE id = ?', [row.id]);
      await mutate(
        'INSERT INTO finding (id, fingerprint_hmac, family, kind, base_score, score, score_terms_json, state, first_seen_at, last_seen_at, rotated_at, rotation_evidence_ref, dismissed_reason, dismissed_review_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [row.id, row.fingerprint_hmac, row.family, row.kind, row.base_score, row.score,
          row.score_terms_json, row.state, row.first_seen_at, row.last_seen_at,
          row.rotated_at, row.rotation_evidence_ref, row.dismissed_reason, row.dismissed_review_at],
      );
      await mutate('DELETE FROM location WHERE finding_id = ?', [row.id]);
      for (const loc of foyer.locations) await insertLocation(loc);
    },
  };
}

function forgeLocations(): ForgeStore['locations'] {
  return {
    async byFinding(findingId: string) {
      const rows = await select<LocationRow>('SELECT * FROM location WHERE finding_id = ?', [findingId]);
      return rows.map(locationFromRow);
    },
    async replaceForFinding(findingId: string, list: readonly FoyerLocation[]) {
      await mutate('DELETE FROM location WHERE finding_id = ?', [findingId]);
      for (const loc of list) await insertLocation(loc);
    },
    async markRedacted(locationId: string, redactedAt: string) {
      await mutate('UPDATE location SET redacted_at = ? WHERE id = ?', [redactedAt, locationId]);
    },
  };
}

function forgeExposures(): ForgeStore['exposures'] {
  return {
    async get(pageId: string) {
      const rows = await select<ExposureRow>('SELECT * FROM exposure WHERE page_id = ? LIMIT 1', [pageId]);
      const row = rows[0];
      if (row !== undefined) spaceCache.set(pageId, row.space_key);
      return row === undefined ? null : exposureFromRow(row);
    },
    async put(exposure: PageExposure) {
      const row = exposureToRow(exposure);
      spaceCache.set(exposure.pageId, exposure.spaceKey);
      await mutate('DELETE FROM exposure WHERE page_id = ?', [row.page_id]);
      await mutate(
        'INSERT INTO exposure (page_id, space_key, readers_low, readers_high, sharing_state, restrictions_json, ai_surface, computed_at) VALUES (?,?,?,?,?,?,?,?)',
        [row.page_id, row.space_key, row.readers_low, row.readers_high, row.sharing_state, row.restrictions_json, row.ai_surface, row.computed_at],
      );
    },
  };
}

function forgePageScans(): ForgeStore['pageScans'] {
  return {
    async get(pageId: string) {
      const rows = await select<PageScanRow>('SELECT * FROM page_scan WHERE page_id = ? LIMIT 1', [pageId]);
      return rows[0] === undefined ? null : pageScanFromRow(rows[0]!);
    },
    async put(record: PageScanRecord) {
      const row = pageScanToRow(record);
      await mutate('DELETE FROM page_scan WHERE page_id = ?', [row.page_id]);
      await mutate(
        'INSERT INTO page_scan (page_id, content_hash, version_scanned, scanned_at, detectors_version, llm_calls, tokens, skipped_reason) VALUES (?,?,?,?,?,?,?,?)',
        [row.page_id, row.content_hash, row.version_scanned, row.scanned_at, row.detectors_version, row.llm_calls, row.tokens, row.skipped_reason],
      );
    },
    async listSkipped() {
      const rows = await select<PageScanRow>('SELECT * FROM page_scan WHERE skipped_reason <> ?', ['']);
      return rows.map(pageScanFromRow);
    },
  };
}

function forgeAttachmentScans(): ForgeStore['attachmentScans'] {
  return {
    async listByPage(pageId: string) {
      const rows = await select<AttachmentScanRow>('SELECT * FROM attachment_scan WHERE page_id = ?', [pageId]);
      return rows.map(attachmentScanFromRow);
    },
    async put(record: AttachmentScanRecord) {
      const row = attachmentScanToRow(record);
      await mutate('DELETE FROM attachment_scan WHERE attachment_id = ?', [row.attachment_id]);
      await mutate(
        'INSERT INTO attachment_scan (attachment_id, page_id, filename, mime, size, read_state, skipped_reason, findings_count) VALUES (?,?,?,?,?,?,?,?)',
        [row.attachment_id, row.page_id, row.filename, row.mime, row.size, row.read_state, row.skipped_reason, row.findings_count],
      );
    },
    async listSkipped() {
      const rows = await select<AttachmentScanRow>('SELECT * FROM attachment_scan WHERE read_state <> ?', ['read']);
      return rows.map(attachmentScanFromRow);
    },
  };
}

function forgeRitualSteps(): ForgeStore['ritualSteps'] {
  return {
    async listByFinding(findingId: string) {
      const rows = await select<RitualStepRow>('SELECT * FROM ritual_step WHERE finding_id = ?', [findingId]);
      return rows.map(ritualStepFromRow);
    },
    async put(step: RitualStepState) {
      const row = ritualStepToRow(step);
      await mutate('DELETE FROM ritual_step WHERE id = ?', [row.id]);
      await mutate(
        'INSERT INTO ritual_step (id, finding_id, step, state, actor_ref, attestation_ref, at) VALUES (?,?,?,?,?,?,?)',
        [row.id, row.finding_id, row.step, row.state, row.actor_ref, row.attestation_ref, row.at],
      );
    },
  };
}

function forgePurgeRequests(): ForgeStore['purgeRequests'] {
  return {
    async listByFinding(findingId: string) {
      const rows = await select<PurgeRequestRow>('SELECT * FROM purge_request WHERE finding_id = ?', [findingId]);
      return rows.map(purgeRequestFromRow);
    },
    async listPending() {
      const rows = await select<PurgeRequestRow>("SELECT * FROM purge_request WHERE state = 'requested'", []);
      return rows.map(purgeRequestFromRow);
    },
    async put(request: PurgeRequest) {
      const row = purgeRequestToRow(request);
      await mutate('DELETE FROM purge_request WHERE id = ?', [row.id]);
      await mutate(
        'INSERT INTO purge_request (id, finding_id, page_id, version_numbers_json, requested_at, requested_by_ref, state, admin_ref) VALUES (?,?,?,?,?,?,?,?)',
        [row.id, row.finding_id, row.page_id, row.version_numbers_json, row.requested_at, row.requested_by_ref, row.state, row.admin_ref],
      );
    },
    async markState(id: string, state: PurgeRequest['state'], adminRef?: string) {
      await mutate('UPDATE purge_request SET state = ?, admin_ref = ? WHERE id = ?', [state, adminRef ?? null, id]);
    },
  };
}

function forgeOwners(): ForgeStore['owners'] {
  return {
    async get(pageId: string) {
      const rows = await select<OwnerResolutionRow>('SELECT * FROM owner_resolution WHERE page_id = ? LIMIT 1', [pageId]);
      return rows[0] === undefined ? null : ownerFromRow(rows[0]!);
    },
    async put(resolution: OwnerResolution) {
      const row = ownerToRow(resolution);
      await mutate('DELETE FROM owner_resolution WHERE page_id = ?', [row.page_id]);
      await mutate(
        'INSERT INTO owner_resolution (page_id, owner_ref, method, confidence, resolved_at) VALUES (?,?,?,?,?)',
        [row.page_id, row.owner_ref, row.method, row.confidence, row.resolved_at],
      );
    },
    async listUnresolved() {
      const rows = await select<OwnerResolutionRow>("SELECT * FROM owner_resolution WHERE confidence = 'none' OR owner_ref IS NULL", []);
      return rows.map((r) => r.page_id);
    },
  };
}

function forgeCertificates(): ForgeStore['certificates'] {
  return {
    async get(id: string) {
      const rows = await select<CertificateRow>('SELECT * FROM certificate WHERE id = ? LIMIT 1', [id]);
      return rows[0] === undefined ? null : certificateFromRow(rows[0]!);
    },
    async latest(scope: string) {
      const rows = await select<CertificateRow>('SELECT * FROM certificate WHERE scope = ? ORDER BY issued_at DESC LIMIT 1', [scope]);
      return rows[0] === undefined ? null : certificateFromRow(rows[0]!);
    },
    async put(cert: Certificate) {
      const row = certificateToRow(cert);
      await mutate('DELETE FROM certificate WHERE id = ?', [row.id]);
      await mutate(
        'INSERT INTO certificate (id, scope, issued_at, open, rotated, redacted, purged, residual_exposure, blind_spots_json, content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [row.id, row.scope, row.issued_at, row.open, row.rotated, row.redacted, row.purged, row.residual_exposure, row.blind_spots_json, row.content_hash],
      );
    },
  };
}

function forgeCursors(): ForgeStore['cursors'] {
  return {
    async get(scope: string, mode: SweepCursor['mode']) {
      const rows = await select<SweepCursorRow>('SELECT * FROM sweep_cursor WHERE scope = ? AND mode = ? LIMIT 1', [scope, mode]);
      return rows[0] === undefined ? null : cursorFromRow(rows[0]!);
    },
    async put(cursor: SweepCursor) {
      const row = cursorToRow(cursor);
      await mutate('DELETE FROM sweep_cursor WHERE scope = ? AND mode = ?', [row.scope, row.mode]);
      await mutate(
        'INSERT INTO sweep_cursor (scope, mode, last_page_id, last_modified_at, run_at) VALUES (?,?,?,?,?)',
        [row.scope, row.mode, row.last_page_id, row.last_modified_at, row.run_at],
      );
    },
  };
}

function forgeBudget(): ForgeStore['budget'] {
  return {
    async get(day: string) {
      const rows = await select<BudgetRow>('SELECT * FROM budget WHERE day = ? LIMIT 1', [day]);
      return rows[0] === undefined ? null : budgetFromRow(rows[0]!);
    },
    async put(b: ScanBudget) {
      const row = budgetToRow(b);
      await mutate('DELETE FROM budget WHERE day = ?', [row.day]);
      await mutate(
        'INSERT INTO budget (day, pages_scanned, attachments_read, attachments_skipped, llm_calls, tokens, cost_estimate) VALUES (?,?,?,?,?,?,?)',
        [row.day, row.pages_scanned, row.attachments_read, row.attachments_skipped, row.llm_calls, row.tokens, row.cost_estimate],
      );
    },
  };
}

/** Ligne brute de la table technique `gite_coverage`. */
interface GiteCoverageRow {
  day: string;
  gite: string;
  scanned: number;
  skipped: number;
  reason: string | null;
}

function forgeGiteCoverage(): ForgeStore['giteCoverage'] {
  return {
    async get(day: string, gite: string) {
      const rows = await select<GiteCoverageRow>('SELECT * FROM gite_coverage WHERE day = ? AND gite = ? LIMIT 1', [day, gite]);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        gite: row.gite,
        scanned: Number(row.scanned),
        skipped: Number(row.skipped),
        ...(row.reason === null ? {} : { reason: row.reason }),
      };
    },
    async put(line: ForgeStore['giteCoverage'] extends never ? never : GiteCoverageLine, day: string) {
      await mutate('DELETE FROM gite_coverage WHERE day = ? AND gite = ?', [day, line.gite]);
      await mutate(
        'INSERT INTO gite_coverage (day, gite, scanned, skipped, reason) VALUES (?,?,?,?,?)',
        [day, line.gite, line.scanned, line.skipped, line.reason ?? null],
      );
    },
    async list(day: string) {
      const rows = await select<GiteCoverageRow>('SELECT * FROM gite_coverage WHERE day = ? ORDER BY gite ASC', [day]);
      return rows.map((row) => ({
        gite: row.gite,
        scanned: Number(row.scanned),
        skipped: Number(row.skipped),
        ...(row.reason === null ? {} : { reason: row.reason }),
      }));
    },
  };
}

const settingsMap = new Map<string, SpaceSettings>();

function forgeSettings(): ForgeStore['settings'] {
  return {
    async get(spaceKey: string) {
      return settingsMap.get(spaceKey) ?? defaultSpaceSettings(spaceKey);
    },
    async put(value: SpaceSettings) {
      settingsMap.set(value.spaceKey, value);
    },
  };
}

/** Fabrique le store Forge SQL. */
export function createForgeStore(): ForgeStore {
  const findings = forgeFindings();
  return {
    findings,
    locations: forgeLocations(),
    exposures: forgeExposures(),
    pageScans: forgePageScans(),
    attachmentScans: forgeAttachmentScans(),
    ritualSteps: forgeRitualSteps(),
    purgeRequests: forgePurgeRequests(),
    owners: forgeOwners(),
    certificates: forgeCertificates(),
    cursors: forgeCursors(),
    budget: forgeBudget(),
    giteCoverage: forgeGiteCoverage(),
    settings: forgeSettings(),
    async saveFoyer(foyer: Foyer) {
      await findings.upsert(foyer);
    },
    async getFoyer(id: string) {
      return findings.get(id);
    },
    async listFoyers(q: ListFoyersQuery) {
      return findings.list(q);
    },
  };
}

/**
 * Lit un secret applicatif persisté ; le crée au premier appel, puis le relit
 * pour que deux exécutions concurrentes convergent vers la même valeur (le
 * dernier écrit gagne, mais les deux repartent avec la même clé). La valeur n'est
 * jamais journalisée.
 */
export async function readOrCreateAppSecret(name: string, generate: () => string): Promise<string> {
  const rows = await select<{ value: string }>('SELECT value FROM app_secret WHERE name = ? LIMIT 1', [name]);
  const existing = rows[0];
  if (existing !== undefined && existing.value !== '') return existing.value;
  await mutate('DELETE FROM app_secret WHERE name = ?', [name]);
  await mutate('INSERT INTO app_secret (name, value, created_at) VALUES (?,?,?)', [
    name, generate(), new Date().toISOString(),
  ]);
  const created = await select<{ value: string }>('SELECT value FROM app_secret WHERE name = ? LIMIT 1', [name]);
  return created[0]?.value ?? '';
}

/** Export utilitaire : réhydratation synchrone d'un foyer avec l'espace connu. */
export function rehydrateWithSpace(foyer: Foyer, spaceKey: string): Foyer {
  return spaceKey === '' ? foyer : { ...foyer, spaceKey };
}

/** Type re-exporté pour la cohérence des ports (réglages par espace, PW-24). */
export type { SpaceSettings };