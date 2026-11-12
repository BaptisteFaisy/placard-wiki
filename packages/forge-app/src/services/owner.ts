/**
 * Résolution de propriétaire (§12, PW-14) — cascade avec méthode affichée.
 *
 *  1. propriétaire déclaré de la page ;
 *  2. trois derniers éditeurs (sans classement) ;
 *  3. responsable de l'espace ;
 *  4. Teamwork Graph en LECTURE SEULE (port injectable) — un droit manquant
 *     renvoie une `caveat`, jamais un zéro silencieux (§19) ;
 *  5. sinon : file d'adoption (confiance `none`).
 *
 * L'app ne fournit jamais de connecteur au graphe : ingérer des secrets ou des
 * données personnelles dans le graphe est interdit (§12).
 */

import type { OwnerResolution } from '@placard-wiki/domain';
import type { ServiceContext } from './ports';

/** Demande d'accès au graphe documentée, à valider (§12, §22). */
export const GRAPH_ACCESS_NOTE =
  'Teamwork Graph interrogé en lecture seule (read:graph:page:confluence, ' +
  'read:graph:project:atlassian, read:graph:space:confluence) au nom d’un ' +
  'utilisateur connecté — un droit par type d’objet (§12, §22).';

/**
 * Caveat d'un droit manquant sur le graphe (§19) : « pas de droit » n'est pas
 * « pas de données ». Produit par le port réel comme par les tests.
 */
export const GRAPH_MISSING_RIGHT_CAVEAT =
  'Droit manquant sur le Teamwork Graph (§19) : « pas de droit » ≠ « pas de données ».';

/** Construit une résolution (horodatée par le port `clock`). */
function resolution(
  pageId: string,
  method: OwnerResolution['method'],
  confidence: OwnerResolution['confidence'],
  at: string,
  ownerRef?: string,
  caveat?: string,
): OwnerResolution {
  const out: OwnerResolution = { pageId, method, confidence, resolvedAt: at };
  if (ownerRef !== undefined) out.ownerRef = ownerRef;
  if (caveat !== undefined) out.caveat = caveat;
  return out;
}

/** Cascade 1-3 : propriétaire déclaré, derniers éditeurs, responsable d'espace. */
async function localCascade(
  ctx: ServiceContext,
  pageId: string,
  spaceKey: string,
  at: string,
): Promise<OwnerResolution | null> {
  const declared = await ctx.ownerSource.declaredOwner(pageId);
  if (declared !== undefined) {
    return resolution(pageId, 'declared-owner', 'high', at, declared);
  }
  const editors = await ctx.ownerSource.lastEditors(pageId);
  if (editors.length > 0) {
    return resolution(pageId, 'last-editors', 'medium', at, editors[0],
      'Trois derniers éditeurs retenus sans classement (§12) : aucun n’est « le » propriétaire.');
  }
  if (spaceKey !== '') {
    const lead = await ctx.ownerSource.spaceLead(spaceKey);
    if (lead !== undefined) return resolution(pageId, 'space-lead', 'medium', at, lead);
  }
  return null;
}

/**
 * Résout le propriétaire d'une page et persiste la résolution. La méthode est
 * toujours affichée ; en cas d'échec, la page part en file d'adoption.
 */
export async function resolveOwner(
  ctx: ServiceContext,
  pageId: string,
  spaceKey: string,
): Promise<OwnerResolution> {
  const at = ctx.clock.now();
  const local = await localCascade(ctx, pageId, spaceKey, at);
  if (local !== null) {
    await ctx.store.owners.put(local);
    return local;
  }
  const graph = await ctx.graph.teamOwner(pageId);
  if (graph.ownerRef !== undefined && graph.confidence !== 'none') {
    const res = resolution(pageId, 'teamwork-graph', graph.confidence, at, graph.ownerRef,
      graph.caveat ?? GRAPH_ACCESS_NOTE);
    await ctx.store.owners.put(res);
    return res;
  }
  const adoption = resolution(pageId, 'adoption-queue', 'none', at, undefined,
    graph.caveat ?? 'Aucun propriétaire en vue : la page part en file d’adoption (§12).');
  await ctx.store.owners.put(adoption);
  return adoption;
}