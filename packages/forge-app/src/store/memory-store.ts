/**
 * Store en mémoire — implémentation des ports `ForgeStore` (§20) pour les tests
 * et le mode hors-ligne. Aucune valeur brute n'est conservée : les foyers
 * portent déjà empreinte et aperçu masqué.
 *
 * Règle : les services sont testés avec CE store, jamais avec `@forge/sql`.
 * Chaque dépôt est une fonction séparée pour rester sous la limite de taille.
 */

import type {
  AttachmentScanRecord,
  Certificate,
  Foyer,
  FoyerLocation,
  FoyerState,
  OwnerResolution,
  PageExposure,
  PageScanRecord,
  PurgeRequest,
  RitualStepState,
  ScanBudget,
  SweepCursor,
  WikiFamily,
} from '@placard-wiki/domain';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { SpaceSettings } from '@placard-wiki/domain';

import type { ForgeStore, GiteScanRecord, ListFoyersQuery } from './ports';

/** Toutes les familles du domaine (§7) — pour les réglages par défaut. */
const ALL_FAMILIES = Object.keys(FAMILY_LABELS) as WikiFamily[];

/** Réglages par défaut d'un espace (PW-24) — toutes les familles actives. */
export function defaultSpaceSettings(spaceKey: string): SpaceSettings {
  return {
    spaceKey,
    familiesEnabled: ALL_FAMILIES,
    minScore: 0,
    exclusions: [],
    purgePolicy: 'request-admin',
    demoMode: false,
  };
}

/** Foyer rehydraté : `spaceKey` dérivé de l'exposition de la page principale. */
export function rehydrate(foyer: Foyer, spaceOf: (pageId: string) => string | undefined): Foyer {
  if (foyer.spaceKey !== undefined) return foyer;
  const primary = foyer.primaryPageId ?? foyer.locations[0]?.pageId;
  const spaceKey = primary === undefined ? undefined : spaceOf(primary);
  return spaceKey === undefined ? foyer : { ...foyer, spaceKey, primaryPageId: primary };
}

/** État partagé du store en mémoire. */
export interface MemoryState {
  findings: Map<string, Foyer>;
  byFingerprint: Map<string, string>;
  locations: Map<string, FoyerLocation[]>;
  exposures: Map<string, PageExposure>;
  pageScans: Map<string, PageScanRecord>;
  attachmentScans: Map<string, AttachmentScanRecord[]>;
  ritualSteps: Map<string, RitualStepState[]>;
  purgeRequests: Map<string, PurgeRequest>;
  owners: Map<string, OwnerResolution>;
  certificates: Map<string, Certificate>;
  cursors: Map<string, SweepCursor>;
  budgets: Map<string, ScanBudget>;
  giteScans: Map<string, GiteScanRecord>;
  settings: Map<string, SpaceSettings>;
}

function emptyState(): MemoryState {
  return {
    findings: new Map(), byFingerprint: new Map(), locations: new Map(),
    exposures: new Map(), pageScans: new Map(), attachmentScans: new Map(),
    ritualSteps: new Map(), purgeRequests: new Map(), owners: new Map(),
    certificates: new Map(), cursors: new Map(), budgets: new Map(),
    giteScans: new Map(), settings: new Map(),
  };
}

function cursorKey(scope: string, mode: SweepCursor['mode']): string {
  return `${scope}|${mode}`;
}

function matches(foyer: Foyer, q: ListFoyersQuery): boolean {
  if (q.fingerprint !== undefined && foyer.fingerprint !== q.fingerprint) return false;
  if (q.family !== undefined && foyer.family !== q.family) return false;
  if (q.state !== undefined && foyer.state !== q.state) return false;
  if (q.minScore !== undefined && foyer.score < q.minScore) return false;
  if (q.spaceKey !== undefined && foyer.spaceKey !== q.spaceKey) return false;
  return true;
}

