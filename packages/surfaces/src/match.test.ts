/**
 * La correspondance multi-surfaces (PW-31) — « le même secret, deux
 * surfaces ».
 *
 * Ce que ce fichier prouve :
 * 1. la **même** empreinte sur deux surfaces → correspondance, et le message
 *    dit où ;
 * 2. des empreintes **différentes** → aucune correspondance ;
 * 3. des **namespaces différents** → aucune correspondance, et le message le
 *    dit explicitement (les empreintes ne sont pas comparables) ;
 * 4. aucune valeur brute ne circule dans le résultat.
 */

import { describe, expect, it } from 'vitest';

import { matchAcrossSurfaces } from './match';
import type { SurfaceSeen } from './types';

/** Une observation de surface — lisible, jamais une valeur. */
function observation(overrides: Partial<SurfaceSeen> = {}): SurfaceSeen {
  return {
    fingerprint: 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    surface: 'confluence',
    externalId: '1001',
    label: 'Runbook de démonstration',
    namespaceId: 'atlassian:acme',
    state: 'detecte',
    method: 'scan-local',
    source: 'forge-sql',
    firstSeenAt: '2026-11-11T10:00:00.000Z',
    lastSeenAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('matchAcrossSurfaces — le même secret, deux surfaces', () => {
  it('la même empreinte sur Confluence et Git : correspondance', () => {
    const fp = 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const surfaces = [
      observation({ fingerprint: fp }),
      observation({
        fingerprint: fp,
        surface: 'git',
        externalId: 'placard:config/env',
        label: 'config/env',
        source: 'git-cli',
      }),
    ];
    const result = matchAcrossSurfaces(fp, surfaces, { namespaceId: 'atlassian:acme' });
    expect(result.matched).toHaveLength(2);
    expect(result.comparable).toBe(true);
    expect(result.message).toContain('Confluence');
    expect(result.message).toContain('Git');
  });

  it('des empreintes différentes : aucune correspondance', () => {
    const fp = 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const surfaces = [observation({ fingerprint: 'hmac256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })];
    const result = matchAcrossSurfaces(fp, surfaces, { namespaceId: 'atlassian:acme' });
    expect(result.matched).toHaveLength(0);
    expect(result.comparable).toBe(false);
    expect(result.message).toContain('aucune correspondance');
  });

  it('des namespaces différents : aucune correspondance, et le message le dit', () => {
    const fp = 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const surfaces = [
      observation({
        fingerprint: 'hmac256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        surface: 'git',
        externalId: 'placard:config/env',
        label: 'config/env',
        namespaceId: 'atlassian:autre',
        source: 'git-cli',
      }),
    ];
    const result = matchAcrossSurfaces(fp, surfaces, { namespaceId: 'atlassian:acme' });
    expect(result.matched).toHaveLength(0);
    expect(result.comparable).toBe(false);
    expect(result.divergent[0]?.reason).toBe('namespace-différent');
    expect(result.message).toContain('namespace');
    expect(result.message).toContain('clé partagée');
  });

  it('le même emplacement sous deux namespaces est signalé comme divergent', () => {
    const fp = 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const surfaces = [
      observation({ fingerprint: fp, surface: 'git', externalId: 'placard:config/env' }),
      observation({
        fingerprint: 'hmac256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        surface: 'git',
        externalId: 'placard:config/env',
        namespaceId: 'atlassian:autre',
      }),
    ];
    const result = matchAcrossSurfaces(fp, surfaces, { namespaceId: 'atlassian:acme' });
    expect(result.matched).toHaveLength(1);
    expect(result.divergent).toHaveLength(1);
    expect(result.divergent[0]?.reason).toBe('namespace-différent');
    expect(result.message).toContain('divergent');
  });

  it('aucune surface connue : le message le dit aussi', () => {
    const result = matchAcrossSurfaces('hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [], {
      namespaceId: 'atlassian:acme',
    });
    expect(result.matched).toHaveLength(0);
    expect(result.message).toContain('aucune surface connue');
  });

  it('aucune valeur brute dans le résultat', () => {
    const fp = 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const surfaces = [
      observation({ fingerprint: fp, surface: 'git', externalId: 'placard:config/env' }),
    ];
    const json = JSON.stringify(matchAcrossSurfaces(fp, surfaces, { namespaceId: 'atlassian:acme' }));
    expect(json).not.toContain('AKIA');
    expect(json).not.toContain('BEGIN');
  });
});
