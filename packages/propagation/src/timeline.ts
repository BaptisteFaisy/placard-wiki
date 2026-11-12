/**
 * Timeline de propagation (§11) : « recopié N fois entre <mois> et <mois>,
 * dont K par duplication de page ».
 *
 * C'est une information sur les **habitudes de l'équipe**, jamais sur les
 * personnes : aucun auteur n'est nommé, aucun champ d'acteur n'existe dans
 * les entrées (voir `detection.ts`).
 *
 * Heuristiques de « duplication de page », toutes documentées dans la sortie :
 *   H1 — duplication explicite : Confluence indique `duplicatedFromPageId` ;
 *   H2 — titre qui trahit la copie : « copie » / « copy » dans le titre ;
 *   H3 — même modèle de page (`templateId`) et créations rapprochées
 *        (≤ 7 jours) : pages jumelles issues du même modèle.
 * Une heuristique est un indice, pas une preuve : la méthode est affichée.
 */

import type { Foyer } from '@placard-wiki/domain';

import type { WikiPageMeta } from './detection';

/** Fenêtre de « créations rapprochées » pour l'heuristique H3 (jours). */
export const FENETRE_JUMELLES_JOURS = 7;

/** Motifs de titre pour l'heuristique H2 (« Copie de Runbook », « X copy »). */
const MOTIF_COPIE = /\b(copie|copie\s+de|copy|copy\s+of)\b/i;

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

/** Une recopie de l'empreinte vers une page, datée et qualifiée. */
export interface PropagationCopy {
  pageId: string;
  title: string;
  /** Date de création de la page (à défaut, première détection). */
  copiedAt: string;
  byPageDuplication: boolean;
  /** Heuristique appliquée (H1/H2/H3) — la méthode, pas la conclusion. */
  heuristique?: string;
}

/** La timeline complète d'un foyer. */
export interface PropagationTimeline {
  /** Page la plus tôt touchée — la source présumée, sans certitude. */
  sourcePageId?: string;
  copies: PropagationCopy[];
  copyCount: number;
  duplicationCount: number;
  /** Phrase affichable (§11) — mois en français, jamais d'acteur. */
  summary: string;
}

/** Libellé « mars » / « octobre » pour une date ISO. */
function moisDe(iso: string): string {
  const mois = Number(iso.slice(5, 7));
  return MOIS_FR[mois - 1] ?? iso.slice(0, 7);
}

/** Qualifie une copie : duplication de page ou simple recopie ? */
function qualifier(
  page: WikiPageMeta,
  soeurs: readonly WikiPageMeta[],
): Pick<PropagationCopy, 'byPageDuplication' | 'heuristique'> {
  if (page.duplicatedFromPageId !== undefined) {
    return { byPageDuplication: true, heuristique: 'H1 duplication explicite Confluence' };
  }
  if (MOTIF_COPIE.test(page.title)) {
    return { byPageDuplication: true, heuristique: 'H2 titre « copie »/« copy »' };
  }
  if (page.templateId !== undefined) {
    const création = Date.parse(page.createdAt);
    for (const soeur of soeurs) {
      if (soeur.pageId === page.pageId || soeur.templateId !== page.templateId) continue;
      const écart = Math.abs(Date.parse(soeur.createdAt) - création);
      if (écart <= FENETRE_JUMELLES_JOURS * 86_400_000) {
        return {
          byPageDuplication: true,
          heuristique: `H3 même modèle, créations rapprochées (≤ ${FENETRE_JUMELLES_JOURS} j)`,
        };
      }
    }
  }
  return { byPageDuplication: false };
}

/** Phrase-résumé : les cas 0, 1 et N, avec ou sans duplications. */
function résumé(
  n: number,
  k: number,
  premierMois: string | undefined,
  dernierMois: string | undefined,
): string {
  if (n === 0) return 'Aucune recopie détectée : l’empreinte ne vit que sur sa page source.';
  const période =
    premierMois === dernierMois || dernierMois === undefined
      ? `en ${premierMois ?? '?'}`
      : `entre ${premierMois ?? '?'} et ${dernierMois ?? '?'}`;
  const base = `recopié ${n} ${n > 1 ? 'fois' : 'fois'} ${période}`;
  if (k === 0) return base;
  return `${base}, dont ${k} par duplication de page`;
}

/**
 * Construit la timeline de propagation d'un foyer à partir des pages où ses
 * emplacements vivent. Les pages sans métadonnées sont ignorées (couverture
 * partielle déclarée, jamais masquée — §14).
 */
export function propagationTimeline(
  foyer: Foyer,
  pages: readonly WikiPageMeta[],
): PropagationTimeline {
  const pagesParId = new Map(pages.map((p) => [p.pageId, p]));
  const touchées = new Set<string>();
  for (const loc of foyer.locations) {
    if (pagesParId.has(loc.pageId)) touchées.add(loc.pageId);
  }

  const connues = [...touchées]
    .map((id) => pagesParId.get(id))
    .filter((p): p is WikiPageMeta => p !== undefined)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 :
      a.pageId < b.pageId ? -1 : 1));

  const [source, ...restantes] = connues;
  const copies: PropagationCopy[] = restantes.map((page) => ({
    pageId: page.pageId,
    title: page.title,
    copiedAt: page.createdAt,
    ...qualifier(page, connues),
  }));
  const k = copies.filter((c) => c.byPageDuplication).length;
  const premier = copies[0]?.copiedAt;
  const dernier = copies[copies.length - 1]?.copiedAt;

  return {
    sourcePageId: source?.pageId,
    copies,
    copyCount: copies.length,
    duplicationCount: k,
    summary: résumé(copies.length, k, premier ? moisDe(premier) : undefined,
      dernier ? moisDe(dernier) : undefined),
  };
}
