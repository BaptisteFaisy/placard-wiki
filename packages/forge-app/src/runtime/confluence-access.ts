/**
 * Droits d'accès Confluence — la table qui relie un point d'accès au scope
 * qu'il exige, et le relevé des scopes réellement accordés.
 *
 * ⚠ Mesuré le 12 novembre 2026 sur le site réel (one-atlas-cndz.atlassian.net)
 * avec l'identité de l'app (`asApp`) :
 *
 *   200  /wiki/rest/api/content/search?cql=…      → scope `search:confluence`
 *   200  /wiki/rest/api/content/{id}/restriction    → scope `read:content.restriction:confluence`
 *   401  /wiki/rest/api/content/{id}                → scope `read:page:confluence`
 *   401  /wiki/rest/api/content/{id}/child/comment  → scope `read:comment:confluence`
 *   401  /wiki/rest/api/content/{id}/child/attachment→ scope `read:attachment:confluence` + page
 *   401  /wiki/rest/api/content/{id}/version        → scope `read:page:confluence`
 *   401  /wiki/api/v2/pages/{id}                    → scope `read:page:confluence`
 *
 * Les deux seuls points d'accès qui répondent sont **exactement** les deux
 * dont le scope dédié est dans le relevé des scopes accordés : les 401 ne
 * sont donc pas un défaut de chemin ni un en-tête manquant, mais des **scopes
 * granulaires non accordés** par l'administrateur du site. Le même chemin
 * répond 200 avec l'identité administrative (vérifié en REST direct).
 *
 * Le relevé ci-dessous est un **constat daté**, pas une couverture : il dit ce
 * qui était accordé au moment de la mesure. Il sert à formuler une raison
 * précise (« scope X non accordé ») plutôt qu'un « 401 » nu.
 */

import type { Gite } from '@placard-wiki/domain';

/** Un point d'accès sondé : chemin, libellé, scope attendu, gîte concerné. */
export interface AccessCase {
  /** Identifiant stable (trié, comparé dans les tests). */
  id: string;
  /** Libellé français du point d'accès. */
  label: string;
  /** Chemin relatif interrogé (jamais d'URL absolue). */
  path: string;
  /** Scope Confluence exigé par ce chemin (nom Atlassian exact). */
  scope: string;
  /** Gîte du cahier (§6) que ce chemin permet de lire, si aucun. */
  gite?: Gite;
}

/**
 * Scopes accordés aux installations (dev et production) au 12 novembre 2026.
 *
 * Relevé via `forge install list --verbose` (GraphQL `ecosystem.appInstallationsByApp`
 * → `appEnvironmentVersion.permissions.scopes`). Source de vérité : la
 * plateforme, pas le manifeste — c'est la différence entre « demandé » et
 * « accordé ».
 *
 * ⚠ Relevé **après** le correctif : les scopes granulaires par type d'objet
 * (`read:page:confluence`, `read:comment:confluence`, …) y figurent. Avant le
 * correctif, seuls les scopes agrégats et deux scopes granulaires étaient
 * accordés — d'où les 401 « scope does not match ».
 */
export const GRANTED_SCOPES: readonly string[] = [
  'read:confluence-content.all',
  'search:confluence',
  'read:confluence-user',
  'write:confluence-content',
  'read:content:confluence',
  'read:attachment:confluence',
  'read:space:confluence',
  'read:space.permission:confluence',
  'read:content.restriction:confluence',
  'read:template:confluence',
  'read:page:confluence',
  'read:comment:confluence',
  'read:blogpost:confluence',
  'read:custom-content:confluence',
  'read:database:confluence',
  'read:hierarchical-content:confluence',
  'read:content-details:confluence',
  'read:space-details:confluence',
  'read:label:confluence',
  'read:permission:confluence',
  'read:group:confluence',
  'read:user:confluence',
  'read:relation:confluence',
  'read:watcher:confluence',
  'read:task:confluence',
  'read:inlinetask:confluence',
  'read:embed:confluence',
  'read:folder:confluence',
  'read:slide:confluence',
  'read:whiteboard:confluence',
  'read:space.property:confluence',
  'read:content.property:confluence',
  'read:space.setting:confluence',
  'read:app-data:confluence',
  'read:configuration:confluence',
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'read:graph:page:confluence',
  'read:graph:project:atlassian',
  'read:graph:space:confluence',
  'storage:app',
];

/**
 * Règle de correspondance chemin → scope exigé.
 *
 * L'ordre compte : la première règle qui matche gagne. Les règles sont
 * volontairement larges sur le chemin et exactes sur le scope — le scope
 * d'un point d'accès ne dépend pas de l'identifiant de la page.
 */
const SCOPE_RULES: ReadonlyArray<{ match: RegExp; scope: string }> = [
  { match: /\/content\/search/, scope: 'search:confluence' },
  { match: /\/content\/[^/]+\/restriction/, scope: 'read:content.restriction:confluence' },
  { match: /\/content\/[^/]+\/child\/comment/, scope: 'read:comment:confluence' },
  { match: /\/content\/[^/]+\/child\/attachment/, scope: 'read:attachment:confluence' },
  { match: /\/content\/[^/]+\/version/, scope: 'read:page:confluence' },
  { match: /\/content\/[^/]+\/download/, scope: 'read:attachment:confluence' },
  { match: /\/api\/v2\/pages\/[^/]+\/comments/, scope: 'read:comment:confluence' },
  { match: /\/api\/v2\/pages\/[^/]+\/attachments/, scope: 'read:attachment:confluence' },
  { match: /\/api\/v2\/pages\/[^/]+\/versions/, scope: 'read:page:confluence' },
  { match: /\/api\/v2\/pages\/[^/]+/, scope: 'read:page:confluence' },
  { match: /\/api\/v2\/comments\/[^/]+/, scope: 'read:comment:confluence' },
  { match: /\/api\/v2\/attachments\/[^/]+/, scope: 'read:attachment:confluence' },
  { match: /\/api\/v2\/spaces\/[^/]+/, scope: 'read:space:confluence' },
  { match: /\/api\/v2\/templates/, scope: 'read:template:confluence' },
  { match: /\/rest\/api\/space\/[^/]+/, scope: 'read:space:confluence' },
  { match: /\/rest\/api\/content\/[^/]+/, scope: 'read:page:confluence' },
];

/** Scope exigé par un chemin (jamais `undefined` : le défaut est la lecture). */
export function scopeForPath(path: string): string {
  for (const rule of SCOPE_RULES) {
    if (rule.match.test(path)) return rule.scope;
  }
  return 'read:confluence-content.all';
}

/** Un scope est-il dans le relevé des scopes accordés ? */
export function isGranted(scope: string): boolean {
  return GRANTED_SCOPES.includes(scope);
}

/**
 * Raison précise d'un refus, en français (§19 : « pas de droit » se distingue
 * de « pas de données »). Le scope exigé est nommé, et l'on dit QUI peut
 * l'accorder — l'administrateur du site.
 */
export function denyReason(path: string, status: number): string {
  const scope = scopeForPath(path);
  if (status === 401 || status === 403) {
    return `${String(status)} sur ${path} : scope ${scope} non accordé par l'administrateur du site `
      + '(droit manquant — l\'identité de l\'app n\'a pas ce que l\'identité administrative a)';
  }
  if (status === 404) {
    return `404 sur ${path} : le point d'accès n'existe pas sur ce site (chemin à revoir, pas un droit manquant)`;
  }
  return `${String(status)} sur ${path} : appel refusé par Confluence (ni droit manquant, ni absence de données)`;
}
