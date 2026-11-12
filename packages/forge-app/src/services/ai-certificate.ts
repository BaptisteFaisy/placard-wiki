/**
 * Service « certificat prêt à activer l'IA » (§13, §27) : calcule, à partir
 * de l'état réel (foyers, exposition, couverture, budget), un certificat
 * daté et chiffré qui répond à « qu'est-ce que je m'apprête à donner à lire à
 * mon assistant ? ».
 *
 * Aucun chiffre en dur : couverture, foyers, exposition et budget sont lus au
 * store via les ports injectables. Aucune valeur brute de secret n'entre ni
 * ne sort ; l'intégrité tient à un HMAC-SHA-256 du JSON canonique avec la clé
 * d'installation (jamais journalisée).
 */

import {
  AI_SURFACE_METHOD_FR,
  BASE_BLIND_SPOTS_FR,
  READERS_METHOD_FR,
  aiSurface,
  isExposed,
} from '@placard-wiki/exposure';
import {
  GITES,
  decideAiActivation,
  giteCoverageOf,
} from '@placard-wiki/domain';
import type {
  AiActivationCertificate,
  AiActivationFamilyAggregate,
  AiActivationThresholds,
  AiExposedFoyers,
  Foyer,
  Gite,
  OpenFoyersSummary,
  PageExposure,
  ResidualAiExposure,
  WikiFamily,
} from '@placard-wiki/domain';
import { contentHashOf } from '@placard-wiki/ritual';

import type { ServiceContext } from './ports';

/** La méthode des « foyers ouverts » — jamais un nombre sans sa définition. */
export const OPEN_FOYERS_METHOD_FR =
  'Foyers « ouverts » au sens §13 (EXPOSED_STATES) : open, rotation-attested, redacted, ' +
  'purge-requested, purge-impossible — du texte reste lisible quelque part. purged, sealed ' +
  'et dismissed n’exposent plus.';

/** La méthode des « foyers exposés à l'IA » — une hypothèse, jamais un recensement. */
export const AI_EXPOSED_METHOD_FR =
  'Hypothèse conservatrice (§13) : un foyer ouvert est « exposé à l’IA » si sa page principale ' +
  'est présumée lisible par Rovo, ou si son exposition n’a pas été calculée (le doute profite ' +
  'à l’exposition, jamais au silence).';

/** Options du calcul — seuils et horloge injectables, pour des certificats déterministes. */
export interface AiActivationOptions {
  thresholds?: Partial<AiActivationThresholds>;
  now?: string;
}

/** Libellé français d'un gîte, pour les angles morts déclarés (§6). */
function giteLabelFr(gite: Gite): string {
  return GITES.find((g) => g.gite === gite)?.fr ?? gite;
}

/** Page principale d'un foyer (affichage direct), sans inventer d'identifiant. */
function primaryPageOf(foyer: Foyer): string {
  return foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
}

/** Une page sans exposition calculée est PRÉSUMÉE indexée (§13 : doute → exposition). */
function presumedIndexed(exposure: PageExposure | null): boolean {
  return exposure === null || exposure.aiSurface.presumedIndexed;
}

/** Répartition par famille et foyer au danger maximal (§8). */
function aggregateOpenFoyers(open: readonly Foyer[]): {
  byFamily: AiActivationFamilyAggregate[];
  maxFoyer: Foyer | null;
} {
  const byFamily = new Map<WikiFamily, { count: number; maxDanger: number }>();
  let maxFoyer: Foyer | null = null;
  for (const foyer of open) {
    const current = byFamily.get(foyer.family) ?? { count: 0, maxDanger: 0 };
    current.count += 1;
    current.maxDanger = Math.max(current.maxDanger, foyer.score);
    byFamily.set(foyer.family, current);
    if (maxFoyer === null || foyer.score > maxFoyer.score) maxFoyer = foyer;
  }
  const families = [...byFamily.entries()]
    .map(([family, value]) => ({ family, count: value.count, maxDanger: value.maxDanger }))
    .sort((a, b) => b.maxDanger - a.maxDanger || a.family.localeCompare(b.family));
  return { byFamily: families, maxFoyer };
}

/** Foyers ouverts dont la page est présumée lisible par Rovo, et leur audience. */
function aiReachableFoyers(
  open: readonly Foyer[],
  exposures: ReadonlyMap<string, PageExposure | null>,
  siteUsers?: number,
): { count: number; lows: number[]; highs: number[]; caveats: string[] } {
  const lows: number[] = [];
  const highs: number[] = [];
  const caveats = new Set<string>();
  let count = 0;
  for (const foyer of open) {
    const primary = primaryPageOf(foyer);
    const exposure = primary === '' ? null : exposures.get(primary) ?? null;
    if (!presumedIndexed(exposure)) continue;
    count += 1;
    if (exposure === null) {
      lows.push(0);
      highs.push(siteUsers ?? 0);
      caveats.add(`Page ${primary} sans exposition calculée : présumée indexée, lecteurs inconnus (fourchette 0–${siteUsers ?? 'inconnu'}).`);
    } else {
      lows.push(exposure.readers.low);
      highs.push(exposure.readers.high);
      for (const caveat of exposure.readers.caveats) caveats.add(caveat);
    }
  }
  return { count, lows, highs, caveats: [...caveats] };
}

