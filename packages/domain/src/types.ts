/**
 * Types du domaine « wiki » (cahier des charges §20) : le foyer, ses
 * emplacements, son exposition, l'état du rituel.
 *
 * Règle absolue : aucun de ces types ne porte de valeur brute de secret.
 * Le seul lien avec le secret est l'empreinte HMAC et l'aperçu masqué.
 */

import type {
  ContainerType,
  ContentField,
  FoyerState,
  Gite,
  OwnerMethod,
  SharingState,
  WikiFamily,
} from './vocabulary';

/** Aperçu masqué : famille visible, valeur inutilisable (`AKIA…(20)`). */
export type MaskedPreview = string;

/**
 * Un foyer : une empreinte et son état de réparation. Une empreinte peut
 * vivre dans six pages, deux commentaires, une pièce jointe et un modèle —
 * c'est le même foyer, pas sept trouvailles.
 */
export interface Foyer {
  id: string;
  /** HMAC-SHA-256 du secret, clé propre à l'installation. */
  fingerprint: string;
  family: WikiFamily;
  /** Score de danger 0-100, avec ses termes appliqués. */
  baseScore: number;
  score: number;
  /** Chaque terme appliqué au score, avec sa méthode (§8 : aucun score sans ses termes). */
  scoreTerms: AppliedScoreTerm[];
  state: FoyerState;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Date de l'attestation de rotation (jamais la date de la clé). */
  rotatedAt?: string;
  /** Preuve *attestée* : ticket fournisseur, capture du journal d'audit. */
  rotationEvidenceRef?: string;
  /** Raison écrite du ruban (faux positif écarté) — jamais vide. */
  dismissedReason?: string;
  /** Date de revalidation du ruban. */
  dismissedReviewAt?: string;
  /** Emplacements : le même foyer, N endroits. */
  locations: FoyerLocation[];
  /** Page principale (la plus exposée) — pour l'affichage direct. */
  primaryPageId?: string;
  spaceKey?: string;
}

/** Un terme appliqué au score de danger, toujours affiché avec sa méthode. */
export interface AppliedScoreTerm {
  id: string;
  /** Points appliqués (négatifs pour les malus). */
  points: number;
  /** Libellé affichable (FR/EN gérés par l'écran). */
  label: string;
  /** Comment le terme a été calculé — la méthode, pas la conclusion. */
  method: string;
  /** Élément de preuve (compte, identifiant, date) quand il y en a un. */
  evidence?: string;
}

/** Un emplacement : un endroit précis où l'empreinte est présente. */
export interface FoyerLocation {
  id: string;
  foyerId: string;
  containerType: ContainerType;
  /** ARI Confluence du conteneur (page, version, commentaire, pièce jointe). */
  containerAri: string;
  pageId: string;
  versionNumber?: number;
  field: ContentField;
  charStart?: number;
  charEnd?: number;
  maskedPreview: MaskedPreview;
  detectedAt: string;
  redactedAt?: string;
  /** `vanished` : la page a été supprimée après détection (§24). */
  status: 'present' | 'redacted' | 'vanished';
  /** Le gîte déduit, pour l'affichage (§6) — énumération fermée (contrat live). */
  gite: Gite;
}

/** Fourchette de lecteurs potentiels (§8) — jamais un nombre unique. */
export interface ReadersRange {
  low: number;
  high: number;
  /** La méthode : permissions de l'espace + restrictions + partage. */
  method: string;
  /** Les droits manquants qui font la fourchette large (déclarés, pas masqués). */
  caveats: string[];
}

/** Surface IA : ce qu'un assistant peut atteindre à partir de cette page (§13). */
export interface AiSurface {
  /** Hypothèse conservatrice : présumée indexée si la page est lisible par Rovo. */
  presumedIndexed: boolean;
  /** Toujours affiché comme une hypothèse jusqu'à pouvoir interroger l'index. */
  hypothesis: true;
  method: string;
}

