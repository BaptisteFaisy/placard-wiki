/**
 * Tests des gardes de la surface MCP (§17) — ce qu'un agent **ne peut pas**
 * faire tout seul :
 * 1. `recordRotation` refuse un auteur agent : l'attestation de rotation est
 *    humaine (recette §25.8) ;
 * 2. `applyRedaction` est refusé tant qu'aucune attestation humaine n'existe
 *    (verrou PW-09, recette §25.7) ;
 * 3. `checkText` ne stocke ni ne journalise le texte soumis (§17).
 *
 * Le contexte est injecté par un mock du runtime Forge : aucun SDK `@forge/*`
 * n'est instancié, `@forge/sql` n'est jamais touché.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ServiceContext } from './services/ports';
import { attestRotation } from './services/ritual-service';
import {
  FAKE_CLOUD_KEY, PAGE_ID, makeTestContext, seedFoyerBySweep,
} from './services/test-support';

/** Contexte injecté dans la surface MCP (le runtime Forge n'est jamais testé). */
const injected = vi.hoisted(() => ({ ctx: null as ServiceContext | null }));

vi.mock('./runtime/context', () => ({
  getServiceContext: (): ServiceContext => {
    if (injected.ctx === null) throw new Error('test : aucun contexte injecté');
    return injected.ctx;
  },
}));

import { applyRedaction, checkText, recordRotation, requestRedaction } from './mcp';

/** Branche la surface MCP sur un contexte de test. */
function useCtx(ctx: ServiceContext): void {
  injected.ctx = ctx;
}

/** Résultat de refus commun aux gardes du rituel. */
interface Refusal {
  ok?: boolean;
  reason?: string;
}

describe('garde §25.8 — l’attestation de rotation est humaine', () => {
  it('recordRotation refuse un auteur agent', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, PAGE_ID);

    const res = await recordRotation({
      findingId: foyer.id, provider: 'AWS', evidenceRef: 'SEC-417',
    }) as Refusal;
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/agent/i);

    // Le refus ne pose rien : ni attestation, ni étape de rituel.
    expect(await ctx.store.ritualSteps.listByFinding(foyer.id)).toHaveLength(0);
    const after = await ctx.store.getFoyer(foyer.id);
    expect(after?.rotatedAt).toBeUndefined();
    expect(after?.state).toBe('open');
  });
});

describe('verrou PW-09 — caviardage verrouillé sans attestation humaine (§25.7)', () => {
  it('applyRedaction est refusé tant qu’aucune attestation humaine n’existe', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, PAGE_ID);

    const res = await applyRedaction({
      findingId: foyer.id, approvedBy: 'ari:identity::alice', comment: 'caviardage',
    }) as Refusal;
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/attestation/i);
    // Rien n'est écrit sur la page : le verrou bloque avant toute modification.
    expect(ctx.storage.written).toHaveLength(0);
  });

  it('requestRedaction (aperçu) est refusé lui aussi', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, PAGE_ID);

    const res = await requestRedaction({ findingId: foyer.id }) as Refusal;
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/PW-09/);
  });

  it('après une attestation humaine, le caviardage part au nom de la personne (§25.9)', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, PAGE_ID);
    const attestation = await attestRotation(ctx, {
      foyerId: foyer.id, provider: 'AWS', evidenceRef: 'SEC-417',
      actorRef: 'ari:identity::alice', actorKind: 'human',
    });
    expect(attestation.ok).toBe(true);

    const res = await applyRedaction({
      findingId: foyer.id, approvedBy: 'ari:identity::alice', comment: 'caviardage',
    }) as { applied?: number; asUser?: string };
    expect(res.applied).toBeGreaterThanOrEqual(1);
    expect(res.asUser).toBe('ari:identity::alice');

    const written = ctx.storage.written[0]!;
    expect(written.asUser).toBe('ari:identity::alice');
    expect(written.text).not.toContain(FAKE_CLOUD_KEY);
  });
});

describe('checkText — le texte soumis ne quitte pas l’exécution (§17)', () => {
  it('ne stocke ni ne journalise le texte soumis', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const out = await checkText({ text: `export AWS_ACCESS_KEY_ID=${FAKE_CLOUD_KEY}` }) as {
      detected: Array<{ fingerprint: string; maskedPreview: string }>;
      honesty: string;
    };
    const logged = [logSpy, infoSpy, warnSpy, errorSpy, debugSpy].map((s) => s.mock.calls.length);
    for (const spy of [logSpy, infoSpy, warnSpy, errorSpy, debugSpy]) spy.mockRestore();

    // La réponse est utile… et masquée.
    expect(out.detected.length).toBeGreaterThanOrEqual(1);
    expect(out.detected[0]?.maskedPreview).toBe('AKIA…(20)');
    expect(JSON.stringify(out)).not.toContain(FAKE_CLOUD_KEY);

    // Rien n'est persisté : ni foyer, ni écriture, ni événement, ni ticket.
    expect(await ctx.store.listFoyers({ limit: 10 })).toHaveLength(0);
    expect(await ctx.store.findings.byFingerprint(out.detected[0]!.fingerprint)).toBeNull();
    expect(ctx.storage.written).toHaveLength(0);
    expect(ctx.realtime.published).toHaveLength(0);
    expect(ctx.jira.issues).toHaveLength(0);

    // Rien n'est journalisé.
    expect(logged).toEqual([0, 0, 0, 0, 0]);
  });
});
