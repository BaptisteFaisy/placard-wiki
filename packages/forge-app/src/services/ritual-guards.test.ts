/**
 * Tests des gardes du rituel (§9, §17) :
 *  - l'attestation de rotation posée par un AGENT est refusée (§25.8) ;
 *  - le verrou PW-09 bloque le caviardage tant qu'aucune attestation humaine
 *    n'existe (§25.7) ;
 *  - après attestation humaine, le caviardage est appliqué `asUser()` et le
 *    texte produit ne contient plus la valeur (§25.9).
 *
 * Store en mémoire ; `@forge/sql` jamais instancié.
 */

import { describe, expect, it } from 'vitest';

import { applyRedactionService, attestRotation } from './ritual-service';
import { runSweep } from './sweep';
import { FAKE_CLOUD_KEY, PAGE_ID, makeTestContext } from './test-support';
import type { ServiceContext } from './ports';
import type { Foyer } from '@placard-wiki/domain';

/** Balaye la page de fixture et renvoie le premier foyer ouvert. */
async function foyerApresScan(ctx: ServiceContext): Promise<Foyer> {
  await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
  const foyers = await ctx.store.listFoyers({ limit: 10 });
  const foyer = foyers[0];
  if (foyer === undefined) throw new Error('test : aucun foyer produit');
  return foyer;
}

describe('garde §17 — attestation refusée à un agent', () => {
  it('refuse une attestation dont l’auteur est un agent', async () => {
    const ctx = makeTestContext();
    const foyer = await foyerApresScan(ctx);
    const res = await attestRotation(ctx, {
      foyerId: foyer.id,
      provider: 'AWS',
      evidenceRef: 'SEC-417',
      actorRef: 'rovo-agent',
      actorKind: 'agent',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/agent/i);
  });

  it('accepte une attestation humaine avec preuve', async () => {
    const ctx = makeTestContext();
    const foyer = await foyerApresScan(ctx);
    const res = await attestRotation(ctx, {
      foyerId: foyer.id,
      provider: 'AWS',
      evidenceRef: 'SEC-417',
      actorRef: 'ari:identity::alice',
      actorKind: 'human',
    });
    expect(res.ok).toBe(true);
  });
});

describe('verrou PW-09 — caviardage verrouillé sans rotation attestée', () => {
  it('refuse le caviardage tant qu’aucune attestation humaine n’existe', async () => {
    const ctx = makeTestContext();
    const foyer = await foyerApresScan(ctx);
    const res = await applyRedactionService(ctx, foyer.id, 'ari:identity::alice', 'caviardage');
    expect('ok' in res && res.ok === false).toBe(true);
  });

  it('applique le caviardage asUser après attestation humaine, sans valeur brute', async () => {
    const ctx = makeTestContext();
    const foyer = await foyerApresScan(ctx);
    const att = await attestRotation(ctx, {
      foyerId: foyer.id,
      provider: 'AWS',
      evidenceRef: 'SEC-417',
      actorRef: 'ari:identity::alice',
      actorKind: 'human',
    });
    expect(att.ok).toBe(true);

    const res = await applyRedactionService(ctx, foyer.id, 'ari:identity::alice', 'caviardage');
    expect('applied' in res).toBe(true);
    if ('applied' in res) {
      expect(res.applied).toBeGreaterThanOrEqual(1);
      expect(res.asUser).toBe('ari:identity::alice');
    }
    // La modification est faite au nom de la personne qui approuve (§5).
    expect(ctx.storage.written.length).toBeGreaterThanOrEqual(1);
    const written = ctx.storage.written[0]!;
    expect(written.asUser).toBe('ari:identity::alice');
    // Le texte produit ne contient plus la valeur brute (§23).
    expect(written.text).not.toContain(FAKE_CLOUD_KEY);
  });
});