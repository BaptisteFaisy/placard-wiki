/**
 * Catalogue de sonde — la liste des points d'accès que l'app teste depuis son
 * identité (`asApp`) pour savoir lesquels **répondent** et lesquels **refusent**.
 *
 * Mesuré le 12 novembre 2026 sur le site réel, en deux temps :
 *
 * 1. **Avant les scopes granulaires** : la recherche CQL répondait 200, tout
 *    le reste renvoyait `401 {"message":"Unauthorized; scope does not match"}`.
 * 2. **Après** : les scopes granulaires (`read:page:confluence`,
 *    `read:comment:confluence`, …) sont accordés — les 401 ont disparu, mais
 *    l'API REST v1 répond désormais `410 Gone` (« This deprecated endpoint
 *    has been removed ») : la lecture directe d'une page n'existe plus sur ce
 *    site. Restent responders : l'API v2 (`/wiki/api/v2/pages/…`) et la
 *    recherche CQL.
 *
 * Chaque chemin porte le scope qu'il exige (voir `confluence-access.ts`) : un
 * refus devient une raison nommée, jamais un « 401 » nu.
 */

/** Un chemin sondé, avec son étiquette et le scope qu'il exige. */
export interface ProbePath {
  /** Libellé français — lisible dans le journal et dans la couverture. */
  label: string;
  /** Chemin relatif interrogé. */
  path: string;
}

/**
 * Les chemins de repli : CQL filtré et API v2, pour les gîtes 2 à 4.
 *
 * Le CQL filtré est la voie la plus large : il passe par le seul scope
 * `search:confluence` et ramène commentaires **et** pièces jointes. C'est ce
 * qui permet de couvrir les gîtes 2 et 3 sans dépendre d'un scope de plus.
 */
export function fallbackProbePaths(pageId: string, spaceKey: string): ProbePath[] {
  const cql = encodeURIComponent(`type = comment and container = ${pageId}`);
  const cqlAttach = encodeURIComponent(`type = attachment and container = ${pageId}`);
  return [
    {
      label: 'commentaires via CQL',
      path: `/wiki/rest/api/content/search?cql=${cql}&expand=body.storage,version&limit=50`,
    },
    {
      label: 'pièces jointes via CQL',
      path: `/wiki/rest/api/content/search?cql=${cqlAttach}&expand=extensions,version&limit=50`,
    },
    {
      label: 'pièces jointes via API v2',
      path: `/wiki/api/v2/pages/${pageId}/attachments`,
    },
    {
      label: 'téléchargement d\'une pièce jointe',
      path: `/wiki/rest/api/content/${pageId}/child/attachment/att4620289/download`,
    },
    {
      label: 'commentaires via API v2',
      path: `/wiki/api/v2/footer-comments?page-id=${pageId}&size=50`,
    },
    {
      label: 'versions via API v2',
      path: `/wiki/api/v2/pages/${pageId}/versions`,
    },
    {
      label: 'corps d\'une version via API v2',
      path: `/wiki/api/v2/pages/${pageId}?version=1&body-format=storage`,
    },
    {
      label: 'description d\'espace via API v2',
      path: `/wiki/api/v2/spaces?keys=${spaceKey}`,
    },
    {
      label: 'modèles via API v2',
      path: `/wiki/api/v2/templates?space-id=${spaceKey}`,
    },
  ];
}

/**
 * Les chemins principaux : lecture directe d'une page, de ses commentaires, de
 * ses pièces jointes et de son historique, plus les deux points d'accès qui
 * répondaient déjà (recherche, restrictions).
 */
export function directProbePaths(pageId: string): ProbePath[] {
  return [
    { label: 'recherche CQL (id)', path: `/wiki/rest/api/content/search?cql=id%3D${pageId}&limit=1` },
    {
      label: 'recherche CQL (id, corps + version)',
      path: `/wiki/rest/api/content/search?cql=id%3D${pageId}&limit=1&expand=body.storage,version`,
    },
    { label: 'page directe', path: `/wiki/rest/api/content/${pageId}` },
    { label: 'page directe (corps)', path: `/wiki/rest/api/content/${pageId}?expand=body.storage` },
    {
      label: 'commentaires directs',
      path: `/wiki/rest/api/content/${pageId}/child/comment?expand=body.storage,version`,
    },
    { label: 'pièces jointes directes', path: `/wiki/rest/api/content/${pageId}/child/attachment` },
    { label: 'versions directes', path: `/wiki/rest/api/content/${pageId}/version` },
    { label: 'restrictions', path: `/wiki/rest/api/content/${pageId}/restriction` },
    { label: 'page via API v2', path: `/wiki/api/v2/pages/${pageId}?body-format=storage` },
  ];
}

/** Tous les chemins sondés : directs d'abord, puis les replis. */
export function allProbePaths(pageId: string, spaceKey: string): ProbePath[] {
  return [...directProbePaths(pageId), ...fallbackProbePaths(pageId, spaceKey)];
}
