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

import { getServiceContext, probeConfluence } from './runtime/context';
import { denyReason, scopeForPath } from './runtime/confluence-access';
import { allProbePaths } from './runtime/probe-paths';
import {
  buildingModel, coverageReport, generateCertificate, maskText, registryRows, runSweep,
} from './services/index';
import { buildPublicPayload } from './public-payload';
import { applyPurgeDecision } from './services/ritual-service';
import { purgeRequestLines, purgeRequestsCsv } from '@placard-wiki/ritual';
import type { PurgeDecision } from '@placard-wiki/ritual';
import type { ServiceContext } from './services/ports';
import type { Foyer, LiveContractPayload } from '@placard-wiki/domain';
import { LIVE_CONTRACT_HEADER, LIVE_CONTRACT_VERSION } from '@placard-wiki/domain';

interface WebtriggerRequest {
  method: string;
  path: string;
  /** Mesuré : les paramètres sont des **tableaux** de valeurs (`@forge/api`). */
  queryParameters?: Record<string, string[]>;
  body?: string;
}

interface WebtriggerResponse {
  statusCode: number;
  headers: Record<string, string[]>;
  body: string;
}

/**
 * Les en-têtes d'une réponse dynamique sont des **tableaux de valeurs**
 * (`@forge/api` : `headers?: { [key: string]: string[] }`). Une chaîne seule
 * fait échouer la sérialisation : la plateforme répond 424 « Failed
 * Dependency » sans journal d'erreur — mesuré le 12 novembre 2026.
 */
const JSON_HEADERS: Record<string, string[]> = { 'Content-Type': ['application/json'] };

/** CORS du webtrigger public : le site public appelle l'app depuis un autre domaine. */
const CORS_HEADERS: Record<string, string[]> = {
  'Access-Control-Allow-Origin': ['*'],
  'Access-Control-Allow-Methods': ['GET, OPTIONS'],
  'Access-Control-Allow-Headers': ['Content-Type'],
  'Access-Control-Max-Age': ['600'],
  // Sans cet en-tête, le navigateur ne peut pas lire `X-Placard-Contract` :
  // la version du contrat serait invisible pour le site public.
  'Access-Control-Expose-Headers': [LIVE_CONTRACT_HEADER],
};

/**
 * Les en-têtes du contrat : la version servie, et rien d'autre.
 *
 * `X-Placard-Contract` porte la version du schéma qui décrit la charge utile
 * (`docs/api-live.schema.json`). Un tiers qui lit cet en-tête sait quelle
 * version il consomme — et le site public refuse une version qu'il ne
 * connaît pas.
 */
const CONTRACT_HEADERS: Record<string, string[]> = {
  [LIVE_CONTRACT_HEADER]: [LIVE_CONTRACT_VERSION],
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
  /** Raison de l'impossibilité, ou motif du refus. */
  reason: string;
  /** Référence de l'administrateur, quand il y en a une. */
  adminRef?: string;
}

/** Construit la liste exacte à présenter à l'administrateur. */
async function pendingLines(ctx: ServiceContext): Promise<AdminPurgeLine[]> {
  const pending = await ctx.store.purgeRequests.listPending();
  const lines: AdminPurgeLine[] = [];
  for (const request of pending) {
    const foyer = await ctx.store.getFoyer(request.foyerId);
    const line: AdminPurgeLine = {
      id: request.id,
      foyerId: request.foyerId,
      pageId: request.pageId,
      versionNumbers: request.versionNumbers,
      fingerprint: foyer?.fingerprint ?? '',
      requestedAt: request.requestedAt,
      state: request.state,
      reason: request.blockedReason ?? 'Demande de purge d’historique.',
    };
    if (request.adminRef !== undefined) line.adminRef = request.adminRef;
    lines.push(line);
  }
  return lines;
}

/**
 * L'export CSV : une ligne par page et par numéro de version, avec l'empreinte,
 * la famille et la raison. **Aucune valeur brute** (§9).
 */
