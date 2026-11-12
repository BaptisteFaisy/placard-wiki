/**
 * Le contrat du bridge : les méthodes que l'interface Forge appelle, et ce
 * qu'elles renvoient. Une seule définition — l'UI et le résolveur s'y
 * conforment, jamais de noms en double côté consommateur.
 *
 * Règle : aucune méthode ne transporte de valeur brute de secret. Les diffs
 * de caviardage sont masqués (le contexte est montré, la valeur jamais).
 */

import type {
  Certificate,
  Foyer,
  OwnerResolution,
  PageExposure,
  PurgeRequest,
  RitualStepState,
  ScanBudget,
  SweepCursor,
} from './types';
import type { FoyerState, WikiFamily } from './vocabulary';

/** Réglages par espace (§16 PW-24). */
export interface SpaceSettings {
  spaceKey: string;
  familiesEnabled: WikiFamily[];
  /** Seuil d'affichage : en dessous, le foyer existe mais n'alerte pas. */
  minScore: number;
  /** Exclusions : empreintes ou motifs écartés par l'espace, avec raison. */
  exclusions: Array<{ fingerprint?: string; pattern?: string; reason: string }>;
  /** Politique de purge : demander à l'admin, ou l'API si elle le permet. */
  purgePolicy: 'request-admin' | 'api-if-possible';
  defaultOwnerRef?: string;
  /** Espace en mode démonstration (marqué comme tel dans l'interface, §15). */
  demoMode: boolean;
}

/** Une ligne du registre — l'information exacte du bâtiment (§10, PW-15). */
export interface RegistryRow {
  foyerId: string;
  family: WikiFamily;
  maskedPreview: string;
  score: number;
  state: FoyerState;
  spaceKey: string;
  pageTitle: string;
  pageId: string;
  locationCount: number;
  /** Encore lisible dans la version courante ? */
  inCurrentVersion: boolean;
  /** Encore lisible dans l'historique ? */
  inHistory: boolean;
  readersLow: number;
  readersHigh: number;
  sharing: string;
  aiSurface: boolean;
  ownerRef?: string;
  ownerMethod?: string;
  lastSeenAt: string;
}

/** Un diff de caviardage, masqué : le contexte est montré, la valeur jamais. */
export interface RedactionDiff {
  locationId: string;
  pageId: string;
  versionNumber?: number;
  containerType: string;
  /** Ligne avant, avec la valeur masquée (`AKIA…(20)`). */
  maskedBefore: string;
  /** Ligne après : la valeur remplacée par le marqueur daté. */
  after: string;
  /** Le marqueur inséré : `[retiré — rotation attestée le …, voir …]`. */
  replacement: string;
}

/** Couverture par gîte : ce qui est lu, ce qui ne l'est pas, et pourquoi (§19). */
export interface CoverageReport {
  readonly perGite: ReadonlyArray<{ gite: string; scanned: number; skipped: number; reason?: string }>;
  /** Angles morts déclarés : whiteboards, bases Confluence, captures d'écran… */
  blindSpots: string[];
  /** Droits manquants : distingués de « pas de données » (§19). */
  missingRights: string[];
  lastPassAt?: string;
}

/**
 * L'état d'un gîte, tel que la passe l'a mesuré — jamais déduit (§6, §14).
 *
 * Trois états mesurés, jamais mélangés : `read` (lu), `unread` (accessible
 * mais pas entièrement lisible), `inaccessible` (accès refusé — « pas de
 * droit », pas « pas de données »). Et un quatrième cas, qui n'est pas un
 * état de lecture mais une absence de mesure : `not-attempted`.
 */
export type GiteCoverageState = 'read' | 'unread' | 'inaccessible' | 'not-attempted';

/**
 * Le détail mesuré d'un gîte : lu, non lu, inaccessible — la matière
 * première du pourcentage de couverture (§14, §19).
 */
export interface GiteCoverageDetail {
  /** Pages où le gîte a été lu. */
  pagesRead: number;
  /** Pages accessibles dont une partie n'a pas pu être lue. */
  pagesUnread: number;
  /** Pages où l'accès a été refusé (droits manquants). */
  pagesInaccessible: number;
  /** L'état, en clair. */
  state: GiteCoverageState;
}

/** Une ligne de couverture : la forme du domaine, plus la mesure du gîte. */
export type GiteCoverageRow = CoverageReport['perGite'][number] & GiteCoverageDetail;

/**
 * Le rapport de couverture : la forme du domaine, plus le pourcentage et SA
 * méthode (§14, §19).
 *
 * `coveragePercent` est `null` quand la couverture est INDÉTERMINÉE (aucune
 * passe enregistrée) — jamais 0 %, qui dirait « rien trouvé » alors que rien
 * n'a été regardé.
 */