/** Charge un foyer complet (ligne + emplacements), rehydraté avec l'espace. */
function loadFoyer(s: MemoryState, id: string): Foyer | null {
  const f = s.findings.get(id);
  if (f === undefined) return null;
  const spaceOf = (pageId: string): string | undefined => s.exposures.get(pageId)?.spaceKey;
  return rehydrate({ ...f, locations: s.locations.get(id) ?? [] }, spaceOf);
}

function memoryFindings(s: MemoryState): ForgeStore['findings'] {
  return {
    async get(id: string) {
      return loadFoyer(s, id);
    },
    async byFingerprint(fp: string) {
      const id = s.byFingerprint.get(fp);
      return id === undefined ? null : loadFoyer(s, id);
    },
    async list(q: ListFoyersQuery) {
      const all = [...s.findings.keys()]
        .map((id) => loadFoyer(s, id))
        .filter((f): f is Foyer => f !== null);
      return all.filter((f) => matches(f, q)).slice(0, q.limit);
    },
    async upsert(foyer: Foyer) {
      s.findings.set(foyer.id, foyer);
      s.byFingerprint.set(foyer.fingerprint, foyer.id);
      s.locations.set(foyer.id, [...foyer.locations]);
    },
  };
}

function memoryLocations(s: MemoryState): ForgeStore['locations'] {
  return {
    async byFinding(findingId: string) {
      return s.locations.get(findingId) ?? [];
    },
    async replaceForFinding(findingId: string, list: readonly FoyerLocation[]) {
      s.locations.set(findingId, [...list]);
      const f = s.findings.get(findingId);
      if (f !== undefined) s.findings.set(findingId, { ...f, locations: [...list] });
    },
    async markRedacted(locationId: string, redactedAt: string) {
      for (const list of s.locations.values()) {
        const found = list.find((l) => l.id === locationId);
        if (found !== undefined) {
          found.status = 'redacted';
          found.redactedAt = redactedAt;
          return;
        }
      }
    },
  };
}

function memoryExposures(s: MemoryState): ForgeStore['exposures'] {
  return {
    async get(pageId: string) {
      return s.exposures.get(pageId) ?? null;
    },
    async put(exposure: PageExposure) {
      s.exposures.set(exposure.pageId, exposure);
    },
  };
}

function memoryPageScans(s: MemoryState): ForgeStore['pageScans'] {
  return {
    async get(pageId: string) {
      return s.pageScans.get(pageId) ?? null;
    },
    async put(record: PageScanRecord) {
      s.pageScans.set(record.pageId, record);
    },
    async listSkipped() {
      return [...s.pageScans.values()].filter((r) => r.skippedReason !== undefined);
    },
  };
}

function memoryAttachmentScans(s: MemoryState): ForgeStore['attachmentScans'] {
  return {
    async listByPage(pageId: string) {
      return s.attachmentScans.get(pageId) ?? [];
    },
    async put(record: AttachmentScanRecord) {
      const list = s.attachmentScans.get(record.pageId) ?? [];
      const idx = list.findIndex((a) => a.attachmentId === record.attachmentId);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      s.attachmentScans.set(record.pageId, list);
    },
    async listSkipped() {
      return [...s.attachmentScans.values()].flat().filter((r) => r.readState !== 'read');
    },
  };
}

function memoryRitualSteps(s: MemoryState): ForgeStore['ritualSteps'] {
  return {
    async listByFinding(findingId: string) {
      return s.ritualSteps.get(findingId) ?? [];
    },
    async put(step: RitualStepState) {
      const list = (s.ritualSteps.get(step.foyerId) ?? []).filter((x) => x.step !== step.step);
      list.push(step);
      s.ritualSteps.set(step.foyerId, list);
    },
  };
}

function memoryPurgeRequests(s: MemoryState): ForgeStore['purgeRequests'] {
  return {
    async listByFinding(findingId: string) {
      return [...s.purgeRequests.values()].filter((r) => r.foyerId === findingId);
    },
    async listPending() {
      return [...s.purgeRequests.values()].filter((r) => r.state === 'requested');
    },
    async put(request: PurgeRequest) {
      s.purgeRequests.set(request.id, request);
    },
    async markState(id: string, state: PurgeRequest['state'], adminRef?: string) {
      const r = s.purgeRequests.get(id);
      if (r !== undefined) s.purgeRequests.set(id, { ...r, state, adminRef: adminRef ?? r.adminRef });
    },
  };
}

