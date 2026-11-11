/**
 * Ports injectables des services Forge.
 *
 * Tout effet de bord (Confluence, graphe, Realtime, Jira, écriture de page,
 * LLM) passe par un port. Le runtime Forge fournit les implémentations réelles
 * (`@forge/api`, `@forge/llm`, `@forge/events`) ; les tests fournissent des
 * fakes déterministes. Aucun service n'importe `@forge/*` directement.
 */

import type { ConfluenceClient } from '@placard-wiki/wiki-source';
import type { CachedOracle, LlmOracle } from '@placard-wiki/detectors';
import type { ClockPort, IdPort, StoragePort } from '@placard-wiki/ritual';
import type {
  Foyer,
  OwnerResolution,
  PageExposure,
} from '@placard-wiki/domain';
import type { ForgeStore } from '../store/ports.js';

/** Source des métadonnées de propriété (§12) — non couverte par wiki-source. */
export interface OwnerSourcePort {
  /** Propriétaire déclaré de la page (cascade 1). */
  declaredOwner(pageId: string): Promise<string | undefined>;
  /** Trois derniers éditeurs, sans classement (cascade 2). */
  lastEditors(pageId: string): Promise<string[]>;
  /** Responsable de l'espace (cascade 3). */
  spaceLead(spaceKey: string): Promise<string | undefined>;
}

/** Teamwork Graph en LECTURE SEULE (§12, cascade 4). */
export interface TeamworkGraphPort {
  /**
   * Équipe propriétaire d'un document via le graphe. Un droit manquant renvoie
   * `confidence: 'none'` avec une `caveat` — jamais un zéro silencieux (§19).
   */
  teamOwner(pageId: string): Promise<Pick<OwnerResolution, 'ownerRef' | 'confidence'> & { caveat?: string }>;
}

/** Bannière Forge Realtime à l'auteur (§9 étape 4, PW-12). */
export interface RealtimePort {
  /**
   * Publie un événement sur un canal ciblé. L'API exacte (canal, ciblage
   * utilisateur) est **à valider semaine 1** (§22) — voir `runtime/realtime.ts`.
   */
  publish(channel: string, payload: Record<string, unknown>): Promise<void>;
}

/** Création d'un ticket Jira de réparation (§9, PW-13). */
export interface JiraPort {
  createIssue(payload: {
    projectKey: string;
    summary: string;
    description: string;
    assignee?: string;
    labels: string[];
    issueType: string;
    priority: string;
  }): Promise<{ key: string; url: string }>;
}

/** Vérification du droit de lecture d'une page (PW-23). */
export interface AccessPort {
  /** L'appelant courant peut-il lire cette page ? */
  canReadPage(pageId: string): Promise<boolean>;
}

/** Acteur courant d'une invocation (humain ou agent). */
export interface ActorContext {
  accountId?: string;
  kind: 'human' | 'agent';
}

/** Tout ce dont les services ont besoin, injecté par le runtime. */
export interface ServiceContext {
  store: ForgeStore;
  confluence: ConfluenceClient;
  hmacKey: string;
  clock: ClockPort;
  ids: IdPort;
  storage: StoragePort;
  oracle: CachedOracle;
  ownerSource: OwnerSourcePort;
  graph: TeamworkGraphPort;
  realtime: RealtimePort;
  jira: JiraPort;
  access: AccessPort;
  /** Acteur courant (humain/agent) — pour les gardes (§17). */
  actor(): ActorContext;
  /** Effectif total du site (plafond d'un partage public) — optionnel. */
  siteUsers?: number;
}

/** Résultat d'un balayage borné (§14). */
export interface SweepResult {
  mode: 'incremental' | 'full' | 'on-demand';
  scope: string;
  pagesScanned: number;
  attachmentsRead: number;
  attachmentsSkipped: number;
  llmCalls: number;
  tokens: number;
  foyersTouched: number;
  /** Curseur de reprise (null si la passe est terminée). */
  nextCursor: string | null;
  done: boolean;
  /** Angles morts et fichiers non lus, avec leur raison (§14, §19). */
  blindSpots: string[];
  startedAt: string;
  durationMs: number;
}

/** Ré-export des types utiles aux services. */
export type { ConfluenceClient, CachedOracle, LlmOracle, ClockPort, IdPort, StoragePort, Foyer, PageExposure };