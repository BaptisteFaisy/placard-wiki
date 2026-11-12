/**
 * La construction de la charge utile publique — la **source unique** du
 * contrat servi par le webtrigger `pw-public-demo`.
 *
 * Ce module ne dépend d'aucun SDK Forge : il ne fait que lire le store et
 * assembler la charge utile. Il est donc testable directement — et c'est ce
 * que fait `public-payload.test.ts` : la charge utile produite par CETTE
 * fonction est validée contre `docs/api-live.schema.json` (JSON Schema
 * draft 2020-12). Le schéma et la fonction ne peuvent pas diverger sans que
 * le test casse.
 *
 * Engagement : **aucune valeur brute** dans la charge utile (§23) — des
 * empreintes HMAC, des aperçus masqués, des scores et leurs termes.
 */

import { buildingModel, coverageReport, generateCertificate, maskText, registryRows } from './services/index';
import type { ServiceContext } from './services/ports';
import type {
  BuildingModel,
  Certificate,
  CoverageReportReelle,
  Foyer,
  LiveContractPayload,
  LiveContractSite,
  LiveContractSpace,
  RegistryRow,
  ScanBudget,
} from '@placard-wiki/domain';

/** Le site réel sur lequel l'app est installée. */
const LIVE_SITE = {
  name: 'one-atlas-cndz.atlassian.net',
  url: 'https://one-atlas-cndz.atlassian.net/wiki',
};

/** Budget neutre quand aucune passe n'a encore été enregistrée (déclaré, pas masqué). */
export function emptyBudget(day: string): ScanBudget {
  return {
    day,
    pagesScanned: 0,
    attachmentsRead: 0,
    attachmentsSkipped: 0,
    llmCalls: 0,
    tokens: 0,
    costEstimate: 0,
    skipped: [],
    coverageNote: 'Aucune passe enregistrée pour ce jour — couverture nulle, déclarée.',
  };
}

/**
 * Titres réels des pages porteuses de foyers (le registre les affiche).
 *
 * ⚠ Le titre est **masqué** avant publication : l'espace de démonstration
 * place des faux secrets dans les titres de page (§23 — aucune valeur brute,
 * même fausse, dans la charge utile publique).
 */
async function liveTitles(ctx: ServiceContext, foyers: readonly Foyer[]): Promise<Record<string, string>> {
  const pageIds = [...new Set(foyers.flatMap((f) => f.locations.map((l) => l.pageId)))].slice(0, 40);
  const titles: Record<string, string> = {};
  await Promise.all(pageIds.map(async (pageId) => {
    const page = await ctx.confluence.getPage(pageId).catch(() => null);
    if (page !== null) titles[pageId] = maskText(page.title, ctx.hmacKey);
  }));
  return titles;
}

/** Les espaces réellement balayés : clé + nom du site (un seul libellé par espace). */
async function liveSpaces(ctx: ServiceContext, keys: readonly string[]): Promise<LiveContractSpace[]> {
  const spaces: LiveContractSpace[] = [];
  for (const key of keys) {
    const space = await ctx.confluence.getSpaceDescription(key).catch(() => null);
    const name = space?.name ?? key;
    spaces.push({ key, fr: name, en: name });
  }
  return spaces;
}

/**
 * La couverture exposée publiquement : le rapport mesuré par le service, avec
 * le pourcentage et SA MÉTHODE.
 *
 * Aucun chiffre n'est reconstruit ici : le rapport vient du store, tel quel
 * (§14, §19). Les sept gîtes, leurs compteurs, leurs états et leurs raisons
 * sont ceux que la passe a mesurés.
 */
export function liveCoverage(base: CoverageReportReelle, lastPassAt?: string): CoverageReportReelle {
  const coverage: CoverageReportReelle = {
    ...base,
    perGite: [...base.perGite],
    blindSpots: [...base.blindSpots],
    missingRights: [...base.missingRights],
  };
  if (lastPassAt !== undefined) coverage.lastPassAt = lastPassAt;
  return coverage;
}

/** Le site balayé, tel que le contrat le publie. */
async function liveSite(ctx: ServiceContext, foyers: readonly Foyer[], titles: Record<string, string>): Promise<LiveContractSite> {
  const spaceKeys = [...new Set(foyers.map((f) => f.spaceKey ?? '').filter((k) => k !== ''))];
  return {
    name: LIVE_SITE.name,
    url: LIVE_SITE.url,
    spaces: await liveSpaces(ctx, spaceKeys),
    titles,
  };
}

/**
 * Assemble la charge utile live à partir du store (aucune valeur brute : §23).
 *
 * C'est LA fonction du contrat : le webtrigger la sert telle quelle, et le
 * test de validité s'appuie sur elle (pas sur une copie).
 */
export async function buildPublicPayload(ctx: ServiceContext): Promise<LiveContractPayload> {
  console.info('[placard] public-demo : lecture du store…');
  const foyers = await ctx.store.listFoyers({ limit: 200 });
  console.info(`[placard] public-demo : foyers en base = ${String(foyers.length)}`);
  const { rows } = await registryRows(ctx, { limit: 200, sort: 'score' });
  const building: BuildingModel = await buildingModel(ctx);
  const day = ctx.clock.now().slice(0, 10);
  const budget = (await ctx.store.budget.get(day)) ?? emptyBudget(day);
  const cursor = await ctx.store.cursors.get('site', 'incremental');
  const coverage = liveCoverage(await coverageReport(ctx), cursor?.runAt);
  // Le certificat est **regénéré** à chaque appel : un certificat périmé
  // compterait des foyers qui n'existent plus (§9 — le certificat.date).
  const certificate: Certificate = await generateCertificate(ctx, 'site');
  console.info('[placard] public-demo : titres et espaces réels…');
  const titles = await liveTitles(ctx, foyers);
  const registry: RegistryRow[] = rows.map((row) => ({ ...row, pageTitle: titles[row.pageId] ?? row.pageTitle }));
  console.info(`[placard] public-demo : charge utile prête (${String(registry.length)} lignes).`);
  return {
    generatedAt: ctx.clock.now(),
    mode: 'live',
    site: await liveSite(ctx, foyers, titles),
    registry,
    building,
    foyers: Object.fromEntries(foyers.map((f) => [f.id, f])),
    budget,
    coverage,
    certificate,
  };
}
