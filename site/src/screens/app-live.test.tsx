// Test de fumée LIVE : avec un `fetch` mocké qui répond, l'indicateur
// d'honnêteté doit dire LIVE et le registre doit porter les données du
// flux — pas celles de la démo. Aucun réseau réel ici.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LangProvider } from '../i18n.js';
import { PlacardDataProvider } from '../data/placard-data.js';
import { LiveStatusBanner } from '../components/LiveStatusBanner.js';
import { RegisterScreen } from '../screens/Register.js';
import { fetchLive, resetLiveCache } from '../lib/live.js';

const LIVE_PAYLOAD = {
  generatedAt: '2026-11-12T09:00:00Z',
  mode: 'live',
  site: { name: 'one-atlas-cndz' },
  registry: [
    {
      foyerId: 'LIVE-1',
      family: 'cloud-key',
      maskedPreview: 'AKIA…(20)',
      score: 77,
      state: 'open',
      spaceKey: 'PLACARDDEMO',
      pageTitle: 'Page live du site balayé',
      pageId: 'PLIVE-1',
      locationCount: 1,
      inCurrentVersion: true,
      inHistory: false,
      readersLow: 5,
      readersHigh: 50,
      sharing: 'space-default',
      aiSurface: false,
      lastSeenAt: '2026-11-12T08:00:00Z',
    },
  ],
  building: { wings: [] },
  foyers: {
    'LIVE-1': {
      id: 'LIVE-1',
      fingerprint: 'b'.repeat(64),
      family: 'cloud-key',
      baseScore: 40,
      score: 77,
      scoreTerms: [],
      state: 'open',
      firstSeenAt: '2026-10-01T10:00:00Z',
      lastSeenAt: '2026-11-12T08:00:00Z',
      locations: [],
    },
  },
  budget: {
    day: '2026-11-12',
    pagesScanned: 42,
    attachmentsRead: 2,
    attachmentsSkipped: 0,
    llmCalls: 3,
    tokens: 500,
    costEstimate: 0.2,
    skipped: [],
  },
  coverage: { perGite: [], blindSpots: [], missingRights: [] },
  certificate: {
    id: 'CERT-LIVE',
    scope: 'PLACARDDEMO',
    issuedAt: '2026-11-12T09:00:00Z',
    open: 1,
    rotated: 0,
    redacted: 0,
    purged: 0,
    residualExposure: '—',
    blindSpots: [],
    contentHash: 'sha256:def',
  },
};

/** Un `fetch` mocké qui répond avec la charge utile live. */
const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify(LIVE_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } }),
);

afterEach(() => {
  vi.unstubAllGlobals();
  resetLiveCache();
});

describe('App — chemin live', () => {
  it('l’indicateur dit LIVE et le registre porte les données du flux', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchLive({ url: 'https://exemple.test/live', fetchImpl: fetchMock as unknown as typeof fetch, force: true });
    expect(result.ok).toBe(true);

    const banner = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <LiveStatusBanner />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(banner).toContain('LIVE');
    expect(banner).toContain('one-atlas-cndz');

    const register = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <RegisterScreen onOpenFoyer={() => undefined} />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(register).toContain('Page live du site balayé');
    expect(register).not.toContain('Runbook — déploiement staging');
  });
});
