/**
 * La purge et la vérification sous l'identité de l'app Forge (`asApp`).
 *
 * **Ce que l'API permet vraiment** (mesuré le 12 novembre 2026 sur
 * one-atlas-cndz.atlassian.net) :
 *
 * - `DELETE /wiki/rest/api/content/{id}/version/{n}` répond **204** avec un
 *   jeton d'administrateur : la purge d'une version précise **est possible**.
 * - Mais l'identité de l'app reçoit **401** sur tout le sous-arbre
 *   `/content/{id}/version` (sonde en direct sur l'app déployée : 401 sur
 *   `/wiki/rest/api/content/{id}/version` et sur `/wiki/api/v2/pages/{id}/versions`).
 *   L'app **ne purge donc pas elle-même** : elle produit la demande, elle sait
 *   la vérifier quand un jeton ayant les droits est fourni.
 * - Contrainte de l'API : `1 ≤ n < version courante`, sinon **400**
 *   (« Version N to delete must be less than the current version M… »).
 * - Après une suppression, les versions postérieures sont **renumérotées** :
 *   le plan de purge compense (`planPurgeOrder`).
 *
 * Ce module ne contient aucun secret : il n'utilise que l'identité de l'app,
 * dont les droits sont ceux de l'installation.
 */

import { asApp, assumeTrustedRoute } from '@forge/api';

import type { PurgeClient, PurgeDeleteOutcome, VersionReader, VersionRead } from '@placard-wiki/ritual';

/** Chemin de suppression d'une version précise. */
function deletePath(pageId: string, versionNumber: number): string {
  return `/wiki/rest/api/content/${pageId}/version/${String(versionNumber)}`;
}

/** Chemin de lecture d'une version précise. */
function versionPath(pageId: string, versionNumber: number): string {
  return `/wiki/rest/api/content/${pageId}/version/${String(versionNumber)}?expand=content.body.storage`;
}

/** Chemin de la liste des versions d'une page. */
function versionsPath(pageId: string): string {
  return `/wiki/rest/api/content/${pageId}/version`;
}

/** Raison lisible pour un statut d'API, sans corps brut (le corps peut contenir des détails). */
function statusReason(status: number): string {
  if (status === 401) return 'identité de l’app non autorisée sur l’historique (HTTP 401)';
  if (status === 403) return 'droits insuffisants pour l’historique (HTTP 403)';
  if (status === 404) return 'version introuvable (HTTP 404)';
  if (status === 405) return 'méthode non supportée par l’API d’historique (HTTP 405)';
  return `l’API a refusé la suppression (HTTP ${String(status)})`;
}

/**
 * Le client de purge de l'app. Il **sonde** d'abord ses droits : l'app ne
 * prétend pas pouvoir purger quand elle ne le peut pas (§9).
 */
export function appPurgeClient(): PurgeClient {
  return {
    async probe() {
      try {
        const response = await asApp().requestConfluence(assumeTrustedRoute(versionsPath('0')));
        if (response.status === 401 || response.status === 403) {
          return {
            canPurge: false,
            reason:
              'L’identité de l’app n’a pas les droits sur l’historique des pages (HTTP ' +
              `${String(response.status)}) : la purge est impossible depuis l’app, ` +
              'elle passe par une demande à l’administrateur du site.',
          };
        }
        return { canPurge: true, reason: 'L’identité de l’app accède à l’historique des pages.' };
      } catch (error) {
        return { canPurge: false, reason: `L’identité de l’app ne peut pas joindre l’historique : ${String(error)}` };
      }
    },
    async deleteVersion(pageId: string, versionNumber: number) {
      try {
        const response = await asApp().requestConfluence(assumeTrustedRoute(deletePath(pageId, versionNumber)), {
          method: 'DELETE',
        });
        if (response.status === 204) return { ok: true, status: 204 };
        const outcome: PurgeDeleteOutcome = {
          ok: false,
          status: response.status,
          reason: statusReason(response.status),
        };
        return outcome;
      } catch (error) {
        return { ok: false, status: -1, reason: `La suppression a échoué : ${String(error)}` };
      }
    },
  };
}

/** Le lecteur de versions de l'app : lit, liste, et sait dire « illisible ». */
export function appVersionReader(): VersionReader {
  return {
    async readVersion(pageId: string, versionNumber: number): Promise<VersionRead> {
      try {
        const response = await asApp().requestConfluence(assumeTrustedRoute(versionPath(pageId, versionNumber)));
        if (response.status === 404) return { kind: 'absent' };
        if (response.status === 401 || response.status === 403) {
          return {
            kind: 'unreadable',
            status: response.status,
            reason: statusReason(response.status),
          };
        }
        if (!response.ok) {
          return { kind: 'unreadable', status: response.status, reason: statusReason(response.status) };
        }
        const payload = (await response.json()) as { content?: { body?: { storage?: { value?: string } } } };
        const body = payload.content?.body?.storage?.value ?? '';
        return { kind: 'found', body };
      } catch (error) {
        return { kind: 'unreadable', status: -1, reason: `Lecture impossible : ${String(error)}` };
      }
    },
    async listVersionNumbers(pageId: string): Promise<number[]> {
      try {
        const response = await asApp().requestConfluence(assumeTrustedRoute(versionsPath(pageId)));
        if (!response.ok) return [];
        const payload = (await response.json()) as { results?: Array<{ number?: number }> };
        return (payload.results ?? [])
          .map((version) => version.number)
          .filter((number): number is number => typeof number === 'number');
      } catch {
        return [];
      }
    },
  };
}
