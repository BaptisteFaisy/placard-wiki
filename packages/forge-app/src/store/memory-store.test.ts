/**
 * Tests du store en mémoire (§20) : aller-retour foyer/emplacements, filtres
 * du registre, exposition et curseur. Aucune valeur brute, aucun `@forge/sql`.
 */

import { describe, expect, it } from 'vitest';

import { giteOf } from '@placard-wiki/domain';
import type { Foyer, FoyerLocation } from '@placard-wiki/domain';

import { createMemoryStore } from './memory-store';

function location(id: string, pageId: string): FoyerLocation {
  return {
    id, foyerId: 'foyer-1', containerType: 'page', containerAri: `ari:page/${pageId}`,
    pageId, field: 'body', maskedPreview: 'AKIA…(20)', detectedAt: '2026-11-09T08:00:00.000Z',
    status: 'present', gite: giteOf('page', 'body'),
  };
}

function foyer(): Foyer {
  return {
    id: 'foyer-1',
    fingerprint: 'hmac256:0123456789abcdef0123456789abcdef',
    family: 'cloud-key',
    baseScore: 55,
    score: 85,
    scoreTerms: [{ id: 'base-family', points: 55, label: 'Base', method: 'barème §8' }],
    state: 'open',
    firstSeenAt: '2026-11-01T08:00:00.000Z',
    lastSeenAt: '2026-11-09T08:00:00.000Z',
    locations: [location('loc-1', '1001')],
    primaryPageId: '1001',
  };
}

describe('store en mémoire (§20)', () => {
  it('fait l’aller-retour d’un foyer et de ses emplacements', async () => {
    const store = createMemoryStore();
    await store.saveFoyer(foyer());
    const loaded = await store.getFoyer('foyer-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.fingerprint).toBe('hmac256:0123456789abcdef0123456789abcdef');
    expect(loaded?.locations).toHaveLength(1);
    expect(loaded?.locations[0]?.maskedPreview).toBe('AKIA…(20)');
  });

  it('retrouve un foyer par son empreinte', async () => {
    const store = createMemoryStore();
    await store.saveFoyer(foyer());
    const byFp = await store.findings.byFingerprint('hmac256:0123456789abcdef0123456789abcdef');
    expect(byFp?.id).toBe('foyer-1');
  });

  it('filtre le registre par score minimal et par état', async () => {
    const store = createMemoryStore();
    await store.saveFoyer(foyer());
    const high = await store.listFoyers({ minScore: 90, limit: 10 });
    expect(high).toHaveLength(0);
    const open = await store.listFoyers({ state: 'open', limit: 10 });
    expect(open).toHaveLength(1);
  });

  it('rehydrate l’espace depuis l’exposition de la page principale', async () => {
    const store = createMemoryStore();
    await store.exposures.put({
      pageId: '1001', spaceKey: 'DEMO',
      readers: { low: 1, high: 5, method: 'm', caveats: [] },
      sharing: 'space-default', restrictions: [],
      aiSurface: { presumedIndexed: true, hypothesis: true, method: 'm' },
      computedAt: '2026-11-11T00:00:00.000Z',
    });
    await store.saveFoyer(foyer());
    const loaded = await store.getFoyer('foyer-1');
    expect(loaded?.spaceKey).toBe('DEMO');
  });

  it('persiste et relit un curseur de balayage (§14)', async () => {
    const store = createMemoryStore();
    await store.cursors.put({ scope: 'site', mode: 'incremental', lastModifiedAt: '2026-11-11T00:00:00.000Z' });
    const cursor = await store.cursors.get('site', 'incremental');
    expect(cursor?.lastModifiedAt).toBe('2026-11-11T00:00:00.000Z');
  });
});