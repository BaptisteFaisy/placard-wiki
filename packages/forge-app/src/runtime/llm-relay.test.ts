/**
 * Le relais LLM — le contrat, sans réseau.
 *
 * Ce que ces tests verrouillent :
 *   1. sans variable, l'app **n'essaie rien** (pas de sortie réseau) ;
 *   2. avec variable, un seul appel, au bon hôte, avec le jeton de service ;
 *   3. un relais qui refuse ou tombe ne casse rien : `null`, et l'appelant
 *      décide du repli (le LLM hébergé de Forge) — jamais une exception.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@forge/api', () => ({ fetch: (url: string, init?: unknown) => fetchMock(url, init) }));

const { RELAY_TOKEN_VARIABLE, RELAY_URL_VARIABLE, askRelay, relayConfigured } = await import('./llm-relay.js');

/** Une réponse OpenAI minimale. */
function reponseOpenAI(contenu: string): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: contenu } }], usage: { total_tokens: 12 } }),
  };
}

/** Pose les variables Forge comme le runtime les injecte. */
function poserVariables(valeurs: Record<string, string>): void {
  process.env['FORGE_VARIABLES'] = JSON.stringify(valeurs);
}

afterEach(() => {
  fetchMock.mockReset();
  delete process.env['FORGE_VARIABLES'];
  delete process.env[RELAY_URL_VARIABLE];
  delete process.env[RELAY_TOKEN_VARIABLE];
});

describe('relais LLM — configuration', () => {
  it('sans variable, il n’y a rien à appeler', async () => {
    expect(relayConfigured()).toBe(false);
    expect(await askRelay('système', 'question')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('une URL qui n’est pas en HTTPS n’est pas acceptée', () => {
    poserVariables({ [RELAY_URL_VARIABLE]: 'http://r630-debian.tail3a8bdf.ts.net/placard-llm', [RELAY_TOKEN_VARIABLE]: 'jeton' });
    expect(relayConfigured()).toBe(false);
  });
});

describe('relais LLM — appel', () => {
  it('appelle le relais avec le jeton de service et rend le texte', async () => {
    poserVariables({ [RELAY_URL_VARIABLE]: 'https://r630-debian.tail3a8bdf.ts.net/placard-llm', [RELAY_TOKEN_VARIABLE]: 'jeton-service' });
    fetchMock.mockResolvedValue(reponseOpenAI('{"isSecret":true}'));

    expect(relayConfigured()).toBe(true);
    const reponse = await askRelay('système', 'question');
    expect(reponse).toEqual({ text: '{"isSecret":true}', tokens: 12 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://r630-debian.tail3a8bdf.ts.net/placard-llm/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer jeton-service');
    expect(JSON.parse(init.body).messages).toHaveLength(2);
  });

  it('un refus du relais rend null, sans exception', async () => {
    poserVariables({ [RELAY_URL_VARIABLE]: 'https://r630-debian.tail3a8bdf.ts.net/placard-llm', [RELAY_TOKEN_VARIABLE]: 'jeton-service' });
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await askRelay('système', 'question')).toBeNull();
  });

  it('un relais qui tombe rend null, sans exception', async () => {
    poserVariables({ [RELAY_URL_VARIABLE]: 'https://r630-debian.tail3a8bdf.ts.net/placard-llm', [RELAY_TOKEN_VARIABLE]: 'jeton-service' });
    fetchMock.mockRejectedValue(new Error('réseau'));
    expect(await askRelay('système', 'question')).toBeNull();
  });

  it('une réponse vide rend null (jamais un verdict vide lu comme vrai)', async () => {
    poserVariables({ [RELAY_URL_VARIABLE]: 'https://r630-debian.tail3a8bdf.ts.net/placard-llm', [RELAY_TOKEN_VARIABLE]: 'jeton-service' });
    fetchMock.mockResolvedValue(reponseOpenAI(''));
    expect(await askRelay('système', 'question')).toBeNull();
  });
});
