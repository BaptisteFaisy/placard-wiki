/**
 * Étape 3 du rituel (§9) : la purge d'historique — **l'étape honnête**.
 *
 * Deux issues, affichées sans détour :
 * - l'API le permet et les droits d'administrateur sont là → l'app liste les
 *   versions concernées, page par page, et crée les demandes exactes
 *   (`PurgeRequest` : page, numéros de version, foyer/empreinte) ;
 * - l'API ne le permet pas, ou les droits manquent → `blockedReason` écrit,
 *   demande **groupée** à l'administrateur du site avec la liste exacte
 *   (page, numéro de version, empreinte), et **le foyer reste ouvert** :
 *   son exposition reste élevée (recette §25.10). Dire « on ne peut pas »
 *   fait partie du produit (§5 : jamais prétendre avoir effacé l'historique).
 *
 * Réemploi : `@placard/ritual` (Git) refuse de réécrire l'historique lui-même
 * (PLA-F-24) et produit un script à exécuter ; ici, même honnêteté adaptée à
 * Confluence — l'app ne purge jamais elle-même, elle produit la demande.
 *
 * **Ce que l'API permet vraiment** (mesuré le 12 novembre 2026 sur
 * one-atlas-cndz.atlassian.net, espace PLACARDDEMO) :
 *
 * - `DELETE /wiki/rest/api/content/{id}/version/{n}` → **204** : la purge d'une
 *   version précise **est possible** — mais avec un jeton d'administrateur.
 * - Contrainte : `1 ≤ n < version courante`. Sinon **400** :
 *   « Version N to delete must be less than the current version M and greater
 *   than or equal to 1. » (le champ `data.authorized` vaut alors `false`).
 * - **Renumérotation** : les versions postérieures à celle supprimée sont
 *   renumérotées. D'où `planPurgeOrder`, qui compense.
 * - `DELETE /wiki/rest/api/content/{id}/version` (toutes) → **405** ; les
 *   points d'accès v2 (`/wiki/api/v2/pages/{id}/versions[/{n}]`) → **405**.
 * - Aucun point d'accès de **restauration** : `POST …/version/{n}` → 405,
 *   `PUT …/version/{n}` → 405, `POST …/version/{n}/restore` → 404. Une version
 *   purgée est **définitivement** perdue.
 * - L'identité de l'app Forge (`asApp`) reçoit **401** sur tout le sous-arbre
 *   `/content/{id}/version` (sonde en direct sur l'app déployée) : l'app ne
 *   purge donc pas elle-même, elle produit la demande — et sait maintenant la
 *   **vérifier** quand un jeton ayant les droits est fourni.
 */

import type { Foyer, PurgeRequest } from '@placard-wiki/domain';
import type { FoyerState } from '@placard-wiki/domain';

import type { ClockPort, IdPort } from './ports';

/** Une page et ses versions à purger — la liste exacte, rien d'autre. */
export interface PurgeTarget {
  pageId: string;
  versionNumbers: number[];
}

export interface PurgeHistoryParams {
  requestedByRef: string;
  clock: ClockPort;
  ids: IdPort;
  /**
   * Raison d'impossibilité **mesurée**, quand elle est connue (par exemple le
   * statut exact de l'API). Elle remplace le libellé générique.
   */
  blockedReason?: string;
}

export type PurgeOutcome =
  | {
      possible: true;
      apiCanPurge: true;
      requests: PurgeRequest[];
      foyerState: FoyerState;
    }
  | {
      possible: false;
      apiCanPurge: boolean;
      requests: PurgeRequest[];
      foyerState: FoyerState;
      /** Ce qui bloque — toujours écrit (domaine : `blockedReason`). */
      blockedReason: string;
      /** La demande groupée à l'administrateur du site (§9). */
      adminBrief: string;
    };

/** Raisons écrites d'impossibilité — jamais de blocage silencieux. */
export const BLOCKED_NO_API =
  "L'API Confluence ne permet pas de supprimer des versions de page à cette identité : " +
  "l'historique reste lisible. Une demande groupée part à l'administrateur du site.";
export const BLOCKED_NO_RIGHTS =
  "L'API Confluence permet de supprimer une version précise (mesuré : HTTP 204), mais " +
  "cette identité n'a pas les droits sur l'historique (mesuré : HTTP 401). Une demande " +
  'groupée part à l’administrateur du site.';
export const BLOCKED_NO_VERSIONS =
  'Aucune version à purger n’a été listée : la demande serait vide, elle n’est pas créée.';

/** L'app n'a aucun port de purge : elle ne peut ni purger ni vérifier. */
export const NO_PURGE_CLIENT_REASON =
  "L'app n'a aucun moyen de joindre l'historique des pages : la purge passe par une " +
  'demande à l’administrateur du site, et la vérification devra être faite avec ses droits.';

/** Le foyer reste-t-il ouvert (exposition non refermée) dans cet état ? */
export function foyerResteOuvert(state: FoyerState): boolean {
  return state !== 'purged' && state !== 'sealed';
}

/**
 * La demande groupée à l'administrateur : une seule lettre, la liste exacte
 * (page, numéro de version, empreinte) — l'empreinte HMAC, jamais la valeur.
 */
