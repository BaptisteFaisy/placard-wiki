// Tests de l'exécuteur MCP simulé : les refus DOIVENT venir du vrai paquet
// `@placard-wiki/ritual` (agent refusé, verrou sans attestation, raison vide).

import { describe, expect, it } from 'vitest';
import { REFUSAL_AGENT } from '@placard-wiki/ritual/src/attestation.js';
import { REFUSAL_NO_ATTESTATION } from '@placard-wiki/ritual/src/redaction.js';
import { REFUSAL_NO_REASON } from '@placard-wiki/ritual/src/ribbon.js';
import { FOYERS } from '../data/demo.js';
import { newSession, runTool } from './mcp-run.js';
import type { McpSession } from './mcp-run.js';

/** Réponse comme objet JSON (les réponses de l'exécuteur le sont toujours). */
function asObject(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('runTool — verrous réels du rituel', () => {
  it('record-rotation REFUSE un acteur agent (vrai REFUSAL_AGENT)', async () => {
    const session: McpSession = newSession();
    const out = asObject(await runTool('record-rotation', { findingId: 'F-1', provider: 'AWS', evidenceRef: 'JIRA SEC-417' }, 'agent', session));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(REFUSAL_AGENT);
    expect(Object.keys(session.attestations)).toHaveLength(0);
  });

  it('record-rotation accepte une personne et pose l’attestation en session', async () => {
    const session: McpSession = newSession();
    const out = asObject(await runTool('record-rotation', { findingId: 'F-1', provider: 'AWS', evidenceRef: 'JIRA SEC-417' }, 'human', session));
    expect(out.ok).toBe(true);
    expect(session.attestations['F-1']).toBeDefined();
  });

  it('apply-redaction est VERROUILLÉ sans attestation (vrai REFUSAL_NO_ATTESTATION)', async () => {
    const out = asObject(await runTool('apply-redaction', { findingId: 'F-1', approvedBy: '5f2a…dile', comment: '' }, 'human', newSession()));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(REFUSAL_NO_ATTESTATION);
  });

  it('apply-redaction passe après une attestation humaine, au nom de la personne', async () => {
    const session: McpSession = newSession();
    await runTool('record-rotation', { findingId: 'F-1', provider: 'AWS', evidenceRef: 'JIRA SEC-417' }, 'human', session);
    const out = asObject(await runTool('apply-redaction', { findingId: 'F-1', approvedBy: '5f2a…dile', comment: '' }, 'human', session));
    expect(out.ok).toBe(true);
    expect(out.asUser).toBe('5f2a…dile');
    expect(Number(out.applied)).toBeGreaterThan(0);
  });

  it('dismiss-finding refuse une raison vide (vrai REFUSAL_NO_REASON)', async () => {
    const out = asObject(await runTool('dismiss-finding', { findingId: 'F-5', reason: '', reviewAt: '2026-12-01T09:00:00Z' }, 'human', newSession()));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(REFUSAL_NO_REASON);
  });
});

describe('runTool — lectures sur le jeu de démo', () => {
  it('check-text calcule vraiment : empreinte 64 hex, valeur jamais renvoyée', async () => {
    const out = asObject(await runTool('check-text', { text: 'cle AKIAIOSFODNN7EXAMPLE ici' }, 'human', newSession()));
    const hits = out.hits as Array<Record<string, unknown>>;
    expect(hits).toHaveLength(1);
    expect(hits[0]!.knownFake).toBe(true);
    expect(String(hits[0]!.fingerprint)).toMatch(/^[0-9a-f]{64}$/);
    expect(out.stored).toBe(false);
  });

  it('trace-fingerprint met le MODÈLE en premier dans le lot (§11)', async () => {
    const fingerprint = FOYERS['F-1']!.fingerprint;
    const out = asObject(await runTool('trace-fingerprint', { fingerprint }, 'human', newSession()));
    expect(out.templateFirst).toBe(true);
    const batch = out.redactionBatchOrder as Array<Record<string, unknown>>;
    expect(batch[0]!.containerType).toBe('template');
  });

  it('get-exposure renvoie une FOURCHETTE, jamais un nombre exact', async () => {
    const out = asObject(await runTool('get-exposure', { pageId: 'P-140' }, 'human', newSession()));
    const readers = out.readers as Record<string, number>;
    expect(readers.low).toBe(340);
    expect(readers.high).toBe(4800);
  });

  it('request-redaction sans attestation renvoie le verrou PW-09', async () => {
    const out = asObject(await runTool('request-redaction', { findingId: 'F-1', scope: 'all' }, 'human', newSession()));
    expect(out.ok).toBe(false);
    expect(String(out.reason)).toContain('attestée');
  });
});
