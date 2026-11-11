/**
 * Oracle vs fixtures (§15) : les fixtures plantent EXACTEMENT le nombre déclaré
 * par `DEMO_ORACLE` pour chaque couple `{ famille, gîte }`. C'est la garantie
 * que la démo et l'oracle de test ne divergent jamais.
 */

import { describe, expect, it } from 'vitest';

import { FAMILY_LABELS, GITES } from '@placard-wiki/domain';

import { SECRET_FIXTURES } from './fixtures/index.js';
import { DEMO_ORACLE, totalDeclare } from './oracle.js';

/** Compte les fixtures par couple famille|gîte. */
function decompteFixtures(): Map<string, number> {
  const map = new Map<string, number>();
  for (const f of SECRET_FIXTURES) {
    const cle = `${f.family}|${f.gite}`;
    map.set(cle, (map.get(cle) ?? 0) + 1);
  }
  return map;
}

describe('oracle vs fixtures', () => {
  const decompte = decompteFixtures();

  it('a exactement 11 familles × 7 gîtes = 77 entrées déclarées', () => {
    expect(DEMO_ORACLE).toHaveLength(Object.keys(FAMILY_LABELS).length * GITES.length);
  });

  it('déclare 84 secrets au total', () => {
    expect(totalDeclare()).toBe(84);
    expect(SECRET_FIXTURES).toHaveLength(totalDeclare());
  });

  it('chaque entrée déclarée correspond au nombre planté', () => {
    for (const entree of DEMO_ORACLE) {
      const cle = `${entree.family}|${entree.gite}`;
      expect(decompte.get(cle), cle).toBe(entree.count);
    }
  });

  it('chaque couple planté est déclaré (aucun excès)', () => {
    const declares = new Set(DEMO_ORACLE.map((e) => `${e.family}|${e.gite}`));
    for (const cle of decompte.keys()) {
      expect(declares.has(cle), cle).toBe(true);
    }
  });

  it('bank-data déclare 2 (IBAN + carte), les autres 1', () => {
    for (const entree of DEMO_ORACLE) {
      const attendu = entree.family === 'bank-data' ? 2 : 1;
      expect(entree.count, `${entree.family}|${entree.gite}`).toBe(attendu);
    }
  });
});