export interface CoverageReportReelle extends CoverageReport {
  perGite: GiteCoverageRow[];
  /** La couverture réelle, en % (null = indéterminée, jamais 0 %). */
  coveragePercent: number | null;
  /** Gîtes effectivement couverts (au moins une page lue). */
  gitesCovered: number;
  /** Gîtes visés (§6). */
  gitesTotal: number;
  /** La méthode, en clair : un pourcentage sans sa méthode ne vaut rien. */
  method: string;
  /** Pages visées par la passe qui a produit la mesure. */
  pagesTargeted: number;
  /** Pages lues, tous gîtes confondus. */
  pagesRead: number;
}

/** Le bâtiment, en données (§10) : le registre porte la même information. */
export interface BuildingModel {
  wings: Array<{
    spaceKey: string;
    floors: Array<{
      depth: number;
      rooms: Array<{
        pageId: string;
        title: string;
        /** Taille = audience (lecteurs potentiels). */
        audience: number;
        locked: boolean;
        openWindow: boolean;
        /** Lueur sous la porte : danger maximal derrière. */
        maxDanger: number;
        /** Cave : historique de versions ; trappe ouverte = secret encore lisible. */
        cellarOpen: boolean;
        poster: boolean;
        walled: boolean;
        sealCount: number;
        ribbonCount: number;
      }>;
    }>;
    /** Courants d'air : la même empreinte à deux endroits. */
    drafts: Array<{ fromPageId: string; toPageId: string; fingerprint: string }>;
  }>;
}

/** Charge utile d'une méthode du bridge. */
export interface BridgeRequests {
  'registry/list': {
    spaceKey?: string;
    family?: WikiFamily;
    state?: FoyerState;
    minScore?: number;
    sort?: 'score' | 'lastSeen' | 'readers';
    limit: number;
    cursor?: string;
  };
  'finding/get': { foyerId: string };
  'finding/dismiss': { foyerId: string; reason: string; reviewAt: string; actorRef: string };
  'ritual/attest': {
    foyerId: string;
    provider: string;
    evidenceRef: string;
    actorRef: string;
    /** Un agent est refusé (§17) : l'attestation est humaine. */
    actorKind: 'human' | 'agent';
  };
  'ritual/redaction-preview': { foyerId: string; locationIds?: string[] };
  'ritual/redaction-apply': {
    foyerId: string;
    approvedBy: string;
    comment: string;
    locationIds?: string[];
  };
  'ritual/purge-request': { foyerId: string; pageId?: string; versionNumbers?: number[] };
  'ritual/ticket': { foyerId: string; projectKey: string };
  'sweep/start': { mode: 'incremental' | 'full' | 'on-demand'; scope: string };
  'sweep/status': Record<string, never>;
  'budget/get': Record<string, never>;
  'coverage/get': Record<string, never>;
  'adoption/list': Record<string, never>;
  'adoption/assign': { pageId: string; ownerRef: string; actorRef: string };
  'settings/get': { spaceKey: string };
  'settings/save': { settings: SpaceSettings; actorRef: string };
  'certificate/generate': { scope: string };
  'certificate/get': { certificateId: string };
  'building/get': { spaceKey?: string };
  'exposure/get': { pageId: string };
}

/** Résultat d'une méthode du bridge. */
export interface BridgeResults {
  'registry/list': { rows: RegistryRow[]; nextCursor?: string; total: number };
  'finding/get': {
    foyer: Foyer;
    exposure?: PageExposure;
    ritual: RitualStepState[];
    owner?: OwnerResolution;
    purgeRequests: PurgeRequest[];
  };
  'finding/dismiss': { ok: true; reviewAt: string };
  'ritual/attest': { ok: true; attestedAt: string };
  'ritual/redaction-preview': { diffs: RedactionDiff[]; templateFirst: string[] };
  'ritual/redaction-apply': { applied: number; versionComment: string; asUser: string };
  'ritual/purge-request': { request: PurgeRequest; apiCanPurge: boolean };
  'ritual/ticket': { ticketKey: string; url: string };
  'sweep/start': { cursor: SweepCursor };
  'sweep/status': { cursor?: SweepCursor; running: boolean };
  'budget/get': ScanBudget;
  'coverage/get': CoverageReport;
  'adoption/list': { pages: Array<{ pageId: string; title: string; spaceKey: string; lastEditors: string[] }> };
  'adoption/assign': { ok: true };
  'settings/get': SpaceSettings;
  'settings/save': { ok: true };
  'certificate/generate': Certificate;
  'certificate/get': Certificate;
  'building/get': BuildingModel;
  'exposure/get': PageExposure;
}

/** Toutes les méthodes du bridge — pour validation croisée UI/résolveur. */
export const BRIDGE_METHODS = [
  'registry/list', 'finding/get', 'finding/dismiss',
  'ritual/attest', 'ritual/redaction-preview', 'ritual/redaction-apply',
  'ritual/purge-request', 'ritual/ticket',
  'sweep/start', 'sweep/status', 'budget/get', 'coverage/get',
  'adoption/list', 'adoption/assign',
  'settings/get', 'settings/save',
  'certificate/generate', 'certificate/get',
  'building/get', 'exposure/get',
] as const satisfies readonly (keyof BridgeRequests)[];

export type BridgeMethod = (typeof BRIDGE_METHODS)[number];
