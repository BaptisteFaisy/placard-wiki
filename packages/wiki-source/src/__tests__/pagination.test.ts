/**
 * Tests de pagination et de reprise (§14) : le balayage borné s'arrête,
 * se sérialise et repart exactement là où il en était — sans doublon ni trou.
 */

import { describe, expect, it } from 'vitest';

import { createFixtureClient, loadFixtureData } from '../fixture-client';
import { cqlFullTranche, cqlIncremental, cqlOnDemandPage, cqlQuote, searchPaginated } from '../cql';
import { deserializeCursor, serializeCursor, toSweepCursor } from '../cursor';
import { paginate } from '../cursor';

const client = createFixtureClient(loadFixtureData());

async function collect(gen: AsyncGenerator<{ items: Array<{ id: string }> }>): Promise<string[]> {
  const ids: string[] = [];
  for await (const batch of gen) ids.push(...batch.items.map((i) => i.id));
  return ids;
}

describe('CQL — les trois régimes (§14)', () => {
  it('incrémental : borne de date échappée et format CQL', () => {
    const cql = cqlIncremental('2026-11-05T00:00:00.000Z', 'RUN');
    expect(cql).toContain('space = "RUN"');
    expect(cql).toContain('lastModified >= "2026-11-05 00:00"');
  });

  it('complet par tranches : tri stable par identifiant pour la reprise', () => {
    expect(cqlFullTranche('RUN')).toBe('space = "RUN" AND type = page ORDER BY id ASC');
  });

  it('à la demande : une page, un espace', () => {
    expect(cqlOnDemandPage('1002')).toBe('id = "1002"');
  });

  it('échappe les guillemets — aucune injection dans la requête', () => {
    expect(cqlQuote('ti"tre')).toBe('"ti\\"tre"');
  });

  it('incrémental : seules les pages modifiées depuis le curseur remontent', async () => {
    const ids = await collect(searchPaginated(client, cqlIncremental('2026-11-05T00:00:00.000Z', 'RUN')));
    expect(ids).toEqual(['1003', '1004', '1005']);
  });
});

describe('pagination et reprise', () => {
  it('page par page jusqu’à épuisement, sans doublon', async () => {
    const ids = await collect(searchPaginated(client, cqlFullTranche('RUN'), { limit: 2 }));
    expect(ids).toEqual(['1001', '1002', '1003', '1004', '1005']);
  });

  it('le curseur avance à chaque lot et se sérialise', async () => {
    const cursors: string[] = [];
    const gen = searchPaginated(client, cqlFullTranche('RUN'), { limit: 2 });
    for await (const batch of gen) cursors.push(serializeCursor(batch.cursor));
    expect(cursors).toHaveLength(3);
    expect(deserializeCursor(cursors[0])!.start).toBe(2);
    expect(deserializeCursor(cursors[2])!.done).toBe(true);
  });

  it('reprise : repartir du curseur sérialisé saute les lots déjà lus', async () => {
    const gen1 = searchPaginated(client, cqlFullTranche('RUN'), { limit: 2 });
    const step = await gen1.next();
    const first = step.value as { items: Array<{ id: string }>; cursor: ReturnType<typeof deserializeCursor> };
    expect(first.items.map((i) => i.id)).toEqual(['1001', '1002']);
    await gen1.return(undefined);

    const from = deserializeCursor(serializeCursor(first.cursor));
    const rest = await collect(searchPaginated(client, cqlFullTranche('RUN'), { limit: 2, from }));
    expect(rest).toEqual(['1003', '1004', '1005']);
  });

  it('balayage borné : maxItems arrête la passe en cours de route', async () => {
    const ids = await collect(searchPaginated(client, cqlFullTranche('RUN'), { limit: 2, maxItems: 3 }));
    expect(ids).toEqual(['1001', '1002', '1003']);
  });

  it('curseur corrompu : on repart du début, jamais de plantage', () => {
    expect(deserializeCursor('{invalide').start).toBe(0);
    expect(deserializeCursor(undefined).done).toBe(false);
    expect(deserializeCursor('{"start":-3}').start).toBe(0);
  });

  it('le curseur du domaine (SweepCursor) porte le dernier identifiant vu', async () => {
    const batches = await paginate(
      async (start, limit) => ({
        items: [{ id: `p-${start}` }, { id: `p-${start + 1}` }].slice(0, limit),
        nextStart: start < 2 ? start + limit : undefined,
      }),
      { limit: 2 },
    ).next();
    const sweep = toSweepCursor('RUN', 'full', batches.value!.cursor, '2026-11-10T08:00:00.000Z');
    expect(sweep.scope).toBe('RUN');
    expect(sweep.lastPageId).toBe('p-1');
  });
});
