/**
 * Curseur de pagination et reprise (§14) — un balayage borné s'arrête et
 * repart exactement là où il en était. Le curseur sérialisé s'appuie sur
 * `SweepCursor` du domaine : porté par le bridge (`sweep/start`), persisté par
 * l'app, jamais réinventé ici.
 */

import type { SweepCursor } from '@placard-wiki/domain';

/** Curseur de pagination : offset + dernier identifiant vu (reprise stable). */
export interface PageCursor {
  /** Prochain `start` CQL — 0 au premier lot. */
  start: number;
  /** Dernier identifiant traité, pour détecter les doublons de reprise. */
  lastId?: string;
  /** Lot terminé : plus rien à demander. */
  done: boolean;
}

export const INITIAL_CURSOR: PageCursor = { start: 0, done: false };

/** Un lot paginé — ce que `searchCql` et tout lecteur paginé renvoient. */
export interface Batch<T> {
  items: T[];
  nextStart?: number;
}

/**
 * Pagine jusqu'à épuisement ou jusqu'à `maxItems` (balayage borné, §14).
 * Reprise : passer `from` = curseur sérialisé d'une exécution interrompue.
 * YIELD le curseur après chaque lot pour que l'appelant puisse le persister.
 */
export async function* paginate<T>(
  fetchBatch: (start: number, limit: number) => Promise<Batch<T>>,
  options: { limit?: number; maxItems?: number; from?: PageCursor } = {},
): AsyncGenerator<{ items: T[]; cursor: PageCursor }> {
  const limit = options.limit ?? 25;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  let cursor: PageCursor = options.from ?? INITIAL_CURSOR;
  let emitted = 0;
  while (!cursor.done && emitted < maxItems) {
    const batch = await fetchBatch(cursor.start, Math.min(limit, maxItems - emitted));
    emitted += batch.items.length;
    const last = batch.items[batch.items.length - 1];
    cursor = {
      start: batch.nextStart ?? cursor.start + batch.items.length,
      lastId: idOf(last) ?? cursor.lastId,
      done: batch.nextStart === undefined || batch.items.length === 0,
    };
    yield { items: batch.items, cursor };
  }
}

function idOf(item: unknown): string | undefined {
  if (item !== null && typeof item === 'object' && 'id' in item) {
    return String((item as { id: unknown }).id);
  }
  return undefined;
}

/** Sérialise le curseur dans le `SweepCursor` du domaine (persisté par l'app). */
export function toSweepCursor(scope: string, mode: SweepCursor['mode'], cursor: PageCursor, runAt: string): SweepCursor {
  return {
    scope,
    mode,
    lastPageId: cursor.lastId,
    lastModifiedAt: runAt,
    runAt,
  };
}

/** Sérialisation JSON du curseur de pagination (stockage Entity/SQL côté app). */
export function serializeCursor(cursor: PageCursor): string {
  return JSON.stringify(cursor);
}

/** Désérialisation tolérante : toute valeur invalide repart du curseur initial. */
export function deserializeCursor(raw: string | undefined | null): PageCursor {
  if (raw === undefined || raw === null || raw === '') return INITIAL_CURSOR;
  try {
    const parsed = JSON.parse(raw) as Partial<PageCursor>;
    if (typeof parsed.start !== 'number' || parsed.start < 0) return INITIAL_CURSOR;
    return { start: parsed.start, lastId: parsed.lastId, done: parsed.done === true };
  } catch {
    return INITIAL_CURSOR;
  }
}
