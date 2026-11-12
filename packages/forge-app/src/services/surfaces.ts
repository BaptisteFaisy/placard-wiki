/**
 * Le registre multi-surfaces côté service (PW-31).
 *
 * Deux responsibilities :
 *
 *  1. **enregistrer** une observation — « l'empreinte a été vue sur cette
 *     surface, à cet endroit ». Le wiki lui-même est une surface : chaque
 *     foyerBalayé y laisse une observation par emplacement ;
 *  2. **relire** les observations d'une empreinte pour l'outil MCP
 *     `trace-fingerprint`, qui rend ainsi les emplacements **du site** et les
 *     **surfaces externes** (Git, Jira…) d'un même secret.
 *
 * Règle absolue : une observation porte une empreinte, un identifiant
 * d'emplacement et une étiquette lisible — **jamais** de valeur brute (§23).
 */

import { SURFACE_LABELS, matchAcrossSurfaces } from '@placard-wiki/surfaces';
import type { SurfaceKind, SurfaceMatch, SurfaceSeen, SurfaceState } from '@placard-wiki/surfaces';

import type { ServiceContext } from './ports';
import type { Foyer } from '@placard-wiki/domain';

/** Ce que l'outil MCP rend d'une surface — lisible, jamais une valeur. */
export interface SurfaceView {
  /** La surface (son étiquette lisible est dans `surfaceLabel`). */
  surface: SurfaceKind;
  /** L'étiquette lisible de la surface (« Git », « Jira »…). */
  surfaceLabel: string;
  /** L'identifiant de l'emplacement chez la surface. */
  externalId: string;
  /** L'étiquette lisible de l'emplacement. */
  label: string;
  /** L'état de l'observation. */
  state: SurfaceState;
  /** La méthode : comment l'observation a été obtenue. */
  method: string;
  /** La source : d'où viennent les données. */
  source: string;
  /** Le namespace sous lequel l'empreinte a été calculée. */
  namespaceId: string;
  /** Le foyer wiki correspondant, quand il existe. */
  foyerId?: string;
  /** Première observation. */
  firstSeenAt: string;
  /** Dernière observation. */
  lastSeenAt: string;
}

/** Ce qu'on demande à enregistrer. */
export interface SurfaceInput {
  /** L'empreinte observée. */
  fingerprint: string;
  /** La surface. */
  surface: SurfaceKind;
  /** L'emplacement chez la surface. */
  externalId: string;
  /** L'étiquette lisible de l'emplacement. */
  label: string;
  /** La méthode de détection. */
  method: string;
  /** La source des données. */
  source: string;
  /** L'état (défaut : `detecte`). */
  state?: SurfaceState;
  /** Le foyer wiki correspondant, quand il existe. */
  foyerId?: string;
}

/** La vue d'une observation. */
function viewOf(seen: SurfaceSeen): SurfaceView {
  return {
    surface: seen.surface,
    surfaceLabel: SURFACE_LABELS[seen.surface],
    externalId: seen.externalId,
    label: seen.label,
    state: seen.state,
    method: seen.method,
    source: seen.source,
    namespaceId: seen.namespaceId,
    ...(seen.foyerId !== undefined ? { foyerId: seen.foyerId } : {}),
    firstSeenAt: seen.firstSeenAt,
    lastSeenAt: seen.lastSeenAt,
  };
}

/**
 * Enregistre une observation de surface.
 *
 * L'horodatage vient de l'horloge du contexte (`ctx.clock`) : les tests sont
 * déterministes, et la production reste truthful sur « vu la première fois ».
 */
export async function recordSurfaceSeen(ctx: ServiceContext, input: SurfaceInput): Promise<SurfaceSeen> {
  const now = ctx.clock.now();
  const seen: SurfaceSeen = {
    fingerprint: input.fingerprint,
    surface: input.surface,
    externalId: input.externalId,
    label: input.label,
    namespaceId: ctx.namespace.id,
    ...(input.foyerId !== undefined ? { foyerId: input.foyerId } : {}),
    state: input.state ?? 'detecte',
    method: input.method,
    source: input.source,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  await ctx.surfaces.record(seen);
  return seen;
}

/**
 * Enregistre le wiki comme surface : les pages où le foyer a été trouvé.
 *
 * Le wiki n'est pas « une surface parmi d'autres » — c'est **la** surface que
 * l'app balaie. Elle s'enregistre pourtant comme les autres : c'est ce qui
 * permet ensuite de dire « ce secret est ici, et là-bas ».
 *
 * L'emplacement est la **page** (l'adresse sur le wiki) : le détail des gîtes
 * (corps, commentaire, version, pièce jointe) reste dans la table
 * `location`, qui sait déjà le dire.
 */
export async function recordConfluenceSurfaces(ctx: ServiceContext, foyer: Foyer): Promise<void> {
  const pages = [...new Set(foyer.locations.map((location) => location.pageId))];
  for (const pageId of pages) {
    await recordSurfaceSeen(ctx, {
      fingerprint: foyer.fingerprint,
      surface: 'confluence',
      externalId: pageId,
      label: `page ${pageId}`,
      method: 'scan-wiki',
      source: 'forge-sql',
      foyerId: foyer.id,
    });
  }
}

/**
 * Les surfaces connues pour une empreinte, et la correspondance (PW-31).
 *
 * Le registre est interrogé deux fois : par empreinte (les surfaces qui
 * portent **cette** empreinte) et par emplacement (les surfaces voisines, vues
 * sous une autre empreinte — donc sous un autre namespace, donc avec une
 * autre clé). C'est ce second regard qui permet de dire « le même fichier,
 * deux empreintes » au lieu de ne rien voir du tout.
 */
export async function surfaceViewsForFingerprint(
  ctx: ServiceContext,
  fingerprint: string,
): Promise<{ views: SurfaceView[]; match: SurfaceMatch }> {
  const seen = await ctx.surfaces.listByFingerprint(fingerprint);
  const neighbours = await Promise.all(
    seen.map((row) => ctx.surfaces.listByLocation(row.surface, row.externalId)),
  );
  const all = [...seen, ...neighbours.flat()];
  const match = matchAcrossSurfaces(fingerprint, all, { namespaceId: ctx.namespace.id });
  return { views: seen.map(viewOf), match };
}
