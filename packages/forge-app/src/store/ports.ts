/**
 * Ports de la couche stockage Forge SQL (§20).
 *
 * Les services ne connaissent QUE ces interfaces : chaque dépôt est un port
 * injectable, pour que les tests s'exécutent sur un store en mémoire (jamais
 * `@forge/sql`). Le store est un agrégat de ces onze dépôts, plus un dépôt de
 * réglages par espace (PW-24, non persisté dans SQL — limite assumée).
 *
 * Règle absolue : aucune ligne, aucun foyer, aucun enregistrement ne porte de
 * valeur brute de secret — empreinte HMAC et aperçu masqué seulement (§23).
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
import type { SpaceSettings } from '@placard-wiki/domain';
import type { Gite } from '@placard-wiki/domain';

/**
 * L'état de lecture d'un gîte (§6) pour la dernière passe : lu, non lu,
 * inaccessible — avec la raison. C'est la mesure HONNÊTE de la couverture :
 * elle est écrite par le balayage, relue telle quelle, jamais reconstituée.
 */
export interface GiteScanRecord {
  /** Le gîte (§6) : corps de page, commentaires, pièces jointes… */
  gite: Gite;
  /** Pages où le gîte a été lu. */
  pagesRead: number;
  /** Pages accessibles, mais dont le contenu n'a pas pu être lu. */
  pagesUnread: number;
  /** Pages où l'accès a été refusé (droits manquants — jamais « pas de données »). */
  pagesInaccessible: number;
  /** Raison de l'échec (vide quand le gîte a été lu partout). */
  reason: string;
  /** Horodatage de la passe qui a produit ces compteurs. */
  passAt: string;
}

/** Ligne SQL de `gite_scan` (une ligne par gîte). */
export interface GiteScanRow {
  gite: string;
  pages_read: number;
  pages_unread: number;
  pages_inaccessible: number;
  reason: string;
  pass_at: string;
}

/** Filtres de lecture des foyers (vue registre, §16 PW-15). */
export interface ListFoyersQuery {
  spaceKey?: string;
  family?: WikiFamily;
  state?: FoyerState;
  minScore?: number;
  limit: number;
  fingerprint?: string;
}

/** Dépôt `finding` (§20) : un foyer = une empreinte et son état de réparation. */
export interface FindingRepo {
  get(id: string): Promise<Foyer | null>;
  byFingerprint(fingerprint: string): Promise<Foyer | null>;
  list(query: ListFoyersQuery): Promise<Foyer[]>;
  /** Ne réécrit que la ligne `finding` (les emplacements passent par `locations`). */
  upsert(foyer: Foyer): Promise<void>;
}

/** Dépôt `location` (§20) : les emplacements d'un foyer. */
export interface LocationRepo {
  byFinding(findingId: string): Promise<FoyerLocation[]>;
  /** Remplace l'ensemble des emplacements d'un foyer (dédup en amont). */
  replaceForFinding(findingId: string, locations: readonly FoyerLocation[]): Promise<void>;
  /** Marque un emplacement comme caviardé (horodaté). */
  markRedacted(locationId: string, redactedAt: string): Promise<void>;
}

/** Dépôt `exposure` (§20) : qui peut lire une page, et comment. */
export interface ExposureRepo {
  get(pageId: string): Promise<PageExposure | null>;
  put(exposure: PageExposure): Promise<void>;
}

/** Dépôt `page_scan` (§20) : empreinte du contenu et ce qu'on a su faire. */
export interface PageScanRepo {
  get(pageId: string): Promise<PageScanRecord | null>;
  put(record: PageScanRecord): Promise<void>;
  /** Pages non lues, avec leur raison — couverture déclarée, jamais masquée (§19). */
  listSkipped(): Promise<PageScanRecord[]>;
}

/** Dépôt `attachment_scan` (§20) : pièce jointe lue ou non lue, et pourquoi. */
export interface AttachmentScanRepo {
  listByPage(pageId: string): Promise<AttachmentScanRecord[]>;
  put(record: AttachmentScanRecord): Promise<void>;
  /** Pièces jointes non lues, avec leur raison (§14, PW-19) — aucun silence. */
  listSkipped(): Promise<AttachmentScanRecord[]>;
}

/** Dépôt `ritual_step` (§20) : l'état des cinq étapes du rituel. */
export interface RitualStepRepo {
  listByFinding(findingId: string): Promise<RitualStepState[]>;
  put(step: RitualStepState): Promise<void>;
}

