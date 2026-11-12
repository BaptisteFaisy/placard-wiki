// Test de fumée LIVE : avec un `fetch` mocké qui répond, l'indicateur
// d'honnêteté doit dire LIVE et le registre doit porter les données du
// flux — pas celles de la démo. Aucun réseau réel ici.
//
// Second cas : une réponse qui ne respecte plus le contrat publié doit
// faire basculer le site sur SNAPSHOT, avec la raison affichée — jamais des
// données incohérentes présentées comme vraies.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LangProvider } from '../i18n.js';
import { PlacardDataProvider } from '../data/placard-data.js';
import { LiveStatusBanner } from '../components/LiveStatusBanner.js';
import { RegisterScreen } from '../screens/Register.js';
import { fetchLive, resetLiveCache } from '../lib/live.js';
import { demoLivePayload } from '../test-fixtures/live-payload.js';

/** Un `fetch` mocké qui répond avec la charge utile live. */
const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify(demoLivePayload()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
);

/** Un `fetch` mocké qui répond avec une charge utile hors contrat. */
const brokenFetchMock = vi.fn(async () => {
  const broken = demoLivePayload();
  delete broken['certificate'];
  return new Response(JSON.stringify(broken), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

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
    expect(banner).toContain('one-atlas-cndz.atlassian.net');

    const register = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <RegisterScreen onOpenFoyer={() => undefined} />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(register).toContain('Runbook de démonstration');
    expect(register).not.toContain('Runbook — déploiement staging');
  });
});

describe('App — contrat live non respecté', () => {
  it('l’indicateur bascule sur SNAPSHOT et donne la raison', async () => {
    vi.stubGlobal('fetch', brokenFetchMock);
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: brokenFetchMock as unknown as typeof fetch,
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contract-mismatch');

    const banner = renderToStaticMarkup(
      <LangProvider>
        <PlacardDataProvider>
          <LiveStatusBanner />
        </PlacardDataProvider>
      </LangProvider>,
    );
    expect(banner).toContain('SNAPSHOT');
    expect(banner).toContain('contract');
  });
});
