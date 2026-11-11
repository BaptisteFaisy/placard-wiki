/**
 * Webtrigger : demandes de purge groupées à l'administrateur du site (§9,
 * étape 3). Quand l'API ne permet pas de purger une version, ou que les droits
 * manquent, l'app produit la demande exacte (page, numéro de version,
 * empreinte) — et le foyer reste ouvert. Dire « on ne peut pas » fait partie
 * du produit (§5).
 *
 * GET  → liste les demandes de purge en attente (`requested`).
 * POST → marque des demandes comme reconnues (`acknowledged`).
 *
 * ⚠ L'authentification de l'administrateur (pont signé) est **à valider
 * semaine 1** (§22) ; en l'état le hook répond sur le canal webtrigger déclaré
 * au manifeste (`pw-purge-request`).
 */

import { getServiceContext } from './runtime/context.js';
import type { ServiceContext } from './services/ports.js';

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
  const ctx = getServiceContext();
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