/**
 * Le registre multi-surfaces (PW-31) — la persistance des observations.
 *
 * Ce que ce fichier prouve :
 * 1. une observation enregistrée est retrouvée par empreinte et par foyer ;
 * 2. ré-enregistrer le **même** emplacement met à jour la dernière
 *    observation sans dupliquer la ligne et sans perdre la première ;
 * 3. deux emplacements distincts restent deux lignes ;
 * 4. le registre ne conserve que des empreintes — jamais de valeur.
 */

import { describe, expect, it } from 'vitest';

import { createMemorySurfaceRegistry } from './registry';
import type { SurfaceSeen } from './types';

/** Une observation de surface — lisible, jamais une valeur. */
function observation(overrides: Partial<SurfaceSeen> = {}): SurfaceSeen {
  return {
    fingerprint: 'hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    surface: 'git',
    externalId: 'placard:config/env',
    label: 'config/env',
    namespaceId: 'atlassian:acme',
    foyerId: 'foyer-1',
    state: 'detecte',
    method: 'scan-local',
    source: 'git-cli',
    firstSeenAt: '2026-11-11T10:00:00.000Z',
    lastSeenAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('registre multi-surfaces — persistance', () => {
  it('une observation enregistrée est retrouvée par empreinte', async () => {
    const registry = createMemorySurfaceRegistry();
    await registry.record(observation());
    const rows = await registry.listByFingerprint('hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.surface).toBe('git');
    expect(rows[0]?.source).toBe('git-cli');
  });

  it('une observation enregistrée est retrouvée par foyer', async () => {
    const registry = createMemorySurfaceRegistry();
    await registry.record(observation());
    await registry.record(observation({ surface: 'jira', externalId: 'SEC-1', source: 'jira-api' }));
    const rows = await registry.listByFoyer('foyer-1');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.surface).sort()).toEqual(['git', 'jira']);
  });

  it('ré-enregistrer le même emplacement ne duplique pas la ligne', async () => {
    const registry = createMemorySurfaceRegistry();
    await registry.record(observation());
    await registry.record(observation({ lastSeenAt: '2026-11-12T09:30:00.000Z', state: 'confirme' }));
    const rows = await registry.listByFingerprint('hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstSeenAt).toBe('2026-11-11T10:00:00.000Z');
    expect(rows[0]?.lastSeenAt).toBe('2026-11-12T09:30:00.000Z');
    expect(rows[0]?.state).toBe('confirme');
  });

  it('deux emplacements distincts restent deux lignes', async () => {
    const registry = createMemorySurfaceRegistry();
    await registry.record(observation());
    await registry.record(observation({ externalId: 'placard:scripts/deploy' }));
    const rows = await registry.listByFingerprint('hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rows).toHaveLength(2);
  });

  it('le registre ne conserve que des empreintes, jamais une valeur', async () => {
    const registry = createMemorySurfaceRegistry();
    await registry.record(observation());
    const json = JSON.stringify(await registry.listByFingerprint('hmac256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
    expect(json).not.toContain('AKIA');
    expect(json).not.toContain('BEGIN PRIVATE KEY');
  });
});
