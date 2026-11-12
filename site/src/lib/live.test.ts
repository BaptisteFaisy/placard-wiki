// Tests du client live : succès → live, délai dépassé → snapshot + raison,
// contrat non respecté → snapshot + raison. Le `fetch` est MOCKÉ — aucun
// réseau ici.
//
// Le point dur : la réponse live est validée contre le contrat publié
// (`docs/api-live.schema.json`). Une réponse qui ne le respecte pas n'est
// JAMAIS affichée comme si elle était valide.

import { describe, expect, it } from 'vitest';
import { fetchLive, parseLivePayload, resetLiveCache } from './live.js';
import { checkContract, EXPECTED_CONTRACT_VERSION } from './contract.js';
import { demoLivePayload } from '../test-fixtures/live-payload.js';

/** Un `fetch` mocké qui répond avec le contrat attendu. */
function okFetch(payload: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
    })) as unknown as typeof fetch;
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
    const result = await fetchLive({ url: 'https://exemple.test/live', fetchImpl: okFetch(demoLivePayload()), force: true });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.payload?.mode).toBe('live');
    expect(result.payload?.registry).toHaveLength(1);
    expect(result.payload?.foyers['foyer-hmac256:01234567']?.id).toBe('foyer-hmac256:01234567');
  });

  it('une réponse conforme et annoncée par l’en-tête de version est acceptée', async () => {
    resetLiveCache();
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: okFetch(demoLivePayload(), { 'X-Placard-Contract': EXPECTED_CONTRACT_VERSION }),
      force: true,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
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
      fetchImpl: okFetch('pas un objet'),
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-shape');
    expect(result.payload).toBeNull();
  });

  it('une URL absente donne la raison « not-configured »', async () => {
    resetLiveCache();
    const result = await fetchLive({ url: '', fetchImpl: okFetch(demoLivePayload()), force: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-configured');
  });
});

describe('fetchLive — contrat non respecté', () => {
  it('une réponse hors contrat bascule sur snapshot et donne la raison', async () => {
    resetLiveCache();
    const broken = demoLivePayload();
    delete broken['certificate'];
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: okFetch(broken),
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contract-mismatch');
    expect(result.payload).toBeNull();
  });

  it('une clé inconnue dans la réponse est refusée', async () => {
    resetLiveCache();
    const broken = { ...demoLivePayload(), surprise: 'champ non décrit' };
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: okFetch(broken),
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contract-mismatch');
  });

  it('une version d’en-tête inconnue est refusée', async () => {
    resetLiveCache();
    const result = await fetchLive({
      url: 'https://exemple.test/live',
      fetchImpl: okFetch(demoLivePayload(), { 'X-Placard-Contract': '99.0.0' }),
      retries: 0,
      force: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contract-mismatch');
  });
});

describe('parseLivePayload — contrôle du contrat', () => {
  it('accepte une charge utile conforme', () => {
    const payload = parseLivePayload(demoLivePayload());
    expect(payload).not.toBeNull();
    expect(payload?.site.name).toBe('one-atlas-cndz.atlassian.net');
  });

  it('refuse un mode autre que live', () => {
    expect(parseLivePayload({ ...demoLivePayload(), mode: 'snapshot' })).toBeNull();
  });

  it('refuse une charge utile sans les clés attendues', () => {
    expect(parseLivePayload({ mode: 'live' })).toBeNull();
    expect(parseLivePayload(null)).toBeNull();
    expect(parseLivePayload('pas un objet')).toBeNull();
  });

  it('refuse un site sans les métadonnées exigées par le contrat', () => {
    expect(parseLivePayload({ ...demoLivePayload(), site: {} })).toBeNull();
  });

  it('refuse les foyers et le registre sous une forme non contractuelle', () => {
    const payload = demoLivePayload();
    const foyers = Object.values(payload['foyers'] as Record<string, unknown>);
    const broken = { ...payload, foyers, registry: { 'foyer-hmac256:01234567': (payload['registry'] as unknown[])[0] } };
    expect(parseLivePayload(broken)).toBeNull();
  });

  it('refuse une famille hors énumération', () => {
    const payload = demoLivePayload();
    const registry = payload['registry'] as Array<Record<string, unknown>>;
    const broken = { ...payload, registry: [{ ...registry[0], family: 'famille-inventee' }] };
    expect(parseLivePayload(broken)).toBeNull();
  });

  it('refuse un état de foyer hors énumération', () => {
    const payload = demoLivePayload();
    const foyers = payload['foyers'] as Record<string, Record<string, unknown>>;
    const first = Object.keys(foyers)[0] as string;
    const broken = { ...payload, foyers: { [first]: { ...foyers[first], state: 'etat-invente' } } };
    expect(parseLivePayload(broken)).toBeNull();
  });
});

describe('checkContract — en-tête et corps', () => {
  it('un en-tête absent laisse le corps faire foi', () => {
    expect(checkContract(demoLivePayload(), null).ok).toBe(true);
    expect(checkContract(demoLivePayload(), undefined).ok).toBe(true);
  });

  it('un en-tête égal à la version attendue est accepté', () => {
    expect(checkContract(demoLivePayload(), EXPECTED_CONTRACT_VERSION).ok).toBe(true);
  });

  it('un en-tête contradictoire est refusé avec la raison', () => {
    const verdict = checkContract(demoLivePayload(), '0.9.0');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.detail).toContain('0.9.0');
  });
});