async function purgeCsv(ctx: ServiceContext): Promise<string> {
  const requests = await ctx.store.purgeRequests.listAll();
  const foyers = new Map<string, Foyer>();
  for (const request of requests) {
    if (foyers.has(request.foyerId)) continue;
    const foyer = await ctx.store.getFoyer(request.foyerId);
    if (foyer !== null) foyers.set(request.foyerId, foyer);
  }
  return purgeRequestsCsv(purgeRequestLines(requests, foyers));
}

/** Le corps de la décision POST : `{ ids, decision, adminRef?, motive? }`. */
interface PurgeDecisionBody {
  ids: string[];
  decision: PurgeDecision;
  adminRef?: string;
  motive?: string;
}

/** Lit la décision POST — corps illisible = refus explicite, jamais un silence. */
function readDecision(body: string | undefined): PurgeDecisionBody {
  let parsed: { ids?: unknown; decision?: unknown; adminRef?: unknown; motive?: unknown } = {};
  try {
    parsed = JSON.parse(body ?? '{}') as typeof parsed;
  } catch {
    parsed = {};
  }
  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((id): id is string => typeof id === 'string')
    : [];
  const decision = parsed.decision;
  const out: PurgeDecisionBody = {
    ids,
    decision: decision === 'acknowledged' || decision === 'refused' || decision === 'done' ? decision : 'acknowledged',
  };
  if (typeof parsed.adminRef === 'string') out.adminRef = parsed.adminRef;
  if (typeof parsed.motive === 'string') out.motive = parsed.motive;
  return out;
}

export async function purgeRequestHook(request: WebtriggerRequest): Promise<WebtriggerResponse> {
  const ctx = await getServiceContext();
  console.info(`[placard] purge-request-hook ${request.method} ${request.path}`);
  if (request.method === 'POST') {
    const decision = readDecision(request.body);
    const result = await applyPurgeDecision(ctx, decision);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  }
  // `?format=csv` : l'export que l'administrateur traite en une fois.
  if (request.queryParameters?.['format']?.[0] === 'csv') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': ['text/csv; charset=utf-8'] },
      body: await purgeCsv(ctx),
    };
  }
  const lines = await pendingLines(ctx);
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      count: lines.length,
      requests: lines,
      csv: 'Ajouter ?format=csv à cette même URL pour exporter la liste exploitable.',
      decisions: 'POST { ids, decision: acknowledged|refused|done, adminRef?, motive? } — un refus exige son motif.',
      honesty:
        'Tant que ces versions n’ont pas été purgées et vérifiées, les foyers restent ouverts ' +
        'et leur exposition reste élevée (§9). Aucune valeur brute ne figure dans cette demande.',
    }),
  };
}

// ---------------------------------------------------------------------------
// Chaîne live : les données réelles du site, en JSON public (jamais de valeur brute)
// ---------------------------------------------------------------------------

/** Espace de démonstration semé de faux secrets (celui que le public peut balayer). */
const DEMO_SPACE = 'PLACARDDEMO';

/** Borne de la passe en ligne du webtrigger (le webtrigger tient en 55 s). */
const INLINE_SWEEP_PAGES = 25;

/** Une page de l'espace de démonstration, pour la sonde des points d'accès. */
const PROBE_PAGE_ID = '3964930';

