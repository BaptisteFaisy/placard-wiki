/**
 * Charge utile publique « live » (§23) — le JSON que sert le webtrigger
 * `pw-public-demo`.
 *
 * Pourquoi un module à part : la construction de la charge utile est une
 * **fonction pure du store et du client Confluence**, pas une partie du
 * runtime Forge. La sortir de `webtriggers.ts` permet à la preuve de
 * non-fuite (tests) de la rejouer **sans la plateforme** — même fonction,
 * mêmes données, aucun accès réseau.
 *
 * Règle absolue (§23) : la charge utile publique ne porte **aucune valeur
 * brute**, même fausse. Les titres de page sont masqués avant publication
 * (l'espace de démonstration place des faux secrets dans les titres — cas
 * mesuré le 12 novembre 2026), et le registre ne porte que des empreintes
 * et des aperçus caviardés.
 */

import { maskText } from './scan-page';
import { buildingModel, coverageReport, registryRows } from './registry';
import { generateCertificate } from './ritual-service';
import type { ServiceContext } from './ports';
import type {
  BuildingModel, Certificate, CoverageReport, Foyer, RegistryRow, ScanBudget,
} from '@placard-wiki/domain';

/** Le site réel sur lequel l'app est installée. */
export const LIVE_SITE = {
  name: 'one-atlas-cndz.atlassian.net',
  url: 'https://one-atlas-cndz.atlassian.net/wiki',
};

/** Espace de démonstration semé de faux secrets (celui que le public peut balayer). */
export const DEMO_SPACE = 'PLACARDDEMO';

/** Un espace réel — même forme que `SPACES` du site public (`key`, `fr`, `en`). */
export interface LiveSpace {
  key: string;
  fr: string;
  en: string;
}

/** La charge utile publique : mêmes formes que les données embarquées du site. */
export interface PublicDemoPayload {
  /** Horodatage de la production de la charge utile. */
  generatedAt: string;
  /** `live` = données réellement balayées sur le site (≠ `demo` embarqué). */
  mode: 'live';
  site: {
    name: string;
    url: string;
    spaces: LiveSpace[];
    /** Titres réels des pages balayées (pageId → titre). */
    titles: Record<string, string>;
  };
  registry: RegistryRow[];
  building: BuildingModel;
  /** Les foyers, indexés par identifiant — comme `FOYERS` du site public. */
  foyers: Record<string, Foyer>;
  budget: ScanBudget;
  coverage: CoverageReport;
  certificate: Certificate;
}

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
export async function liveTitles(ctx: ServiceContext, foyers: readonly Foyer[]): Promise<Record<string, string>> {
  const pageIds = [...new Set(foyers.flatMap((f) => f.locations.map((l) => l.pageId)))].slice(0, 40);
  const titles: Record<string, string> = {};
  await Promise.all(pageIds.map(async (pageId) => {
    const page = await ctx.confluence.getPage(pageId).catch(() => null);
    if (page !== null) titles[pageId] = maskText(page.title, ctx.hmacKey);
  }));
  return titles;
}

/** Les espaces réellement balayés : clé + nom du site (un seul libellé par espace). */
export async function liveSpaces(ctx: ServiceContext, keys: readonly string[]): Promise<LiveSpace[]> {
  const spaces: LiveSpace[] = [];
  for (const key of keys) {
    const space = await ctx.confluence.getSpaceDescription(key).catch(() => null);
    const name = space?.name ?? key;
    spaces.push({ key, fr: name, en: name });
  }
  return spaces;
}

/** La couverture réelle : compteurs du jour + angles morts déclarés par le service. */
export function liveCoverage(base: CoverageReport, budget: ScanBudget, lastPassAt?: string): CoverageReport {
  const coverage: CoverageReport = {
    perGite: [
      { gite: 'corps-de-page', scanned: budget.pagesScanned, skipped: 0 },
      {
        gite: 'pieces-jointes',
        scanned: budget.attachmentsRead,
        skipped: budget.attachmentsSkipped,
        reason: 'Binaire sans texte ou taille dépassée — détail dans le budget.',
      },
    ],
    blindSpots: [...base.blindSpots],
    missingRights: [...base.missingRights],
  };
  if (lastPassAt !== undefined) coverage.lastPassAt = lastPassAt;
  return coverage;
}

/** Assemble la charge utile live à partir du store (aucune valeur brute : §23). */
export async function buildPublicDemo(ctx: ServiceContext): Promise<PublicDemoPayload> {
  console.info('[placard] public-demo : lecture du store…');
  const foyers = await ctx.store.listFoyers({ limit: 200 });
  console.info(`[placard] public-demo : foyers en base = ${String(foyers.length)}`);
  const { rows } = await registryRows(ctx, { limit: 200, sort: 'score' });
  const building = await buildingModel(ctx);
  const day = ctx.clock.now().slice(0, 10);
  const budget = (await ctx.store.budget.get(day)) ?? emptyBudget(day);
  const cursor = await ctx.store.cursors.get('site', 'incremental');
  const coverage = liveCoverage(await coverageReport(ctx), budget, cursor?.runAt);
  // Le certificat est **regénéré** à chaque appel : un certificat périmé
  // compterait des foyers qui n'existent plus (§9 — le certificat.date).
  const certificate = await generateCertificate(ctx, 'site');
  console.info('[placard] public-demo : titres et espaces réels…');
  const titles = await liveTitles(ctx, foyers);
  const spaceKeys = [...new Set(foyers.map((f) => f.spaceKey ?? '').filter((k) => k !== ''))];
  const registry = rows.map((row) => ({ ...row, pageTitle: titles[row.pageId] ?? row.pageTitle }));
  console.info(`[placard] public-demo : charge utile prête (${String(registry.length)} lignes).`);
  return {
    generatedAt: ctx.clock.now(),
    mode: 'live',
    site: {
      name: LIVE_SITE.name,
      url: LIVE_SITE.url,
      spaces: await liveSpaces(ctx, spaceKeys),
      titles,
    },
    registry,
    building,
    foyers: Object.fromEntries(foyers.map((f) => [f.id, f])),
    budget,
    coverage,
    certificate,
  };
}