/** L'exposition d'une page : qui peut lire, comment, et jusqu'où va l'IA. */
export interface PageExposure {
  pageId: string;
  spaceKey: string;
  readers: ReadersRange;
  sharing: SharingState;
  /** Restrictions de la page (utilisateurs, groupes). */
  restrictions: Array<{ type: 'user' | 'group' | 'space'; name: string }>;
  aiSurface: AiSurface;
  computedAt: string;
}

/**
 * Attestation de rotation : un fait horodaté posé **par une personne**.
 * Un agent ne peut pas en poser (§17 : `record-rotation` refuse l'agent).
 */
export interface RotationAttestation {
  foyerId: string;
  /** Référence de l'acteur — conservée pour l'audit, ce n'est pas une notation. */
  actorRef: string;
  actorKind: 'human';
  provider: string;
  /** Lien vers la preuve (ticket fournisseur, capture du journal d'audit). */
  evidenceRef: string;
  attestedAt: string;
  /** Force de la preuve : attestée, et c'est tout. */
  strength: 'attested';
}

/** Une demande de purge d'historique, quand l'API ne permet pas de purger (§9). */
export interface PurgeRequest {
  id: string;
  foyerId: string;
  pageId: string;
  versionNumbers: number[];
  requestedAt: string;
  requestedByRef: string;
  state: 'requested' | 'acknowledged' | 'done' | 'refused';
  /** Référence côté administrateur du site. */
  adminRef?: string;
  /** Ce qui bloque, quand c'est impossible : le foyer reste ouvert. */
  blockedReason?: string;
}

/** Résolution du propriétaire d'une page, avec sa méthode affichée (§12). */
export interface OwnerResolution {
  pageId: string;
  ownerRef?: string;
  method: OwnerMethod;
  /** `none` : personne en vue → la page part en file d'adoption. */
  confidence: 'high' | 'medium' | 'none';
  resolvedAt: string;
  /** Pourquoi la résolution a échoué ou est incertaine. */
  caveat?: string;
}

/** Un état du rituel, par étape. */
export interface RitualStepState {
  foyerId: string;
  step: string;
  state: 'pending' | 'locked' | 'done' | 'impossible';
  actorRef?: string;
  attestationRef?: string;
  at?: string;
  /** Pourquoi l'étape est verrouillée ou impossible — toujours écrit. */
  note?: string;
}

/** Le certificat : une page datée et chiffrée, pour un auditeur (§9, §16). */
export interface Certificate {
  id: string;
  scope: string;
  issuedAt: string;
  open: number;
  rotated: number;
  redacted: number;
  purged: number;
  /** Exposition résiduelle, en chiffres (fourchettes quand elles existent). */
  residualExposure: string;
  /** Angles morts déclarés (whiteboards, pièces jointes non lues, droits manquants). */
  blindSpots: string[];
  /** Empreinte du contenu du certificat — intégrité, pas secret. */
  contentHash: string;
}

/** Curseur de reprise d'un balayage (§14). */
export interface SweepCursor {
  scope: string;
  mode: 'incremental' | 'full' | 'on-demand';
  lastPageId?: string;
  lastModifiedAt?: string;
  runAt?: string;
}

/** Le budget de balayage, affiché (§14). */
export interface ScanBudget {
  day: string;
  pagesScanned: number;
  attachmentsRead: number;
  attachmentsSkipped: number;
  llmCalls: number;
  tokens: number;
  costEstimate: number;
  /** Fichiers non lus et pourquoi — la couverture déclarée, jamais masquée. */
  skipped: Array<{ kind: string; reason: string; count: number }>;
  /** Durée de la dernière passe, en millisecondes. */
  lastPassMs?: number;
  /** Couverture partielle déclarée (jamais masquée). */
  coverageNote?: string;
}

/** Résultat d'un scan d'une page : l'empreinte du contenu et ce qu'on a su faire. */
export interface PageScanRecord {
  pageId: string;
  contentHash: string;
  versionScanned: number;
  scannedAt: string;
  detectorsVersion: string;
  llmCalls: number;
  tokens: number;
  skippedReason?: string;
}