/** Ce que la passe demandée a donné — déclaré, jamais inventé. */
interface RefreshReport {
  scope: string;
  status: string;
  pagesScanned: number;
  foyersTouched: number;
  blindSpots?: string[];
  honesty: string;
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
 * Passe bornée demandée par le public (`?sweep=1`) : elle porte sur l'espace
 * de démonstration (`PLACARDDEMO`), en ligne, dans la limite de 55 s du
 * webtrigger. Un seul espace est autorisé — le point public n'est pas un
 * déclencheur de balayage du site.
 */
async function inlineSweep(ctx: ServiceContext, asked: string | string[] | undefined): Promise<RefreshReport | null> {
  const value = Array.isArray(asked) ? asked[0] : asked;
  if (value === undefined || value === '' || value === '0') return null;
  const scope = DEMO_SPACE;
  const started = Date.now();
  console.info(`[placard] public-demo : passe en ligne sur « ${scope} »…`);
  const result = await runSweep(ctx, { mode: 'full', scope, maxPages: INLINE_SWEEP_PAGES })
    .catch((error: unknown) => {
      console.info(`[placard] public-demo : passe en ligne échouée — ${String(error)}`);
      return null;
    });
  if (result === null) {
    return {
      scope,
      status: 'erreur',
      pagesScanned: 0,
      foyersTouched: 0,
      honesty: 'Passe en ligne impossible — le curseur de la passe planifiée reste la source de vérité.',
    };
  }
  console.info(
    `[placard] public-demo : passe en ligne pages=${String(result.pagesScanned)} foyers=${String(result.foyersTouched)} angles morts=${String(result.blindSpots.length)} en ${String(Date.now() - started)} ms`,
  );
  for (const spot of result.blindSpots.slice(0, 3)) console.info(`[placard] angle mort : ${spot}`);
  return {
    scope,
    status: result.done ? 'terminée' : 'tranche bornée (passe à reprendre)',
    pagesScanned: result.pagesScanned,
    foyersTouched: result.foyersTouched,
    blindSpots: result.blindSpots.slice(0, 5),
    honesty: `Passe en ligne, ${String(INLINE_SWEEP_PAGES)} pages au maximum (limite du webtrigger).`,
  };
}

/**
 * Sonde les points d'accès Confluence depuis l'identité de l'app : c'est le
 * diagnostic qui a permis de voir que la recherche CQL répond 200 alors que
 * la lecture d'une page répond 401. Le chemin qui répond 200 est celui que le
 * client Confluence doit employer.
 *
 * Chaque résultat porte la **raison précise** du refus (scope manquant,
 * chemin inconnu) : un 401 nu ne dit pas quoi demander à l'administrateur.
 */
async function runProbe(): Promise<unknown> {
  const results = await probeConfluence(allProbePaths(PROBE_PAGE_ID, DEMO_SPACE).map((p) => p.path));
  const labelled = results.map((result) => ({
    ...result,
    scope: scopeForPath(result.path),
    reason: result.status >= 400 ? denyReason(result.path, result.status) : undefined,
  }));
  console.info(`[placard] sonde Confluence : ${JSON.stringify(labelled)}`);
  return labelled;
}

/**
 * Webtrigger public : la chaîne live. `GET` renvoie le JSON public, `OPTIONS`
 * le préflight CORS. Le paramètre `?sweep=1` demande une passe bornée en ligne
 * sur l'espace de démonstration (les données renvoyées sont alors fresh) ;
 * `?queue=<ESPACE>` met une passe en file pour le consumer ; `?probe=1` sonde
 * les points d'accès Confluence (diagnostic).
 */
export async function publicDemoHook(request: WebtriggerRequest): Promise<WebtriggerResponse> {
  if (request.method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS_HEADERS }, body: '' };
  }
  const ctx = await getServiceContext();
  console.info(`[placard] public-demo-hook ${request.method} ${request.path}`);
  try {
    const refresh = await inlineSweep(ctx, request.queryParameters?.['sweep']);
    const payload = await buildPublicPayload(ctx);
    const queued = await queueSweep(request.queryParameters?.['queue']);
    const body: LiveContractPayload & { refresh?: RefreshReport; queued?: string; probe?: unknown } = payload;
    if (refresh !== null) body.refresh = refresh;
    if (queued !== null) body.queued = queued;
    const probe = request.queryParameters?.['probe'];
    if (probe !== undefined && probe[0] !== '0') body.probe = await runProbe();
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, ...CONTRACT_HEADERS, ...CORS_HEADERS },
      body: JSON.stringify(body),
    };
  } catch (error) {
    // Le journal porte le symptôme : l'appel public rend un 500 honestement.
    console.info(`[placard] public-demo : échec — ${String(error)}`);
    return {
      statusCode: 500,
      headers: { ...JSON_HEADERS, ...CONTRACT_HEADERS, ...CORS_HEADERS },
      body: JSON.stringify({
        error: 'charge-utilisable-indisponible',
        honesty: 'La chaîne live n’a pas pu être produite. Rien n’est inventé à la place.',
      }),
    };
  }
}