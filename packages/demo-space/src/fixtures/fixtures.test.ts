/**
 * Tests des fixtures (§15) : génération déterministe, cohérence gîte/conteneur,
 * couverture famille × gîte, et valeurs distinctes là où attendu.
 */

import { describe, expect, it } from 'vitest';

import { FAMILY_LABELS, GITES, giteOf, type WikiFamily } from '@placard-wiki/domain';

import {
  MARQUE_SYNTHETIQUE,
  SECRET_FIXTURES,
  fixturesDuGite,
  genererFixtures,
  giteCoherent,
} from './index';

const FAMILLES = Object.keys(FAMILY_LABELS);
const GITES_LISTE = GITES.map((g) => g.gite);

describe('génération des fixtures', () => {
  it('produit 12 numéros × 7 gîtes = 84 fixtures', () => {
    expect(SECRET_FIXTURES).toHaveLength(84);
  });

  it('est déterministe : deux générations donnent les mêmes valeurs', () => {
    const a = genererFixtures();
    const b = genererFixtures();
    expect(a.map((f) => f.value)).toEqual(b.map((f) => f.value));
  });

  it('associe chaque fixture à son gîte via giteOf (§6)', () => {
    for (const fixture of SECRET_FIXTURES) {
      expect(giteCoherent(fixture)).toBe(true);
      expect(giteOf(fixture.containerType, fixture.field)).toBe(fixture.gite);
    }
  });

  it('couvre chaque famille dans chaque gîte', () => {
    for (const gite of GITES_LISTE) {
      const familles = new Set(fixturesDuGite(gite).map((f) => f.family));
      for (const famille of FAMILLES) expect(familles.has(famille as WikiFamily)).toBe(true);
    }
  });

  it('porte un numéro de famille dans 1..12 et une graine stable', () => {
    for (const f of SECRET_FIXTURES) {
      expect(f.number).toBeGreaterThanOrEqual(1);
      expect(f.number).toBeLessThanOrEqual(12);
      expect(f.seed).toContain(String(f.number));
      expect(f.seed).toContain(f.gite);
    }
  });

  it('bank-data : IBAN (6) et carte (7) distincts dans chaque gîte', () => {
    for (const gite of GITES_LISTE) {
      const bancaires = fixturesDuGite(gite).filter((f) => f.family === 'bank-data');
      expect(bancaires).toHaveLength(2);
      const numeros = bancaires.map((f) => f.number).sort();
      expect(numeros).toEqual([6, 7]);
      expect(bancaires[0]!.value).not.toBe(bancaires[1]!.value);
    }
  });

  it('toutes les valeurs sont non vides', () => {
    for (const f of SECRET_FIXTURES) expect(f.value.length).toBeGreaterThan(0);
  });
});

describe('marque synthétique', () => {
  it('est présente et explicite', () => {
    expect(MARQUE_SYNTHETIQUE).toContain('SYNTHÉTIQUE');
  });

  it('aucune fixture ne porte de gîte inconnu', () => {
    const connus = new Set(GITES_LISTE);
    for (const f of SECRET_FIXTURES) {
      expect(connus.has(f.gite)).toBe(true);
    }
  });
});