function memoryOwners(s: MemoryState): ForgeStore['owners'] {
  return {
    async get(pageId: string) {
      return s.owners.get(pageId) ?? null;
    },
    async put(resolution: OwnerResolution) {
      s.owners.set(resolution.pageId, resolution);
    },
    async listUnresolved() {
      return [...s.owners.values()]
        .filter((o) => o.confidence === 'none' || o.ownerRef === undefined)
        .map((o) => o.pageId);
    },
  };
}

function memoryCertificates(s: MemoryState): ForgeStore['certificates'] {
  return {
    async get(id: string) {
      return s.certificates.get(id) ?? null;
    },
    async latest(scope: string) {
      const matching = [...s.certificates.values()].filter((c) => c.scope === scope);
      return matching.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0] ?? null;
    },
    async put(cert: Certificate) {
      s.certificates.set(cert.id, cert);
    },
  };
}

function memoryCursors(s: MemoryState): ForgeStore['cursors'] {
  return {
    async get(scope: string, mode: SweepCursor['mode']) {
      return s.cursors.get(cursorKey(scope, mode)) ?? null;
    },
    async put(cursor: SweepCursor) {
      s.cursors.set(cursorKey(cursor.scope, cursor.mode), cursor);
    },
  };
}

function memoryBudget(s: MemoryState): ForgeStore['budget'] {
  return {
    async get(day: string) {
      return s.budgets.get(day) ?? null;
    },
    async put(b: ScanBudget) {
      s.budgets.set(b.day, b);
    },
  };
}

function memoryGiteScans(s: MemoryState): ForgeStore['giteScans'] {
  return {
    async put(record: GiteScanRecord) {
      s.giteScans.set(record.gite, record);
    },
    async list() {
      return [...s.giteScans.values()];
    },
  };
}

function memorySettings(s: MemoryState): ForgeStore['settings'] {
  return {
    async get(spaceKey: string) {
      return s.settings.get(spaceKey) ?? defaultSpaceSettings(spaceKey);
    },
    async put(value: SpaceSettings) {
      s.settings.set(value.spaceKey, value);
    },
  };
}

/** Fabrique le store en mémoire. */
export function createMemoryStore(): ForgeStore {
  const s = emptyState();
  const spaceOf = (pageId: string): string | undefined => s.exposures.get(pageId)?.spaceKey;
  return {
    findings: memoryFindings(s),
    locations: memoryLocations(s),
    exposures: memoryExposures(s),
    pageScans: memoryPageScans(s),
    attachmentScans: memoryAttachmentScans(s),
    ritualSteps: memoryRitualSteps(s),
    purgeRequests: memoryPurgeRequests(s),
    owners: memoryOwners(s),
    certificates: memoryCertificates(s),
    cursors: memoryCursors(s),
    budget: memoryBudget(s),
    giteScans: memoryGiteScans(s),
    settings: memorySettings(s),
    async saveFoyer(foyer: Foyer) {
      const enriched = rehydrate(foyer, spaceOf);
      s.findings.set(enriched.id, enriched);
      s.byFingerprint.set(enriched.fingerprint, enriched.id);
      s.locations.set(enriched.id, [...enriched.locations]);
    },
    async getFoyer(id: string) {
      return loadFoyer(s, id);
    },
    async listFoyers(q: ListFoyersQuery) {
      const all = [...s.findings.keys()]
        .map((id) => loadFoyer(s, id))
        .filter((f): f is Foyer => f !== null);
      return all.filter((f) => matches(f, q)).slice(0, q.limit);
    },
  };
}

/** Re-export de types utilisés par les services. */
export type { FoyerState, WikiFamily };