export function adminPurgeBrief(foyer: Foyer, versions: readonly PurgeTarget[], blockedReason: string): string {
  const lines = versions
    .filter((target) => target.versionNumbers.length > 0)
    .flatMap((target) =>
      target.versionNumbers.map(
        (versionNumber) => `- page ${target.pageId}, version ${String(versionNumber)}, empreinte ${foyer.fingerprint}`,
      ),
    );
  return [
    'Demande groupée de purge d’historique (Placard du wiki, §9).',
    '',
    `Foyer ${foyer.id} (famille ${foyer.family}, danger ${String(foyer.score)}).`,
    `Motif du blocage : ${blockedReason}`,
    '',
    'Liste exacte des versions encore lisibles :',
    ...lines,
    '',
    'Tant que ces versions n’ont pas été purgées et vérifiées, le foyer reste ouvert',
    'et son exposition reste élevée. Aucune valeur brute ne figure dans cette demande.',
  ].join('\n');
}

function makeRequest(
  foyer: Foyer,
  target: PurgeTarget,
  blockedReason: string | undefined,
  params: PurgeHistoryParams,
): PurgeRequest {
  const request: PurgeRequest = {
    id: params.ids.next('purge'),
    foyerId: foyer.id,
    pageId: target.pageId,
    versionNumbers: [...target.versionNumbers],
    requestedAt: params.clock.now(),
    requestedByRef: params.requestedByRef,
    state: 'requested',
  };
  if (blockedReason !== undefined) request.blockedReason = blockedReason;
  return request;
}

/**
 * Le plan de purge : dans quel ordre supprimer les versions, et sous quels
 * numéros **après** les suppressions précédentes.
 *
 * Mesuré le 12 novembre 2026 sur le site réel : après la suppression de la
 * version `n`, **toutes les versions postérieures sont renumérotées** (mesuré :
 * `[1,2,3,4]`, purge de la 2 → `[1,2,3]`, la 2 porte l'ancien contenu de la 3).
 * Le numéro de version n'est donc pas un identifiant stable. Pour purger une
 * liste de versions, on supprime **du plus ancien au plus récent** et on
 * compense le décalage : le i-ième numéro (rangé croissant, à partir de 0)
 * devient `numéro - i`.
 */
export function planPurgeOrder(versionNumbers: readonly number[]): number[] {
  const sorted = [...new Set(versionNumbers)]
    .filter((number) => Number.isInteger(number) && number >= 1)
    .sort((a, b) => a - b);
  return sorted.map((number, index) => number - index);
}

/** Ce que la suppression d'une version a donné. */
export type PurgeDeleteOutcome =
  | { ok: true; status: number }
  | { ok: false; status: number; reason: string };

/** Client injectable capable de supprimer une version d'historique. */
export interface PurgeClient {
  /**
   * Supprime une version précise. Mesuré : `n` doit être `≥ 1` et **strictement
   * inférieur** à la version courante, sinon l'API répond 400.
   */
  deleteVersion(pageId: string, versionNumber: number): Promise<PurgeDeleteOutcome>;
  /**
   * Ce que l'identité courante peut faire. Mesuré : l'identité de l'app Forge
   * reçoit 401 sur tout le sous-arbre `/content/{id}/version` ; un jeton
   * d'administrateur réussit (204).
   */
  probe(): Promise<{ canPurge: boolean; reason: string }>;
}

/** Une suppression refusée, avec son statut et sa raison exacte. */
export interface PurgeFailure {
  versionNumber: number;
  status: number;
  reason: string;
}

/** Le résultat d'une exécution de purge. */
export interface PurgeExecution {
  /** Nombre de versions visées. */
  attempted: number;
  /** Nombre de versions réellement supprimées. */
  deleted: number;
  /** Les suppressions refusées, avec le statut exact de l'API. */
  failures: PurgeFailure[];
  /** La purge a-t-elle réussi pour toutes les versions visées ? */
  complete: boolean;
}

/**
 * Exécute la purge d'une liste de versions, dans l'ordre compensé. Pure côté
 * logique : l'effet de bord passe par le client injectable.
 */
export async function executePurge(
  pageId: string,
  versionNumbers: readonly number[],
  client: PurgeClient,
): Promise<PurgeExecution> {
  const plan = planPurgeOrder(versionNumbers);
  const failures: PurgeFailure[] = [];
  let deleted = 0;
  for (const versionNumber of plan) {
    const outcome = await client.deleteVersion(pageId, versionNumber);
    if (outcome.ok) {
      deleted += 1;
    } else {
      failures.push({ versionNumber, status: outcome.status, reason: outcome.reason });
    }
  }
  return {
    attempted: plan.length,
    deleted,
    failures,
    complete: plan.length > 0 && failures.length === 0 && deleted === plan.length,
  };
}

/**
 * Conduit l'étape 3 : demandes exactes si la purge est possible, sinon
 * impossibilité déclarée avec demande groupée — le foyer reste ouvert.
 */
export function purgeHistory(
  foyer: Foyer,
  versions: readonly PurgeTarget[],
  apiCanPurge: boolean,
  adminRights: boolean,
  params: PurgeHistoryParams,
): PurgeOutcome {
  const listed = versions.filter((target) => target.versionNumbers.length > 0);
  if (!apiCanPurge || !adminRights || listed.length === 0) {
    const blockedReason = params.blockedReason ?? (!apiCanPurge
      ? BLOCKED_NO_API
      : !adminRights
        ? BLOCKED_NO_RIGHTS
        : BLOCKED_NO_VERSIONS);
    return {
      possible: false,
      apiCanPurge,
      requests: listed.map((target) => makeRequest(foyer, target, blockedReason, params)),
      // §25.10 : le foyer reste ouvert — jamais « purgé » sans purge vérifiée.
      foyerState: 'purge-impossible',
      blockedReason,
      adminBrief: adminPurgeBrief(foyer, versions, blockedReason),
    };
  }
  return {
    possible: true,
    apiCanPurge: true,
    requests: listed.map((target) => makeRequest(foyer, target, undefined, params)),
    foyerState: 'purge-requested',
  };
}