/**
 * Agrège les foyers ouverts : résumé (danger max + termes + familles), foyers
 * exposés à l'IA et exposition résiduelle. Aucune valeur brute, que des nombres
 * et des fourchettes.
 */
function summarizeOpenFoyers(
  open: readonly Foyer[],
  exposures: ReadonlyMap<string, PageExposure | null>,
  siteUsers?: number,
): { openFoyers: OpenFoyersSummary; aiExposedFoyers: AiExposedFoyers; residualExposure: ResidualAiExposure } {
  const { byFamily, maxFoyer } = aggregateOpenFoyers(open);
  const reachable = aiReachableFoyers(open, exposures, siteUsers);
  const openFoyers: OpenFoyersSummary = {
    count: open.length,
    maxDanger: maxFoyer?.score ?? 0,
    maxDangerTerms: maxFoyer?.scoreTerms ?? [],
    byFamily,
  };
  const aiExposedFoyers: AiExposedFoyers = {
    count: reachable.count,
    presumedIndexed: reachable.count,
    method: AI_EXPOSED_METHOD_FR,
  };
  const residualExposure: ResidualAiExposure = {
    readersLow: reachable.lows.length === 0 ? 0 : Math.min(...reachable.lows),
    readersHigh: reachable.highs.length === 0 ? 0 : Math.max(...reachable.highs),
    method: READERS_METHOD_FR,
    caveats: reachable.caveats,
  };
  return { openFoyers, aiExposedFoyers, residualExposure };
}

/** Angles morts déclarés : base + couverture + non-lus de la passe (§19, §23). */
function blindSpotsOf(
  coverage: AiActivationCertificate['coverage'],
  skippedPages: readonly { pageId: string; skippedReason?: string }[],
  skippedAttachments: readonly { attachmentId: string; filename: string }[],
): string[] {
  const spots: string[] = [...BASE_BLIND_SPOTS_FR];
  if (coverage.uncovered.length > 0) {
    spots.push(`Gîtes non couverts : ${coverage.uncovered.map(giteLabelFr).join(' · ')}.`);
  }
  const pages = skippedPages
    .map((p) => `Page ${p.pageId} (${p.skippedReason ?? 'non lue'})`)
    .join(' · ');
  if (pages !== '') spots.push(`Pages non lues : ${pages}.`);
  const attachments = [...new Set(skippedAttachments.map((a) => a.filename || a.attachmentId))].join(' · ');
  if (attachments !== '') spots.push(`Pièces jointes non lues : ${attachments}.`);
  return spots;
}

/** Charge utile canonique du certificat (tout, sauf id et empreinte). */
function payloadOf(cert: Omit<AiActivationCertificate, 'id' | 'contentHash'>): Record<string, unknown> {
  return {
    scope: cert.scope,
    issuedAt: cert.issuedAt,
    aiSurface: cert.aiSurface,
    coverage: cert.coverage,
    openFoyers: cert.openFoyers,
    aiExposedFoyers: cert.aiExposedFoyers,
    residualExposure: cert.residualExposure,
    blindSpots: cert.blindSpots,
    verdict: cert.verdict,
  };
}

/**
 * Calcule le certificat « prêt à activer l'IA » d'un périmètre (§13, §27).
 * `scope` vaut une clé d'espace, ou `site` pour l'ensemble du site.
 */
export async function computeAiActivationCertificate(
  ctx: ServiceContext,
  scope: string,
  options: AiActivationOptions = {},
): Promise<AiActivationCertificate> {
  const now = options.now ?? ctx.clock.now();
  const spaceKey = scope === 'site' ? undefined : scope;

  const [foyers, skippedPages, skippedAttachments, budget] = await Promise.all([
    ctx.store.listFoyers({ limit: 100000, spaceKey }),
    ctx.store.pageScans.listSkipped(),
    ctx.store.attachmentScans.listSkipped(),
    ctx.store.budget.get(now.slice(0, 10)),
  ]);

  const open = foyers.filter((foyer) => isExposed(foyer.state));
  const coverage = giteCoverageOf({
    skippedPages: skippedPages.length,
    skippedAttachments: skippedAttachments.length,
    hasPass: budget !== null,
  });

  const exposures = new Map<string, PageExposure | null>();
  for (const foyer of open) {
    const primary = primaryPageOf(foyer);
    if (primary !== '' && !exposures.has(primary)) {
      exposures.set(primary, await ctx.store.exposures.get(primary));
    }
  }

  const { openFoyers, aiExposedFoyers, residualExposure } =
    summarizeOpenFoyers(open, exposures, ctx.siteUsers);
  const blindSpots = blindSpotsOf(coverage, skippedPages, skippedAttachments);
  const verdict = decideAiActivation({
    coverage,
    openFoyers,
    aiExposedFoyers,
    residualExposure,
    thresholds: options.thresholds,
  });

  const body: Omit<AiActivationCertificate, 'id' | 'contentHash'> = {
    scope,
    issuedAt: now,
    aiSurface: aiSurface({ readableByRovo: 'unknown' }),
    coverage,
    openFoyers,
    aiExposedFoyers,
    residualExposure,
    blindSpots,
    verdict,
  };
  const contentHash = contentHashOf(payloadOf(body), ctx.hmacKey);
  return { ...body, id: `ai-cert:${contentHash.slice(8, 24)}`, contentHash };
}

export { AI_SURFACE_METHOD_FR };