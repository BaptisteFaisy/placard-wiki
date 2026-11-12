import { describe, expect, it } from 'vitest';
import {
  BASE_SCORE_BY_FAMILY,
  REMEDIATION_COST_HOURS,
  SCORE_TERMS,
  SCORE_TERM_BY_ID,
  computeDanger,
} from './score-terms';

/** Les valeurs exactes du cahier des charges §8. */
const EXPECTED_POINTS: Record<string, number | null> = {
  'base-family': null,
  'current-version': 20,
  'history-present': 15,
  'history-depth': 5,
  'readers-1000': 15,
  'readers-100': 10,
  'readers-10': 5,
  'public-share': 10,
  'ai-surface': 10,
  'rotation-unknown-90d': 10,
  'propagation-3': 10,
  'test-content': -30,
  'known-fake': -20,
  'archived-restricted': -15,
};

describe('catalogue des termes du score (§8)', () => {
  it('chaque terme du cahier a exactement les points du cahier', () => {
    for (const term of SCORE_TERMS) {
      expect(EXPECTED_POINTS).toHaveProperty(term.id);
      expect(term.points, `terme ${term.id}`).toBe(EXPECTED_POINTS[term.id]);
    }
    expect(SCORE_TERMS).toHaveLength(Object.keys(EXPECTED_POINTS).length);
  });

  it('chaque terme a sa méthode affichable (aucun score sans ses termes)', () => {
    for (const term of SCORE_TERMS) {
      expect(term.methodFr.length).toBeGreaterThan(10);
      expect(term.methodEn.length).toBeGreaterThan(10);
      expect(term.fr.length).toBeGreaterThan(3);
      expect(term.en.length).toBeGreaterThan(3);
    }
  });

  it('les bases par famille restent dans 20 – 55', () => {
    for (const [family, base] of Object.entries(BASE_SCORE_BY_FAMILY)) {
      expect(base, family).toBeGreaterThanOrEqual(20);
      expect(base, family).toBeLessThanOrEqual(55);
    }
  });

  it('chaque famille a son coût de remise en état, en fourchette', () => {
    for (const [family, cost] of Object.entries(REMEDIATION_COST_HOURS)) {
      expect(cost.low, family).toBeGreaterThan(0);
      expect(cost.high, family).toBeGreaterThanOrEqual(cost.low);
    }
    expect(Object.keys(REMEDIATION_COST_HOURS)).toHaveLength(
      Object.keys(BASE_SCORE_BY_FAMILY).length,
    );
  });

  it('le lookup par identifiant retrouve chaque terme', () => {
    for (const term of SCORE_TERMS) {
      expect(SCORE_TERM_BY_ID.get(term.id)).toBe(term);
    }
  });
});

describe('computeDanger', () => {
  it('somme les termes appliqués', () => {
    expect(computeDanger([{ points: 55 }, { points: 20 }, { points: 15 }])).toBe(90);
  });

  it('borne à 100', () => {
    expect(computeDanger([{ points: 55 }, { points: 20 }, { points: 15 }, { points: 10 }, { points: 10 }, { points: 10 }, { points: 10 }])).toBe(100);
  });

  it('borne à 0 avec les malus', () => {
    expect(computeDanger([{ points: 20 }, { points: -30 }, { points: -20 }])).toBe(0);
  });
});
