// Tests du client live : succès → live, délai dépassé → snapshot + raison,
// forme invalide → snapshot. Le `fetch` est MOCKÉ — aucun réseau ici.

import { describe, expect, it } from 'vitest';
import { fetchLive, parseLivePayload, resetLiveCache } from './live.js';
import type { LivePayload } from './live.js';

/** Réponse minimale conforme au contrat du webtrigger. */
const VALID_PAYLOAD = {
  generatedAt: '2026-11-12T09:00:00Z',
  mode: 'live',
  site: { name: 'one-atlas-cndz', url: 'https://one-atlas-cndz.atlassian.net' },
  registry: [
    {
      foyerId: 'F-1',
      family: 'cloud-key',
      maskedPreview: 'AKIA…(20)',
      score: 95,
      state: 'open',
      spaceKey: 'PLACARDDEMO',
      pageTitle: 'Runbook',
      pageId: 'P-1',
      locationCount: 2,
      inCurrentVersion: true,
      inHistory: false,
      readersLow: 10,
      readersHigh: 90,
      sharing: 'space-default',
      aiSurface: true,
      lastSeenAt: '2026-11-12T08:00:00Z',
    },
  ],
  building: { wings: [] },
  foyers: {
    'F-1': {
      id: 'F-1',
      fingerprint: 'a'.repeat(64),
      family: 'cloud-key',
      baseScore: 40,
      score: 95,
      scoreTerms: [],
      state: 'open',
      firstSeenAt: '2026-06-18T10:00:00Z',
      lastSeenAt: '2026-11-12T08:00:00Z',
      locations: [],
    },
  },
  budget: {
    day: '2026-11-12',
    pagesScanned: 12,
    attachmentsRead: 1,
    attachmentsSkipped: 0,
    llmCalls: 2,
    tokens: 100,
    costEstimate: 0.1,
    skipped: [],
  },
  coverage: { perGite: [], blindSpots: [], missingRights: [] },
  certificate: {
    id: 'CERT-1',
    scope: 'PLACARDDEMO',
    issuedAt: '2026-11-12T09:00:00Z',
    open: 1,
    rotated: 0,
    redacted: 0,
    purged: 0,
    residualExposure: '—',
    blindSpots: [],
    contentHash: 'sha256:abc',
  },
};

/** Un `fetch` mocké qui répond avec le contrat attendu. */
function okFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

/** Un `fetch` mocké qui ne répond jamais — le timeout doit trancher. */
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
}

describe('fetchLive — succès', () => {
  it('une réponse conforme donne le statut live et la charge utile', async () => {
    resetLiveCache();
    const result = await fetchLive({ url: 'https://exemple.test/live', fetchImpl: okFetch(VALID_PAYLOAD), force: true });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.payload?.mode).toBe('live');
    expect(result.payload?.registry).toHaveLength(1);
    expect(result.payload?.foyers['F-1']?.id).toBe('F-1');
  });
});

describe('fetchLive — échec', () => {
  it('un délai dépassé bascule sur snapshot et donne la raison', async () => {
    resetLiveCache();
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: hangingFetch(),
      timeoutMs: 10,
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
    expect(result.payload).toBeNull();
  });

  it('une forme invalide bascule sur snapshot et donne la raison', async () => {
    resetLiveCache();
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: okFetch({ mode: 'live', generatedAt: '2026-11-12T09:00:00Z' }),
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-shape');
    expect(result.payload).toBeNull();
  });

  it('une URL absente donne la raison « not-configured »', async () => {
    resetLiveCache();
    const result = await fetchLive({ url: '', fetchImpl: okFetch(VALID_PAYLOAD), force: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-configured');
  });
});

describe('parseLivePayload — validation minimale de forme', () => {
  it('accepte une charge utile conforme', () => {
    const payload = parseLivePayload(VALID_PAYLOAD);
    expect(payload).not.toBeNull();
    expect(payload?.site.name).toBe('one-atlas-cndz');
  });

  it('refuse un mode autre que live', () => {
    expect(parseLivePayload({ ...VALID_PAYLOAD, mode: 'snapshot' })).toBeNull();
  });

  it('refuse une charge utile sans les clés attendues', () => {
    expect(parseLivePayload({ mode: 'live' })).toBeNull();
    expect(parseLivePayload(null)).toBeNull();
    expect(parseLivePayload('pas un objet')).toBeNull();
  });

  it('tolère un site sans métadonnées', () => {
    const payload = parseLivePayload({ ...VALID_PAYLOAD, site: {} }) as LivePayload;
    expect(payload.site.name).toBeUndefined();
  });

  it('tolère un site donné comme un simple nom', () => {
    const payload = parseLivePayload({ ...VALID_PAYLOAD, site: 'one-atlas-cndz' }) as LivePayload;
    expect(payload.site.name).toBe('one-atlas-cndz');
  });

  it('tolère les foyers en liste et le registre en table', () => {
    const foyers = Object.values(VALID_PAYLOAD.foyers);
    const payload = parseLivePayload({
      ...VALID_PAYLOAD,
      foyers,
      registry: { 'F-1': VALID_PAYLOAD.registry[0] },
    }) as LivePayload;
    expect(Object.keys(payload.foyers)).toEqual(['F-1']);
    expect(payload.registry).toHaveLength(1);
    expect(payload.registry[0]?.foyerId).toBe('F-1');
  });
});
