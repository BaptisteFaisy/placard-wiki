/**
 * Tests du balayage (§14) : détection à la demande, ouverture d'un foyer avec
 * empreinte + aperçu masqué, exposition calculée, budget et curseur.
 *
 * Règle : aucune valeur brute n'est stockée — vérifiée sur le foyer sérialisé.
 * Le store est en mémoire ; `@forge/sql` n'est jamais instancié.
 */

import { describe, expect, it } from 'vitest';

import { runSweep } from './sweep';
import { FAKE_CLOUD_KEY, PAGE_ID, SPACE_KEY, makeTestContext } from './test-support';

describe('runSweep — balayage à la demande (§14)', () => {
  it('détecte la clé factice et ouvre un foyer (empreinte + aperçu masqué)', async () => {
    const ctx = makeTestContext();
    const result = await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });

    expect(result.pagesScanned).toBe(1);
    expect(result.foyersTouched).toBeGreaterThanOrEqual(1);
    expect(result.done).toBe(true);

    const foyers = await ctx.store.listFoyers({ limit: 10 });
    expect(foyers.length).toBeGreaterThanOrEqual(1);
    const foyer = foyers[0]!;
    expect(foyer.fingerprint.startsWith('hmac256:')).toBe(true);
    expect(foyer.family).toBe('cloud-key');
    expect(foyer.score).toBeGreaterThan(0);
    // Chaque score porte ses termes (§8).
    expect(foyer.scoreTerms.length).toBeGreaterThan(0);
  });

  it('ne stocke aucune valeur brute (§23)', async () => {
    const ctx = makeTestContext();
    await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
    const foyers = await ctx.store.listFoyers({ limit: 10 });
    const serialized = JSON.stringify(foyers);
    expect(serialized).not.toContain(FAKE_CLOUD_KEY);
    for (const foyer of foyers) {
      for (const loc of foyer.locations) {
        expect(loc.maskedPreview).not.toContain(FAKE_CLOUD_KEY);
      }
    }
  });

  it('calcule et persiste l’exposition de la page (§8)', async () => {
    const ctx = makeTestContext();
    await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
    const exposure = await ctx.store.exposures.get(PAGE_ID);
    expect(exposure).not.toBeNull();
    expect(exposure?.spaceKey).toBe(SPACE_KEY);
    expect(exposure?.aiSurface.hypothesis).toBe(true);
    expect(exposure?.readers.method).not.toBe('');
  });

  it('persiste le scan de page et met à jour le budget (§14)', async () => {
    const ctx = makeTestContext();
    await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
    const scan = await ctx.store.pageScans.get(PAGE_ID);
    expect(scan).not.toBeNull();
    expect(scan?.versionScanned).toBe(3);
    const budget = await ctx.store.budget.get('2026-11-11');
    expect(budget).not.toBeNull();
    expect(budget?.pagesScanned).toBe(1);
  });
});