/** Résultat d'un scan de pièce jointe : lue, non lue, et pourquoi. */
export interface AttachmentScanRecord {
  attachmentId: string;
  pageId: string;
  filename: string;
  mime: string;
  size: number;
  readState: 'read' | 'not-read' | 'too-large' | 'not-text';
  skippedReason?: string;
  findingsCount: number;
}

/**
 * Verdict « prêt à activer l'IA » (§13, §27). Quatre états, jamais un oui/non :
 * `indéterminé` quand la couverture est inconnue, `refusé` quand activer
 * exposerait trop, `à-nettoyer` quand il reste des foyers à traiter, `prêt`
 * quand rien n'expose plus.
 */
export type AiActivationVerdict = 'prêt' | 'à-nettoyer' | 'refusé' | 'indéterminé';

/** Le verdict et la règle qui l'a produit — affichés ensemble, jamais un verdict nu. */
export interface AiActivationVerdictDetail {
  verdict: AiActivationVerdict;
  /** La règle appliquée, avec ses seuils — auditable, pas une boîte noire. */
  rule: string;
}

/**
 * Couverture du balayage en gîtes (§6, §14) : combien de gîtes couverts, sur
 * combien, et comment le décompte a été fait. `known: false` signifie qu'on
 * ne sait pas ce qu'il reste à balayer → le verdict devient `indéterminé`.
 */
export interface GiteCoverage {
  covered: number;
  total: number;
  /** `false` : couverture inconnue (aucune passe budgétée enregistrée). */
  known: boolean;
  /** La méthode du décompte — affichée, jamais un chiffre nu (§8). */
  method: string;
  /** Gîtes non couverts, déclarés — jamais masqués (§19). */
  uncovered: Gite[];
}

/** Répartition par famille des foyers ouverts (§8). */
export interface AiActivationFamilyAggregate {
  family: WikiFamily;
  count: number;
  maxDanger: number;
}

/** Foyers ouverts : nombre, danger maximal (avec ses termes), familles (§8). */
export interface OpenFoyersSummary {
  count: number;
  maxDanger: number;
  /** Termes appliqués au danger maximal — la méthode, pas la conclusion (§8). */
  maxDangerTerms: AppliedScoreTerm[];
  byFamily: AiActivationFamilyAggregate[];
}

/** Foyers exposés à l'IA : pages présumées lisibles par Rovo (§13). */
export interface AiExposedFoyers {
  count: number;
  /** Hypothèse conservatrice — jamais un recensement exact de l'index Rovo. */
  presumedIndexed: number;
  method: string;
}

/** Exposition résiduelle : fourchette de lecteurs potentiels, avec sa méthode (§8). */
export interface ResidualAiExposure {
  readersLow: number;
  readersHigh: number;
  method: string;
  caveats: string[];
}

/**
 * Le certificat « prêt à activer l'IA » (§13, §27) : ce qu'on s'apprête à
 * donner à lire à l'assistant, chiffré et daté, pour un auditeur. Aucune
 * valeur brute de secret — que des compteurs, fourchettes, méthodes, angles
 * morts et une empreinte d'intégrité.
 */
export interface AiActivationCertificate {
  id: string;
  /** Périmètre : clé d'espace, ou `site`. */
  scope: string;
  issuedAt: string;
  /** Surface IA du périmètre, toujours en hypothèse conservatrice (§13). */
  aiSurface: AiSurface;
  coverage: GiteCoverage;
  openFoyers: OpenFoyersSummary;
  aiExposedFoyers: AiExposedFoyers;
  residualExposure: ResidualAiExposure;
  /** Angles morts déclarés : whiteboards, captures d'écran, droits manquants… */
  blindSpots: string[];
  verdict: AiActivationVerdictDetail;
  /** HMAC-SHA-256 de la charge utile canonique, clé d'installation — jamais journalisée. */
  contentHash: string;
}
