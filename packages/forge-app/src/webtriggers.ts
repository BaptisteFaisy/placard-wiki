/**
 * Webtriggers de l'app.
 *
 * 1. `pw-purge-request` — demandes de purge groupées à l'administrateur du
 *    site (§9, étape 3). Quand l'API ne permet pas de purger une version, ou
 *    que les droits manquent, l'app produit la demande exacte (page, numéro de
 *    version, empreinte) — et le foyer reste ouvert. Dire « on ne peut pas »
 *    fait partie du produit (§5).
 *    GET  → liste les demandes de purge en attente (`requested`).
 *    POST → marque des demandes comme reconnues (`acknowledged`).
 *
 * 2. `pw-public-demo` — la **chaîne live** : les données réelles du site, en
 *    JSON, pour que le site public consomme la même forme que ses données
 *    embarquées (`site/src/data/demo.ts` et `demo-site.ts`). Aucune valeur
 *    brute : empreintes, aperçus masqués, scores et termes seulement (§23).
 *
 * ⚠ L'authentification de l'administrateur (pont signé) est **à valider
 * semaine 1** (§22) ; en l'état le hook répond sur le canal webtrigger déclaré
 * au manifeste (`pw-purge-request`).
 */

import { Queue } from '@forge/events';

import { getServiceContext } from './runtime/context';
import { buildingModel, coverageReport, generateCertificate, registryRows } from './services/index';
import type { ServiceContext } from './services/ports';
import type {
  BuildingModel, Certificate, CoverageReport, Foyer, RegistryRow, ScanBudget,
} from '@placard-wiki/domain';

interface WebtriggerRequest {
  method: string;
  path: string;
  queryParameters?: Record<string, string | string[]>;
  body?: string;
}

interface WebtriggerResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** CORS du webtrigger public : le site public appelle l'app depuis un autre domaine. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
};

/** File de balayage long (§19 : module `consumer`, queue `pw-sweep-queue`). */
const SWEEP_QUEUE = 'pw-sweep-queue';

/** Une demande de purge vue par l'administrateur (empreinte, jamais la valeur). */
interface AdminPurgeLine {
  id: string;
  foyerId: string;
  pageId: string;
  versionNumbers: number[];
  fingerprint: string;
  requestedAt: string;
  state: string;
}

/** Construit la liste exacte à présenter à l'administrateur. */
async function pendingLines(ctx: ServiceContext): Promise<AdminPurgeLine[]> {
  const pending = await ctx.store.purgeRequests.listPending();
  const lines: AdminPurgeLine[] = [];
  for (const request of pending) {
    const foyer = await ctx.store.getFoyer(request.foyerId);
    lines.push({
      id: request.id,
      foyerId: request.foyerId,
      pageId: request.pageId,
      versionNumbers: request.versionNumbers,
      fingerprint: foyer?.fingerprint ?? '',
      requestedAt: request.requestedAt,
      state: request.state,
    });
  }
  return lines;
}

/** Marque des demandes comme reconnues (POST, corps `{ ids: string[] }`). */
async function acknowledge(ctx: ServiceContext, body: string | undefined): Promise<{ acknowledged: number }> {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(body ?? '{}') as { ids?: unknown };
    if (Array.isArray(parsed.ids)) ids = parsed.ids.filter((x): x is string => typeof x === 'string');
  } catch {
    ids = [];
  }
  let acknowledged = 0;
  for (const id of ids) {
    await ctx.store.purgeRequests.markState(id, 'acknowledged');
    acknowledged += 1;
  }
  return { acknowledged };
}

export async function purgeRequestHook(request: WebtriggerRequest): Promise<WebtriggerResponse> {
  const ctx = await getServiceContext();
  console.info(`[placard] purge-request-hook ${request.method} ${request.path}`);
  if (request.method === 'POST') {
    const result = await acknowledge(ctx, request.body);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  }
  const lines = await pendingLines(ctx);
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      count: lines.length,
      requests: lines,
      honesty:
        'Tant que ces versions n’ont pas été purgées et vérifiées, les foyers restent ouverts ' +
        'et leur exposition reste élevée (§9). Aucune valeur brute ne figure dans cette demande.',
    }),
  };
}

// ---------------------------------------------------------------------------
// Chaîne live : les données réelles du site, en JSON public (jamais de valeur brute)
// ---------------------------------------------------------------------------