/** Dépôt `purge_request` (§20) : demandes de purge à l'administrateur. */
export interface PurgeRequestRepo {
  listByFinding(findingId: string): Promise<PurgeRequest[]>;
  listPending(): Promise<PurgeRequest[]>;
  /** Toutes les demandes, tous états confondus — pour l'export CSV. */
  listAll(): Promise<PurgeRequest[]>;
  /** Une demande par son identifiant — pour suivre la décision de l'administrateur. */
  get(id: string): Promise<PurgeRequest | null>;
  put(request: PurgeRequest): Promise<void>;
  markState(id: string, state: PurgeRequest['state'], adminRef?: string): Promise<void>;
}

/** Dépôt `owner_resolution` (§20) : propriétaire résolu et sa méthode (§12). */
export interface OwnerResolutionRepo {
  get(pageId: string): Promise<OwnerResolution | null>;
  put(resolution: OwnerResolution): Promise<void>;
  /** Pages sans propriétaire résolu (confiance `none` ou jamais résolues). */
  listUnresolved(): Promise<string[]>;
}

/** Dépôt `certificate` (§20) : page datée et chiffrée, pour un auditeur. */
export interface CertificateRepo {
  get(id: string): Promise<Certificate | null>;
  latest(scope: string): Promise<Certificate | null>;
  put(certificate: Certificate): Promise<void>;
}

/** Dépôt `sweep_cursor` (§20) : reprise d'un balayage interrompu. */
export interface SweepCursorRepo {
  get(scope: string, mode: SweepCursor['mode']): Promise<SweepCursor | null>;
  put(cursor: SweepCursor): Promise<void>;
}

/** Dépôt `budget` (§20) : compteurs de la passe, jamais masqués (§14). */
export interface BudgetRepo {
  get(day: string): Promise<ScanBudget | null>;
  put(budget: ScanBudget): Promise<void>;
}

/**
 * Une ligne de couverture par gîte (§6) — lus, non lus, et la raison.
 *
 * Compteurs d'ÉLÉMENTS (un commentaire lu, une pièce jointe lue) : c'est la
 * mesure fine, celle du store. La mesure par PAGES vit dans `GiteScanRecord`.
 */
export interface GiteCoverageLine {
  gite: Gite;
  scanned: number;
  skipped: number;
  /** Raison du refus (scope manquant, chemin retiré…) si le gîte est illisible. */
  reason?: string;
}

/** Dépôt de couverture par gîte (§6) — persiste ce qu'une passe a vraiment lu. */
export interface GiteCoverageRepo {
  get(day: string, gite: string): Promise<GiteCoverageLine | null>;
  put(line: GiteCoverageLine, day: string): Promise<void>;
  /** Toutes les lignes d'un jour, triées par gîte. */
  list(day: string): Promise<GiteCoverageLine[]>;
}

/**
 * Dépôt `gite_scan` : la couverture RÉELLE, gîte par gîte (§6, §14).
 *
 * Compteurs de PAGES (pages lues, pages illisibles, pages refusées) : c'est
 * la mesure qui permet de calculer le pourcentage de couverture et son
 * dénominateur. Elle complète `GiteCoverageRepo`, elle ne le remplace pas.
 */
export interface GiteScanRepo {
  /** Enregistre (remplace) l'état d'un gîte pour la passe courante. */
  put(record: GiteScanRecord): Promise<void>;
  /** L'état de tous les gîtes connus. */
  list(): Promise<GiteScanRecord[]>;
}

/** Dépôt de réglages par espace (PW-24) — non persisté dans SQL (limite honnête). */
export interface SettingsRepo {
  get(spaceKey: string): Promise<SpaceSettings>;
  put(settings: SpaceSettings): Promise<void>;
}

/** Le store agrégé : onze dépôts + deux méthodes de confort. */
export interface ForgeStore {
  findings: FindingRepo;
  locations: LocationRepo;
  exposures: ExposureRepo;
  pageScans: PageScanRepo;
  attachmentScans: AttachmentScanRepo;
  ritualSteps: RitualStepRepo;
  purgeRequests: PurgeRequestRepo;
  owners: OwnerResolutionRepo;
  certificates: CertificateRepo;
  cursors: SweepCursorRepo;
  budget: BudgetRepo;
  /** Mesure fine, par élément, cumulée sur la journée (§6). */
  giteCoverage: GiteCoverageRepo;
  /** Mesure par page de la dernière passe (§6, §14) — base du pourcentage. */
  giteScans: GiteScanRepo;
  settings: SettingsRepo;
  /**
   * Écrit un foyer complet : ligne `finding` + lignes `location`. Calcule aussi
   * `primaryPageId` (heuristique d'affichage) et `spaceKey` (depuis l'exposition
   * de la page principale) quand ils manquent.
   */
  saveFoyer(foyer: Foyer): Promise<void>;
  /** Lecture rehydratée : `spaceKey` dérivé de l'exposition de la page principale. */
  getFoyer(id: string): Promise<Foyer | null>;
  listFoyers(query: ListFoyersQuery): Promise<Foyer[]>;
}