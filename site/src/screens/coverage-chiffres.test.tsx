// Les chiffres de la couverture, tels que le juge les lit — et pas seulement
// tels que le code les calcule.
//
// Deux défauts réels de la démo publique sont verrouillés ici :
//
// 1. « 81 pages lues · 16 pages visées » : `pagesRead` compte des lectures
//    (page × gîte), `pagesTargeted` des pages — affichés côte à côte, ils
//    donnaient un ratio impossible (506 %). L'écran doit montrer le
//    dénominateur de la méthode (gîtes visés × pages visées).
// 2. « auto-refresh every 2 min » alors que `LIVE_REFRESH_MS` vaut 60 s :
//    le libellé doit être dérivé de la constante, jamais recopié.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LangProvider } from '../i18n.js';
import { PlacardDataProvider } from '../data/placard-data.js';
import { CoverageScreen } from './Coverage.js';
import { LiveStatusBanner } from '../components/LiveStatusBanner.js';
import { fetchLive, resetLiveCache } from '../lib/live.js';
import { LIVE_REFRESH_MS } from '../lib/live-config.js';
import { demoLivePayload } from '../test-fixtures/live-payload.js';

/** La charge utile du flux, avec une couverture qui porte les deux compteurs. */
function payloadWithCoverage(): Record<string, unknown> {
  const base = demoLivePayload();
  return {
    ...base,
    coverage: {
      perGite: [
        { gite: 'corps-de-page', scanned: 39, skipped: 25, pagesRead: 16, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
        { gite: 'commentaires', scanned: 48, skipped: 0, pagesRead: 16, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
        { gite: 'pieces-jointes', scanned: 48, skipped: 0, pagesRead: 16, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
        { gite: 'historique-de-versions', scanned: 68, skipped: 0, pagesRead: 16, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
        { gite: 'modeles-de-page', scanned: 0, skipped: 0, pagesRead: 0, pagesUnread: 0, pagesInaccessible: 0, state: 'not-attempted' },
        { gite: 'titres-et-etiquettes', scanned: 64, skipped: 0, pagesRead: 16, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
        { gite: 'description-espace', scanned: 8, skipped: 0, pagesRead: 1, pagesUnread: 0, pagesInaccessible: 1, state: 'inaccessible' },
      ],
      blindSpots: [],
      missingRights: [],
      coveragePercent: 72.3,
      gitesCovered: 6,
      gitesTotal: 7,
      pagesRead: 81,
      pagesTargeted: 16,
      method: 'Couverture = 81 ÷ (7 × 16) = 72,3 %.',
    },
  };
}

/** Un `fetch` mocké qui sert cette charge utile. */
function coverageFetchMock(): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payloadWithCoverage()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetLiveCache();
});

describe('Écran couverture — les chiffres ne disent pas l’impossible', () => {
  it('affiche le dénominateur de la méthode (gîtes × pages), pas un 81/16', async () => {
    const mock = coverageFetchMock();
    vi.stubGlobal('fetch', mock);
    const result = await fetchLive({ url: 'https://exemple.test/live', fetchImpl: mock, force: true });
    expect(result.ok).toBe(true);

    const html = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <CoverageScreen onGotoBudget={() => undefined} />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(html).toContain('81 reads of 112 targeted (16 pages × 7 hiding places)');
    expect(html).not.toContain('81 pages read');
    expect(html).not.toContain('16 pages targeted');
  });
});

describe('Écran couverture — mode snapshot (hors réseau)', () => {
  it('montre le produit visé (7 × 4 820), jamais 13 471 sur 4 820', async () => {
    // Remet l'état du flux en snapshot (le test précédent l'avait laissé live).
    await fetchLive({ url: '' });
    const html = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <CoverageScreen onGotoBudget={() => undefined} />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(html).toContain('13 471 reads of 33 740 targeted (4 820 pages × 7 hiding places)');
    expect(html).not.toContain('13 471 pages read');
    expect(html).not.toContain('4 820 pages targeted');
  });
});

describe('Bandeau live — la cadence affichée est celle du code', () => {
  it('annonce la période de LIVE_REFRESH_MS, pas un 2 min recopié', async () => {
    const mock = coverageFetchMock();
    vi.stubGlobal('fetch', mock);
    await fetchLive({ url: 'https://exemple.test/live', fetchImpl: mock, force: true });

    const banner = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <LiveStatusBanner />
        </PlacardDataProvider>
      </LangProvider>,
    );
    const minutes = String(Math.round(LIVE_REFRESH_MS / 60_000));
    expect(banner).toContain(`auto-refresh every ${minutes} min`);
    assertNoStaleCadence(banner, minutes);
  });
});

/** Le libellé ne doit plus jamais annoncer une autre cadence que `minutes`. */
function assertNoStaleCadence(banner: string, minutes: string): void {
  const announced = /auto-refresh every (\d+) min/.exec(banner);
  expect(announced).not.toBeNull();
  expect(announced?.[1]).toBe(minutes);
}