/** Le site réel sur lequel l'app est installée. */
const LIVE_SITE = {
  name: 'one-atlas-cndz.atlassian.net',
  url: 'https://one-atlas-cndz.atlassian.net/wiki',
};

/** Un espace réel — même forme que `SPACES` du site public (`key`, `fr`, `en`). */
interface LiveSpace {
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
function emptyBudget(day: string): ScanBudget {
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

/** Titres réels des pages porteuses de foyers (le registre les affiche). */
async function liveTitles(ctx: ServiceContext, foyers: readonly Foyer[]): Promise<Record<string, string>> {
  const pageIds = [...new Set(foyers.flatMap((f) => f.locations.map((l) => l.pageId)))].slice(0, 40);
  const titles: Record<string, string> = {};
  await Promise.all(pageIds.map(async (pageId) => {
    const page = await ctx.confluence.getPage(pageId).catch(() => null);
    if (page !== null) titles[pageId] = page.title;
  }));
  return titles;
}

/** Les espaces réellement balayés : clé + nom du site (un seul libellé par espace). */
async function liveSpaces(ctx: ServiceContext, keys: readonly string[]): Promise<LiveSpace[]> {
  const spaces: LiveSpace[] = [];
  for (const key of keys) {
    const space = await ctx.confluence.getSpaceDescription(key).catch(() => null);
    const name = space?.name ?? key;
    spaces.push({ key, fr: name, en: name });
  }
  return spaces;
}

/** La couverture réelle : compteurs du jour + angles morts déclarés par le service. */
function liveCoverage(base: CoverageReport, budget: ScanBudget, lastPassAt?: string): CoverageReport {
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
async function buildPublicDemo(ctx: ServiceContext): Promise<PublicDemoPayload> {
  const foyers = await ctx.store.listFoyers({ limit: 200 });
  const { rows } = await registryRows(ctx, { limit: 200, sort: 'score' });
  const building = await buildingModel(ctx);
  const day = ctx.clock.now().slice(0, 10);
  const budget = (await ctx.store.budget.get(day)) ?? emptyBudget(day);
  const cursor = await ctx.store.cursors.get('site', 'incremental');
  const coverage = liveCoverage(await coverageReport(ctx), budget, cursor?.runAt);
  const certificate = (await ctx.store.certificates.latest('site')) ?? (await generateCertificate(ctx, 'site'));
  const titles = await liveTitles(ctx, foyers);
  const spaceKeys = [...new Set(foyers.map((f) => f.spaceKey ?? '').filter((k) => k !== ''))];
  const registry = rows.map((row) => ({ ...row, pageTitle: titles[row.pageId] ?? row.pageTitle }));
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

/**
 * Met une passe d'espace en file : c'est le **consumer** qui la fait (jusqu'à
 * 900 s), jamais le webtrigger (55 s). Renvoie l'espace mis en file, ou null.
 */
async function queueSweep(scope: string | string[] | undefined): Promise<string | null> {
  const value = Array.isArray(scope) ? scope[0] : scope;
  if (value === undefined || value === '') return null;
  try {
    await new Queue({ key: SWEEP_QUEUE }).push({ body: { mode: 'full', scope: value } });
    console.info(`[placard] public-demo : passe « ${value} » mise en file.`);
    return value;
  } catch {
    console.info(`[placard] public-demo : mise en file impossible pour « ${value} » — déclaré, pas masqué.`);
    return null;
  }
}

/**
 * Webtrigger public : la chaîne live. `GET` renvoie le JSON public, `OPTIONS`
 * le préflight CORS. Le paramètre `?sweep=<ESPACE>` met la passe de cet
 * espace en file (le consumer la fait, hors du chemin du webtrigger) : la
 * réponse dit alors ce qui a été mis en file, jamais un résultat inventé.
 */
export async function publicDemoHook(request: WebtriggerRequest): Promise<WebtriggerResponse> {
  if (request.method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS_HEADERS }, body: '' };
  }
  const ctx = await getServiceContext();
  console.info(`[placard] public-demo-hook ${request.method} ${request.path}`);
  const payload = await buildPublicDemo(ctx);
  const queued = await queueSweep(request.queryParameters?.['sweep']);
  const body: PublicDemoPayload & { refresh?: { queued: boolean; scope: string } } = payload;
  if (queued !== null) body.refresh = { queued: true, scope: queued };
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}