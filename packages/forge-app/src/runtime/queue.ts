/**
 * La file de balayage long (§19) — **un seul endroit la connaît**.
 *
 * Trois modules y pousseront (le déclencheur planifié, le consumer, le
 * webtrigger public) : la clé de la file, la forme du corps et la **raison
 * d'un refus** sont donc définis ici, une fois.
 *
 * Mesuré le 13 novembre 2026 : `Queue.push` répond **400** en production
 * (`mise en file impossible — curseur conservé`). Le refus était avalé : la
 * cause disparaissait. Ici, un refus est **décrit** (statut + message) puis
 * rendu à l'appelant, qui décide — jamais de trou silencieux.
 */

import { Queue } from '@forge/events';

/** Clé de la file de balayage (déclarée par le module `consumer`). */
export const SWEEP_QUEUE = 'pw-sweep-queue';

/** Ce qu'on met sur la file : le régime, la portée, le curseur. */
export interface SweepEvent {
  /** Régime de la passe : incrémental, complet, ou à la demande. */
  mode: 'incremental' | 'full' | 'on-demand';
  /** Portée : clé d'espace, ou `site` pour le site entier. */
  scope: string;
  /** Curseur sérialisé, quand la passe reprend où elle s'était arrêtée. */
  cursor?: string | null;
}

/** Résultat d'une mise en file : réussie, ou refusée avec sa raison. */
export type QueuePushResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Décrit un refus de la file : le statut quand l'API le donne, le message
 * quand il y en a un. Aucune donnée sensible n'est journalisée — c'est un
 * refus de plateforme, pas un contenu.
 */
export function describeQueueError(erreur: unknown): string {
  if (erreur instanceof Error) {
    const brut = erreur as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
    const statut = [brut.status, brut.statusCode, brut.response?.status].find((v) => typeof v === 'number');
    // Le SDK Forge ne met pas toujours le statut dans une propriété : il est
    // parfois seulement dans le message (« 400 Bad Request »).
    const dansMessage = /^(\d{3})\b/.exec(erreur.message);
    const code = typeof statut === 'number'
      ? `statut ${String(statut)}`
      : dansMessage !== null
        ? `statut ${dansMessage[1]}`
        : 'statut inconnu';
    return `${code} · ${erreur.message}`;
  }
  return `erreur inconnue : ${String(erreur)}`;
}

/** Pousse un événement de balayage sur la file, sans jamais lever. */
export async function pushSweepEvent(evenement: SweepEvent): Promise<QueuePushResult> {
  const body: Record<string, unknown> = { mode: evenement.mode, scope: evenement.scope };
  if (evenement.cursor !== undefined && evenement.cursor !== null) body['cursor'] = evenement.cursor;
  try {
    await new Queue({ key: SWEEP_QUEUE }).push({ body });
    return { ok: true };
  } catch (erreur) {
    return { ok: false, reason: describeQueueError(erreur) };
  }
}
