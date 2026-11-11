import { describe, expect, it } from 'vitest';
import { TABLE_DDL, TABLE_NAMES } from './sql.js';

/** Les onze tables du cahier des charges §20. */
const EXPECTED_TABLES = [
  'finding', 'location', 'exposure', 'page_scan', 'attachment_scan',
  'ritual_step', 'purge_request', 'owner_resolution', 'certificate',
  'sweep_cursor', 'budget',
];

/** Colonnes principales exigées par table (§20). */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  finding: ['id', 'fingerprint_hmac', 'family', 'kind', 'base_score', 'score', 'score_terms_json', 'state', 'first_seen_at', 'last_seen_at', 'rotated_at', 'rotation_evidence_ref', 'dismissed_reason', 'dismissed_review_at'],
  location: ['id', 'finding_id', 'container_type', 'container_ari', 'page_id', 'version_number', 'char_start', 'char_end', 'masked_preview', 'detected_at', 'redacted_at'],
  exposure: ['page_id', 'space_key', 'readers_low', 'readers_high', 'sharing_state', 'restrictions_json', 'ai_surface', 'computed_at'],
  page_scan: ['page_id', 'content_hash', 'version_scanned', 'scanned_at', 'detectors_version', 'llm_calls', 'tokens', 'skipped_reason'],
  attachment_scan: ['attachment_id', 'page_id', 'filename', 'mime', 'size', 'read_state', 'skipped_reason', 'findings_count'],
  ritual_step: ['id', 'finding_id', 'step', 'state', 'actor_ref', 'attestation_ref', 'at'],
  purge_request: ['id', 'finding_id', 'page_id', 'version_numbers_json', 'requested_at', 'requested_by_ref', 'state', 'admin_ref'],
  owner_resolution: ['page_id', 'owner_ref', 'method', 'confidence', 'resolved_at'],
  certificate: ['id', 'scope', 'issued_at', 'open', 'rotated', 'redacted', 'purged', 'residual_exposure', 'blind_spots_json', 'content_hash'],
  sweep_cursor: ['scope', 'mode', 'last_page_id', 'last_modified_at', 'run_at'],
  budget: ['day', 'pages_scanned', 'attachments_read', 'attachments_skipped', 'llm_calls', 'tokens', 'cost_estimate'],
};

describe('schéma SQL (§20)', () => {
  it('couvre exactement les onze tables du cahier', () => {
    expect([...TABLE_NAMES].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it('chaque table déclare ses colonnes principales', () => {
    for (const table of EXPECTED_TABLES) {
      const ddl = TABLE_DDL[table as keyof typeof TABLE_DDL];
      expect(ddl, table).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      for (const column of EXPECTED_COLUMNS[table] ?? []) {
        expect(ddl, `${table}.${column}`).toContain(column);
      }
    }
  });

  it('aucune colonne ne porte de valeur de secret ou de texte de page', () => {
    // Garde §20 : « Aucune table ne contient de valeur de secret, de texte de
    // page ni de pièce jointe. » Les seuls contenus dérivés sont l'empreinte
    // HMAC et l'aperçu masqué.
    for (const ddl of Object.values(TABLE_DDL)) {
      expect(ddl).not.toMatch(/secret_value|raw_value|plaintext|page_body|content_text/i);
    }
  });
});
