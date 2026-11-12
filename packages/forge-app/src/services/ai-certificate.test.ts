import { describe, expect, it } from 'vitest';

import { GITES } from '@placard-wiki/domain';
import type { Foyer, PageExposure, ScanBudget } from '@placard-wiki/domain';

import { computeAiActivationCertificate } from './ai-certificate';
import { makeTestContext } from './test-support';
import { FAKE_CLOUD_KEY } from './test-support';

const DAY = '2026-11-11';

/** Budget de la passe : sa présence prouve qu'une passe a eu lieu (§14). */
function budgetOf(overrides: Partial<ScanBudget> = {}): ScanBudget {
  return {
    day: DAY,
    pagesScanned: 42,
    attachmentsRead: 7,
    attachmentsSkipped: 0,
    llmCalls: 0,
    tokens: 0,
    costEstimate: 0,
    skipped: [],
    ...overrides,
  };
}

/** Un foyer ouvert, avec son danger et ses termes appliqués (§8). */
function foyerOf(overrides: Partial<Foyer> = {}): Foyer {
  return {
    id: 'f-1',
    fingerprint: 'fp-1',
    family: 'cloud-key',
    baseScore: 40,
    score: 40,
    scoreTerms: [{ id: 'cloud-key', points: 40, label: 'Clé cloud', method: 'famille cloud-key' }],
    state: 'open',
    firstSeenAt: '2026-11-01T00:00:00.000Z',
    lastSeenAt: '2026-11-10T00:00:00.000Z',
    locations: [{
      id: 'loc-1',
      foyerId: 'f-1',
      containerType: 'page',
      containerAri: 'ari:cloud:page/1001',
      pageId: '1001',
      field: 'body',
      maskedPreview: 'AKIA…(20)',
      detectedAt: '2026-11-01T00:00:00.000Z',
      status: 'present',
      gite: 'corps-de-page',
    }],
    primaryPageId: '1001',
    spaceKey: 'DEMO',
    ...overrides,
  };
}

/** L'exposition d'une page : lecteurs en fourchette, surface IA en hypothèse (§8, §13). */
function exposureOf(overrides: Partial<PageExposure> = {}): PageExposure {
  return {
    pageId: '1001',
    spaceKey: 'DEMO',
    readers: { low: 3, high: 12, method: 'permissions de l’espace', caveats: [] },
    sharing: 'space-default',
    restrictions: [],
    aiSurface: { presumedIndexed: true, hypothesis: true, method: 'hypothèse conservatrice' },
    computedAt: '2026-11-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('certificat « prêt à activer l’IA » (§13, §27)', () => {
  it('verdict indéterminé : sans passe budgétée, la couverture est inconnue', async () => {
    const ctx = makeTestContext();
    await ctx.store.saveFoyer(foyerOf());
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.verdict.verdict).toBe('indéterminé');
    expect(cert.coverage.known).toBe(false);
    expect(cert.verdict.rule).toContain('Couverture inconnue');
  });

  it('verdict prêt : couverture connue et aucun foyer ouvert', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf({ state: 'sealed', score: 90 }));
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.verdict.verdict).toBe('prêt');
    expect(cert.openFoyers.count).toBe(0);
    expect(cert.aiExposedFoyers.count).toBe(0);
  });

  it('verdict à-nettoyer : des foyers restent ouverts, sous les seuils', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf());
    await ctx.store.exposures.put(exposureOf());
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.verdict.verdict).toBe('à-nettoyer');
    expect(cert.openFoyers.count).toBe(1);
    expect(cert.openFoyers.maxDanger).toBe(40);
    expect(cert.aiExposedFoyers.count).toBe(1);
  });

  it('verdict refusé : le danger maximal dépasse le seuil', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf({ score: 95, baseScore: 95 }));
    await ctx.store.exposures.put(exposureOf());
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.verdict.verdict).toBe('refusé');
    expect(cert.verdict.rule).toContain('Danger maximal');
  });

  it('la méthode est affichée partout : couverture, surface IA, exposition, verdict', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf());
    await ctx.store.exposures.put(exposureOf());
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.coverage.method.length).toBeGreaterThan(0);
    expect(cert.coverage.total).toBe(GITES.length);
    expect(cert.aiSurface.method.length).toBeGreaterThan(0);
    expect(cert.aiSurface.hypothesis).toBe(true);
    expect(cert.aiExposedFoyers.method.length).toBeGreaterThan(0);
    expect(cert.residualExposure.method.length).toBeGreaterThan(0);
    expect(cert.verdict.rule.length).toBeGreaterThan(0);
    expect(cert.coverage.covered).toBe(GITES.length);
  });

  it('aucune valeur brute dans le certificat — ni secret, ni champ qui le porterait', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf());
    await ctx.store.exposures.put(exposureOf());
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    const serialized = JSON.stringify(cert);
    expect(serialized).not.toContain(FAKE_CLOUD_KEY);
    expect(Object.keys(cert).sort()).toEqual([
      'aiExposedFoyers',
      'aiSurface',
      'blindSpots',
      'contentHash',
      'coverage',
      'id',
      'issuedAt',
      'openFoyers',
      'residualExposure',
      'scope',
      'verdict',
    ]);
    // Les foyers ne sont pas embarqués : ni aperçu, ni emplacement, ni empreinte.
    expect(serialized).not.toContain('maskedPreview');
    expect(serialized).not.toContain('fingerprint');
  });

  it('contentHash stable : même état, même empreinte ; clé différente, empreinte différente', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.saveFoyer(foyerOf());
    await ctx.store.exposures.put(exposureOf());
    const first = await computeAiActivationCertificate(ctx, 'DEMO');
    const second = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.id).toBe(second.id);
    expect(first.contentHash).toMatch(/^hmac256:[0-9a-f]{64}$/);

    const other = makeTestContext({ hmacKey: 'autre-cle-dinstallation' });
    await other.store.budget.put(budgetOf());
    await other.store.saveFoyer(foyerOf());
    await other.store.exposures.put(exposureOf());
    const third = await computeAiActivationCertificate(other, 'DEMO');
    expect(third.contentHash).not.toBe(first.contentHash);
  });

  it('les angles morts sont déclarés : gîtes non couverts et pages non lues', async () => {
    const ctx = makeTestContext();
    await ctx.store.budget.put(budgetOf());
    await ctx.store.pageScans.put({
      pageId: '1001',
      contentHash: '',
      versionScanned: 0,
      scannedAt: '2026-11-11T00:00:00.000Z',
      detectorsVersion: 'test',
      llmCalls: 0,
      tokens: 0,
      skippedReason: 'droits manquants : page illisible',
    });
    const cert = await computeAiActivationCertificate(ctx, 'DEMO');
    expect(cert.coverage.covered).toBeLessThan(cert.coverage.total);
    expect(cert.blindSpots.some((spot) => spot.includes('Gîtes non couverts'))).toBe(true);
    expect(cert.blindSpots.some((spot) => spot.includes('Pages non lues'))).toBe(true);
  });
});