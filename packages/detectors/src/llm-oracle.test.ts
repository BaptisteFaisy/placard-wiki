import { describe, expect, it, vi } from 'vitest';

import { fakeSuspiciousString, prng } from '@placard/core';

import type { DetectionCandidate } from './types.js';
import { buildQuestion, createCachedOracle, maskSpans } from './llm-oracle.js';
import type { LlmOracle, LlmOracleVerdict } from './llm-oracle.js';

const rand = prng('tests-llm-oracle');
const SECRET = fakeSuspiciousString(rand);
const HMAC_KEY = 'cle-hmac-de-test';

function candidate(overrides: Partial<DetectionCandidate> = {}): DetectionCandidate {
  return {
    family: 'credential-table',
    fingerprint: 'hmac256:00000000000000000000000000000000',
    maskedPreview: '[REDACTED:credential-table](120)',
    charStart: 10,
    charEnd: 20,
    ruleId: 'credential-table-structure',
    confidence: 0.55,
    ambiguous: true,
    isKnownFake: false,
    ...overrides,
  };
}

const VERDICT: LlmOracleVerdict = { isSecret: true, reasonFr: 'runbook opérationnel', confidence: 0.8 };

describe('port LlmOracle — invite masquée et cache', () => {
  it('maskSpans remplace les intervalles : la valeur brute disparaît', () => {
    const text = `le mot de passe est ${SECRET} dans ce runbook`;
    const start = text.indexOf(SECRET);
    const masked = maskSpans(text, [{ charStart: start, charEnd: start + SECRET.length, family: 'connection-string' }]);
    expect(masked).not.toContain(SECRET);
    expect(masked).toContain('[REDACTED:connection-string]');
    expect(masked).toContain('dans ce runbook');
  });

  it('maskSpans gère plusieurs intervalles et ignore les bornes invalides', () => {
    const masked = maskSpans('abcdef', [
      { charStart: 0, charEnd: 2, family: 'x' },
      { charStart: 4, charEnd: 6, family: 'y' },
      { charStart: 3, charEnd: 3, family: 'z' },
    ]);
    expect(masked).toBe('[REDACTED:x]cd[REDACTED:y]');
  });

  it('buildQuestion : empreinte de contenu déterministe, aucune valeur brute', () => {
    const question = buildQuestion(candidate(), 'contexte masqué', HMAC_KEY);
    expect(question.contentFingerprint).toMatch(/^hmac256:[0-9a-f]{32}$/);
    const again = buildQuestion(candidate(), 'contexte masqué', HMAC_KEY);
    expect(again.contentFingerprint).toBe(question.contentFingerprint);
    expect(JSON.stringify(question)).not.toContain(SECRET);
  });

  it('cache par empreinte : deux questions identiques = un seul appel (§14)', async () => {
    const oracle: LlmOracle = vi.fn(async () => VERDICT);
    const cached = createCachedOracle(oracle, { hmacKey: HMAC_KEY });
    const question = buildQuestion(candidate(), 'contexte', HMAC_KEY);
    const first = await cached.ask(question);
    const second = await cached.ask(question);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(oracle).toHaveBeenCalledTimes(1);
    expect(cached.stats()).toEqual({ calls: 1, cacheHits: 1, entries: 1 });
  });

  it('requêtes concurrentes identiques : un seul appel en vol', async () => {
    const oracle: LlmOracle = vi.fn(async () => VERDICT);
    const cached = createCachedOracle(oracle, { hmacKey: HMAC_KEY });
    const question = buildQuestion(candidate(), 'contexte', HMAC_KEY);
    await Promise.all([cached.ask(question), cached.ask(question), cached.ask(question)]);
    expect(oracle).toHaveBeenCalledTimes(1);
  });

  it('contexte différent → empreinte différente → nouvel appel', async () => {
    const oracle: LlmOracle = vi.fn(async () => VERDICT);
    const cached = createCachedOracle(oracle, { hmacKey: HMAC_KEY });
    await cached.ask(buildQuestion(candidate(), 'contexte A', HMAC_KEY));
    await cached.ask(buildQuestion(candidate(), 'contexte B', HMAC_KEY));
    expect(oracle).toHaveBeenCalledTimes(2);
  });

  it('oracle en panne : le candidat reste protégé, jamais deviné (§23)', async () => {
    const oracle: LlmOracle = vi.fn(async (): Promise<LlmOracleVerdict> => {
      throw new Error('LLM indisponible');
    });
    const cached = createCachedOracle(oracle, { hmacKey: HMAC_KEY });
    const answer = await cached.ask(buildQuestion(candidate(), 'contexte', HMAC_KEY));
    expect(answer.isSecret).toBe(true);
    expect(answer.confidence).toBe(0);
    expect(answer.reasonFr).toMatch(/indisponible/);
    // Rien n'est mis en cache : un retry après réparation rappellera l'oracle.
    expect(cached.stats().entries).toBe(0);
  });

  it('le cache est borné (maxEntries) : les plus anciennes empreintes sortent', async () => {
    const oracle: LlmOracle = vi.fn(async () => VERDICT);
    const cached = createCachedOracle(oracle, { hmacKey: HMAC_KEY, maxEntries: 2 });
    for (const context of ['A', 'B', 'C']) {
      await cached.ask(buildQuestion(candidate(), context, HMAC_KEY));
    }
    expect(cached.stats().entries).toBe(2);
  });
});
