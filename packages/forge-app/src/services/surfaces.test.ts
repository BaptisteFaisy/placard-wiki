/**
 * Les surfaces multi-surfaces côté app (PW-31).
 *
 * Ce que ce fichier prouve :
 * 1. le balayage **inscrit** le wiki comme surface : le foyer s'enregistre,
 *    et l'observation est persistée (registre multi-surfaces) ;
 * 2. une surface externe (Git) observée sous la **même** empreinte est
 *    retrouvée par `trace-fingerprint`, avec sa méthode et sa source ;
 * 3. des **namespaces différents** → aucune correspondance, et l'outil le
 *    dit explicitement ;
 * 4. aucune valeur brute ne sort de l'outil enrichi.
 */

import { describe, expect, it } from 'vitest';
import { resolveNamespace } from '@placard-wiki/surfaces';
import type { SurfaceSeen } from '@placard-wiki/surfaces';

import type { ServiceContext } from './ports';
import { makeTestContext, seedFoyerBySweep } from './test-support';
import { recordSurfaceSeen, surfaceViewsForFingerprint } from './surfaces';

/** Une observation de surface écrite à la main (namespaceforeign inclus). */
function observation(overrides: Partial<SurfaceSeen>): SurfaceSeen {
  return {
    fingerprint: 'hmac256:0000000000000000',
    surface: 'git',
    externalId: 'placard:config/env',
    label: 'config/env',
    namespaceId: 'installation:installation-de-test',
    state: 'detecte',
    method: 'scan-local',
    source: 'git-cli',
    firstSeenAt: '2026-11-11T10:00:00.000Z',
    lastSeenAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

/** La surface Git du même secret, telle que le dépôt Git la rapporterait. */
async function recordGitSurface(ctx: ServiceContext, fingerprint: string): Promise<void> {
  await recordSurfaceSeen(ctx, {
    fingerprint,
    surface: 'git',
    externalId: 'placard:config/env',
    label: 'config/env',
    method: 'scan-local',
    source: 'git-cli',
  });
}

describe('registre multi-surfaces — le wiki s’inscrit comme surface', () => {
  it('après un balayage, le foyer a une observation Confluence', async () => {
    const ctx = makeTestContext();
    const foyer = await seedFoyerBySweep(ctx);
    const rows = await ctx.surfaces.listByFingerprint(foyer.fingerprint);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.surface).toBe('confluence');
    expect(rows[0]?.method).toBe('scan-wiki');
    expect(rows[0]?.source).toBe('forge-sql');
    expect(rows[0]?.foyerId).toBe(foyer.id);
  });

  it('l’observation est rattachée au foyer', async () => {
    const ctx = makeTestContext();
    const foyer = await seedFoyerBySweep(ctx);
    const rows = await ctx.surfaces.listByFoyer(foyer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fingerprint).toBe(foyer.fingerprint);
  });
});

describe('trace-fingerprint — les emplacements du site ET les surfaces externes', () => {
  it('le même secret, deux surfaces : les deux sont rendues', async () => {
    const ctx = makeTestContext();
    const foyer = await seedFoyerBySweep(ctx);
    await recordGitSurface(ctx, foyer.fingerprint);
    const rows = await ctx.surfaces.listByFingerprint(foyer.fingerprint);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.surface).sort()).toEqual(['confluence', 'git']);
  });

  it('des namespaces différents : aucune correspondance, message explicite', async () => {
    const ctx = makeTestContext();
    const foyer = await seedFoyerBySweep(ctx);
    // Le même emplacement (la page), observé sous une autre empreinte — donc
    // sous un autre namespace, donc avec une autre clé.
    await ctx.surfaces.record(observation({
      fingerprint: 'hmac256:11111111111111111111111111111111',
      surface: 'confluence',
      externalId: '1001',
      label: 'page 1001',
      namespaceId: 'atlassian:autre',
      method: 'scan-wiki',
      source: 'forge-sql',
    }));
    const { views, match } = await surfaceViewsForFingerprint(ctx, foyer.fingerprint);
    expect(match.comparable).toBe(true);
    expect(match.divergent[0]?.reason).toBe('namespace-différent');
    expect(views.map((v) => v.surface)).toEqual(['confluence']);
  });

  it('une observation Git porte sa méthode et sa source, jamais une valeur', async () => {
    const ctx = makeTestContext();
    const foyer = await seedFoyerBySweep(ctx);
    await recordGitSurface(ctx, foyer.fingerprint);
    const { views } = await surfaceViewsForFingerprint(ctx, foyer.fingerprint);
    const git = views.find((v) => v.surface === 'git');
    expect(git?.method).toBe('scan-local');
    expect(git?.source).toBe('git-cli');
    expect(git?.externalId).toBe('placard:config/env');
    expect(JSON.stringify(views)).not.toContain('AKIA');
  });
});

describe('namespace partagé — le contexte porte l’état du namespace', () => {
  it('un namespace partagé est déclaré dans le contexte', async () => {
    const namespace = resolveNamespace({
      sharedKey: 'cle-partagee-de-test',
      namespaceId: 'atlassian:acme',
      installationId: 'installation-de-test',
      source: 'forge-variable',
    });
    const ctx = makeTestContext({ namespace });
    expect(ctx.namespace.shared).toBe(true);
    expect(ctx.namespace.id).toBe('atlassian:acme');
  });

  it('sans namespace partagé, le namespace reste propre à l’installation', async () => {
    const ctx = makeTestContext();
    expect(ctx.namespace.shared).toBe(false);
    expect(ctx.namespace.id).toContain('installation-de-test');
  });
});
