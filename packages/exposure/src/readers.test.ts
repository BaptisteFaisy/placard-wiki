/**
 * Tests de la fourchette de lecteurs (§8) : méthode toujours affichée,
 * groupes imbriqués non résolus → fourchette élargie, droits manquants →
 * caveat (« pas de droit » ≠ « pas de données », §25.18), partage public →
 * plafond du site.
 */

import { describe, expect, it } from 'vitest';
import { readersRange, READERS_METHOD_FR, type ReadersInput } from './readers.js';

function baseInput(overrides: Partial<ReadersInput> = {}): ReadersInput {
  return {
    space: { low: 340, high: 1200 },
    restrictions: [],
    sharing: 'space-default',
    ...overrides,
  };
}

describe('readersRange — fourchette, jamais un nombre exact (§8)', () => {
  it('héritage de l’espace : la fourchette de l’espace, avec sa méthode', () => {
    const range = readersRange(baseInput());
    expect(range.low).toBe(340);
    expect(range.high).toBe(1200);
    expect(range.low).toBeLessThanOrEqual(range.high);
    expect(range.method).toBe(READERS_METHOD_FR);
    expect(range.caveats).toEqual([]);
  });

  it('restrictions résolues : plancher = somme des effectifs connus', () => {
    const range = readersRange(
      baseInput({
        restrictions: [
          { type: 'user', name: 'alice' },
          { type: 'user', name: 'bob' },
          { type: 'group', name: 'equipe-securite', memberCount: 8 },
        ],
      }),
    );
    expect(range.low).toBe(10);
    expect(range.high).toBe(10);
    expect(range.caveats).toEqual([]);
  });

  it('groupe imbriqué non résolu → fourchette élargie + caveat déclaré', () => {
    const range = readersRange(
      baseInput({
        restrictions: [
          { type: 'user', name: 'alice' },
          { type: 'group', name: 'tout-le-monde-imbrique' }, // effectif inconnu
        ],
      }),
    );
    expect(range.low).toBe(1); // seul le certain compte au plancher
    expect(range.high).toBe(1200); // élargi jusqu’à l’audience de l’espace
    expect(range.caveats.join(' ')).toContain('imbriqué');
  });

  it('partage public / « anyone with link » : plafond = effectif du site', () => {
    for (const sharing of ['public', 'anyone-with-link'] as const) {
      const range = readersRange(baseInput({ sharing, siteUsers: 5000 }));
      expect(range.high, sharing).toBe(5000);
    }
  });

  it('partage public sans effectif de site connu → caveat, pas de devinette', () => {
    const range = readersRange(baseInput({ sharing: 'public' }));
    expect(range.caveats.join(' ')).toContain('audience du site inconnue');
    expect(range.high).toBe(1200); // la borne haute de l’espace subsiste
  });

  it('espace public partagé entièrement : la fourchette couvre tout le site (§24)', () => {
    const range = readersRange(baseInput({ sharing: 'public', siteUsers: 20000, space: { low: 0, high: 20000 } }));
    expect(range.high).toBe(20000);
  });

  it('droit manquant sur le graphe → caveat « pas de droit » ≠ « pas de données » (§25.18)', () => {
    const range = readersRange(baseInput({ missingRights: ['space:permissions:read'] }));
    expect(range.caveats).toHaveLength(1);
    expect(range.caveats[0]).toContain('pas de droit');
    expect(range.caveats[0]).toContain('pas de données');
    expect(range.caveats[0]).toContain('space:permissions:read');
  });

  it('permissions de l’espace illisibles : jamais de zéro silencieux', () => {
    const withSite = readersRange(baseInput({ space: {}, siteUsers: 900 }));
    expect(withSite.high).toBe(900);
    expect(withSite.caveats.join(' ')).toContain('illisibles');
    const withoutSite = readersRange(baseInput({ space: {} }));
    expect(withoutSite.caveats.join(' ')).toContain('« pas de droit » ≠ « pas de données »');
  });

  it('partage « restricted » sans restriction lisible → caveat', () => {
    const range = readersRange(baseInput({ sharing: 'restricted' }));
    expect(range.caveats.join(' ')).toContain('restreint');
  });

  it('invariants : low ≥ 0, low ≤ high, entiers', () => {
    const cases: ReadersInput[] = [
      baseInput(),
      baseInput({ space: {}, restrictions: [{ type: 'group', name: 'x' }] }),
      baseInput({ sharing: 'public', siteUsers: 10 }),
      baseInput({ space: { low: -5, high: 2.4 } }),
    ];
    for (const input of cases) {
      const range = readersRange(input);
      expect(range.low).toBeGreaterThanOrEqual(0);
      expect(range.high).toBeGreaterThanOrEqual(range.low);
      expect(Number.isInteger(range.low)).toBe(true);
      expect(Number.isInteger(range.high)).toBe(true);
    }
  });
});
