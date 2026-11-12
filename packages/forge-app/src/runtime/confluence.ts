/**
 * Client Confluence du runtime Forge (§21).
 *
 * Mesuré le 12 novembre 2026 sur le site réel, avec l'identité de l'app
 * (`asApp`) : **seul le point d'accès de recherche répond 200**. Tous les
 * points d'accès directs de contenu renvoient 401, en v1 comme en v2 :
 *
 *   200  /wiki/rest/api/content/search?cql=id%3D…&expand=body.storage,version
 *   401  /wiki/rest/api/content/{id}            (v1)
 *   401  /wiki/rest/api/content/{id}/version    (v1)
 *   401  /wiki/rest/api/content/{id}/child/comment
 *   401  /wiki/rest/api/content/{id}/child/attachment
 *   401  /wiki/api/v2/pages/{id}                (v2)
 *   200  /wiki/rest/api/content/{id}/restriction
 *
 * Conséquence : la **page** (corps, titre, version, étiquettes) est lue par la
 * recherche (`cql = id = …`), qui répond 200 avec `expand`. Les autres gîtes
 * (commentaires, pièces jointes, historique) restent hors de portée de
 * l'identité de l'app : ils sont **déclarés** comme angles morts par le
 * balayage, jamais passés sous silence (§19, §24).
 *
 * Les chemins du paquet `wiki-source` restent inchangés : c'est l'adaptateur
 * du runtime qui choisit le chemin qui répond.
 */

import { asApp, assumeTrustedRoute } from '@forge/api';
import { createConfluenceClient, cqlQuote } from '@placard-wiki/wiki-source';
import type {
  ConfluenceClient, ConfluencePage, ResponseLike,
} from '@placard-wiki/wiki-source';

/** Fetch Forge : la seule sortie réseau du runtime. */
async function forgeFetch(url: string): Promise<ResponseLike> {
  const response = await asApp().requestConfluence(assumeTrustedRoute(url));
  return {
    status: response.status,
    ok: response.ok,
    json: () => response.json(),
    text: () => response.text(),
  };
}

/** Extrait un objet d'une réponse brute (jamais `undefined` en sortie). */
function obj(raw: unknown, key: string): Record<string, unknown> {
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Clé de l'espace d'une page. La recherche rend `space` soit comme un objet
 * (`{ key, name }`), soit comme un lien (`/rest/api/space/MSD`) : les deux
 * formes sont lues, sinon les foyers seraient sans espace (§10).
 */
function spaceKeyOf(raw: Record<string, unknown>): string {
  const space = raw['space'];
  if (typeof space === 'object' && space !== null) {
    const key = (space as Record<string, unknown>)['key'];
    if (typeof key === 'string') return key;
  }
  if (typeof space === 'string') {
    const parts = space.split('/');
    return parts[parts.length - 1] ?? '';
  }
  return '';
}

/** Ligne de recherche → page typée (corps storage, version, étiquettes). */
function toPage(raw: Record<string, unknown>, pageId: string): ConfluencePage {
  const version = obj(raw, 'version');
  const body = obj(obj(raw, 'body'), 'storage');
  const labels = obj(obj(obj(raw, 'metadata'), 'labels'), 'results');
  return {
    id: pageId,
    title: typeof raw['title'] === 'string' ? raw['title'] : '',
    spaceKey: spaceKeyOf(raw),
    versionNumber: Number(version['number'] ?? 1),
    bodyStorage: typeof body['value'] === 'string' ? body['value'] : '',
    labels: Object.values(labels).map((l) => String(obj(l, 'name')['name'] ?? '')),
    lastModifiedAt: typeof version['when'] === 'string' ? version['when'] : '',
  };
}

/**
 * Lit une page par la recherche — le seul chemin qui répond 200 pour
 * l'identité de l'app (mesuré le 12 novembre 2026).
 */
async function getPageBySearch(pageId: string): Promise<ConfluencePage> {
  const cql = `id = ${cqlQuote(pageId)}`;
  const url = `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=1`
    + '&expand=body.storage,version,metadata.labels,space';
  const response = await forgeFetch(url);
  if (!response.ok) throw new Error(`Confluence HTTP ${String(response.status)} sur ${url}`);
  const body = (await response.json()) as { results?: unknown[] };
  const row = body.results?.[0];
  if (row === undefined) throw new Error(`page ${pageId} introuvable par la recherche Confluence`);
  return toPage(row as Record<string, unknown>, pageId);
}

/**
 * Fabrique le client Confluence du runtime : le client du paquet, avec la
 * lecture de page redirigée vers la recherche.
 */
export function createForgeConfluence(): ConfluenceClient {
  const base = createConfluenceClient((async (url: string) => forgeFetch(url)) as never, '', '');
  return {
    ...base,
    getPage: (pageId: string) => getPageBySearch(pageId),
  };
}
