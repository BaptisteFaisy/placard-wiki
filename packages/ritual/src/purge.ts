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
 */

import type { Foyer, PurgeRequest } from '@placard-wiki/domain';
import type { FoyerState } from '@placard-wiki/domain';

import type { ClockPort, IdPort } from './ports.js';

/** Une page et ses versions à purger — la liste exacte, rien d'autre. */
export interface PurgeTarget {
  pageId: string;
  versionNumbers: number[];
}

export interface PurgeHistoryParams {
  requestedByRef: string;
  clock: ClockPort;
  ids: IdPort;
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
  "L'API Confluence ne permet pas de supprimer des versions de page : " +
  "l'historique reste lisible. Une demande groupée part à l'administrateur du site.";
export const BLOCKED_NO_RIGHTS =
  "La purge d'historique exige les droits d'administrateur du site, qui manquent " +
  "à ce compte. Une demande groupée part à l'administrateur du site.";
export const BLOCKED_NO_VERSIONS =
  'Aucune version à purger n’a été listée : la demande serait vide, elle n’est pas créée.';

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
    const blockedReason = !apiCanPurge
      ? BLOCKED_NO_API
      : !adminRights
        ? BLOCKED_NO_RIGHTS
        : BLOCKED_NO_VERSIONS;
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
