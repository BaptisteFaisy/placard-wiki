/**
 * La table `surface_seen` — le registre multi-surfaces (PW-31).
 *
 * Une ligne = « l'empreinte a été vue sur cette surface, à cet endroit ».
 * Elle porte une **empreinte**, un identifiant d'emplacement et une étiquette
 * lisible — **jamais** de valeur brute (§23).
 *
 * Ce fichier ne contient que des types et des conversions : il n'importe pas
 * `@forge/sql` (seul `store/forge-store.ts` le fait).
 */

import type { SurfaceKind, SurfaceSeen, SurfaceState } from '@placard-wiki/surfaces';

/** La ligne SQL `surface_seen`. */
export interface SurfaceSeenRow {
  fingerprint: string;
  surface: string;
  external_id: string;
  label: string;
  namespace_id: string;
  foyer_id: string | null;
  state: string;
  method: string;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
}

/** Le DDL de la table `surface_seen` (idempotent). */
export const SURFACE_SEEN_DDL = `CREATE TABLE IF NOT EXISTS surface_seen (
  fingerprint TEXT,
  surface TEXT,
  external_id TEXT,
  label TEXT,
  namespace_id TEXT,
  foyer_id TEXT,
  state TEXT,
  method TEXT,
  source TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT
)`;

/** Observation → ligne `surface_seen`. */
export function surfaceSeenToRow(seen: SurfaceSeen): SurfaceSeenRow {
  return {
    fingerprint: seen.fingerprint,
    surface: seen.surface,
    external_id: seen.externalId,
    label: seen.label,
    namespace_id: seen.namespaceId,
    foyer_id: seen.foyerId ?? null,
    state: seen.state,
    method: seen.method,
    source: seen.source,
    first_seen_at: seen.firstSeenAt,
    last_seen_at: seen.lastSeenAt,
  };
}

/** Ligne `surface_seen` → observation (les champs vides redeviennent `undefined`). */
export function surfaceSeenFromRow(row: SurfaceSeenRow): SurfaceSeen {
  return {
    fingerprint: row.fingerprint,
    surface: row.surface as SurfaceKind,
    externalId: row.external_id,
    label: row.label,
    namespaceId: row.namespace_id,
    ...(row.foyer_id !== null && row.foyer_id !== '' ? { foyerId: row.foyer_id } : {}),
    state: row.state as SurfaceState,
    method: row.method,
    source: row.source,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}
