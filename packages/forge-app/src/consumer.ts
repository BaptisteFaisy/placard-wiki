/**
 * Le consumer de balayage long (§14, §19) : exécute une tranche de balayage
 * hors du chemin de l'événement (jusqu'à 900 s), avec reprise sur curseur, et
 * republie la tranche suivante tant que la passe n'est pas terminée.
 */

import { Queue } from '@forge/events';

import { getServiceContext } from './runtime/context';
import { runSweep } from './services/index';

interface ConsumeContext {
  /**
   * Mesuré le 12 novembre 2026 : le consumer reçoit un **AsyncEvent**
   * (`{ body, ... }`) — le corps poussé par `Queue.push({ body })`. L'ancienne
   * forme `{ payload }` n'était jamais remplie : la tranche revenait toujours
   * en mode `incremental` sur le scope `site`.
   */
  body?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  accountId?: string;
}

/** File de balayage (§19 : module `consumer`, queue `pw-sweep-queue`). */
const SWEEP_QUEUE = 'pw-sweep-queue';

function str(payload: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = payload?.[key];
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** Corps de l'événement : `body` (forme mesurée) avec repli sur `payload`. */
function eventBody(event: ConsumeContext): Record<string, unknown> {
  if (event.body !== undefined) return event.body;
  if (event.payload !== undefined) return event.payload;
  return {};
}

/** Republie la tranche suivante si la passe n'est pas terminée (§14). */
async function republishIfNeeded(mode: string, scope: string, cursor: string | null): Promise<void> {
  if (cursor === null) return;
  try {
    const queue = new Queue({ key: SWEEP_QUEUE });
    await queue.push({ body: { mode, scope, cursor } });
  } catch {
    // La file n'est pas disponible (déploiement sans consumer actif) : la
    // tranche est perdue, mais le curseur est persisté — la passe reprendra au
    // prochain déclencheur planifié. Déclaré, jamais masqué (§19).
    console.info('[placard] consumer : republication impossible — curseur conservé, reprise au prochain passage.');
  }
}

/** Exécute une tranche de balayage (le corps de l'AsyncEvent). */
export async function consume(event: ConsumeContext): Promise<void> {
  const payload = eventBody(event);
  const scope = str(payload, 'scope', 'site');
  const modeRaw = str(payload, 'mode', 'incremental');
  const mode = (modeRaw === 'full' || modeRaw === 'on-demand' ? modeRaw : 'incremental') as
    | 'incremental' | 'full' | 'on-demand';
  const cursor = typeof payload['cursor'] === 'string' ? payload['cursor'] : undefined;
  console.info(`[placard] sweep-consumer scope=${scope} mode=${mode}`);
  const ctx = await getServiceContext();
  const result = await runSweep(ctx, { mode, scope, cursor, maxPages: 100 });
  console.info(
    `[placard] tranche terminée pages=${String(result.pagesScanned)} foyers=${String(result.foyersTouched)} done=${String(result.done)}`,
  );
  await republishIfNeeded(mode, scope, result.nextCursor);
}

/**
 * Résolveur du module `consumer`. Le manifeste appelle la **méthode**
 * `consume` de cette fonction (`resolver: { function, method }`) : l'export
 * doit donc être un objet de méthodes, pas une fonction nue.
 */
export const sweepConsumer = { consume };