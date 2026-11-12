/**
 * Le consumer de balayage long (§14, §19) : exécute une tranche de balayage
 * hors du chemin de l'événement (jusqu'à 900 s), avec reprise sur curseur, et
 * republie la tranche suivante tant que la passe n'est pas terminée.
 */

import { Queue } from '@forge/events';

import { getServiceContext } from './runtime/context';
import { runSweep } from './services/index';

interface ConsumeContext {
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

/** Republie la tranche suivante si la passe n'est pas terminée (§14). */
async function republishIfNeeded(mode: string, scope: string, cursor: string | null): Promise<void> {
  if (cursor === null) return;
  const queue = new Queue({ key: SWEEP_QUEUE });
  await queue.push({ body: { mode, scope, cursor } });
}

export async function sweepConsumer({ payload }: ConsumeContext): Promise<void> {
  const scope = str(payload, 'scope', 'site');
  const modeRaw = str(payload, 'mode', 'incremental');
  const mode = (modeRaw === 'full' || modeRaw === 'on-demand' ? modeRaw : 'incremental') as
    | 'incremental' | 'full' | 'on-demand';
  const cursor = typeof payload?.['cursor'] === 'string' ? payload['cursor'] : undefined;
  console.info(`[placard] sweep-consumer scope=${scope} mode=${mode}`);
  const ctx = getServiceContext();
  const result = await runSweep(ctx, { mode, scope, cursor, maxPages: 100 });
  console.info(
    `[placard] tranche terminée pages=${String(result.pagesScanned)} foyers=${String(result.foyersTouched)} done=${String(result.done)}`,
  );
  await republishIfNeeded(mode, scope, result.nextCursor);
}