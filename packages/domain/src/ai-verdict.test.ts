import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AI_ACTIVATION_THRESHOLDS,
  decideAiActivation,
  giteCoverageOf,
} from './ai-verdict';
import { GITES } from './vocabulary';
import type {
  AiExposedFoyers,
  GiteCoverage,
  OpenFoyersSummary,
  ResidualAiExposure,
} from './types';

/** Couverture complète et connue (le cas nominal). */
const FULL_COVERAGE: GiteCoverage = {
  covered: GITES.length,
  total: GITES.length,
  known: true,
  method: 'méthode de test',
  uncovered: [],
};

/** Couverture inconnue : aucune passe budgétée (§14). */
const UNKNOWN_COVERAGE: GiteCoverage = {
  covered: 0,
  total: GITES.length,
  known: false,
  method: 'méthode de test',
  uncovered: [...GITES.map((g) => g.gite)],
};

/** Résumé de foyers ouverts : un foyer de danger 40. */
const ONE_OPEN_FOYER: OpenFoyersSummary = {
  count: 1,
  maxDanger: 40,
  maxDangerTerms: [{ id: 'cloud-key', points: 40, label: 'Clé cloud', method: 'famille cloud-key' }],
  byFamily: [{ family: 'cloud-key', count: 1, maxDanger: 40 }],
};

/** Foyers exposés à l'IA : un foyer présumé indexé. */
const ONE_AI_EXPOSED: AiExposedFoyers = {
  count: 1,
  presumedIndexed: 1,
  method: 'méthode de test',
};

/** Exposition résiduelle : entre 3 et 12 lecteurs. */
const SMALL_EXPOSURE: ResidualAiExposure = {
  readersLow: 3,
  readersHigh: 12,
  method: 'méthode de test',
  caveats: [],
};

describe('giteCoverageOf (§14)', () => {
  it('décompte les gîtes du catalogue — jamais un ratio nu', () => {
    const coverage = giteCoverageOf({ skippedPages: 0, skippedAttachments: 0, hasPass: true });
    expect(coverage.total).toBe(GITES.length);
    expect(coverage.covered).toBe(GITES.length);
    expect(coverage.known).toBe(true);
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.method.length).toBeGreaterThan(0);
  });

  it('déclare les gîtes non couverts quand une page n’a pas été lue', () => {
    const coverage = giteCoverageOf({ skippedPages: 2, skippedAttachments: 0, hasPass: true });
    expect(coverage.covered).toBeLessThan(coverage.total);
    expect(coverage.uncovered).toContain('corps-de-page');
    expect(coverage.uncovered).toContain('pieces-jointes');
  });

  it('déclare les pièces jointes non lues comme gîte incomplet', () => {
    const coverage = giteCoverageOf({ skippedPages: 0, skippedAttachments: 3, hasPass: true });
    expect(coverage.uncovered).toContain('pieces-jointes');
    expect(coverage.uncovered).not.toContain('commentaires');
  });

  it('couvre de façon inconnue sans passe budgétée', () => {
    const coverage = giteCoverageOf({ skippedPages: 0, skippedAttachments: 0, hasPass: false });
    expect(coverage.known).toBe(false);
    expect(coverage.covered).toBe(0);
  });
});

describe('decideAiActivation (§27)', () => {
  it('indéterminé quand la couverture est inconnue', () => {
    const verdict = decideAiActivation({
      coverage: UNKNOWN_COVERAGE,
      openFoyers: ONE_OPEN_FOYER,
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: SMALL_EXPOSURE,
    });
    expect(verdict.verdict).toBe('indéterminé');
    expect(verdict.rule).toContain('Couverture inconnue');
  });

  it('prêt quand aucun foyer n’est ouvert', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: { ...ONE_OPEN_FOYER, count: 0, maxDanger: 0, byFamily: [] },
      aiExposedFoyers: { ...ONE_AI_EXPOSED, count: 0, presumedIndexed: 0 },
      residualExposure: { ...SMALL_EXPOSURE, readersLow: 0, readersHigh: 0 },
    });
    expect(verdict.verdict).toBe('prêt');
    expect(verdict.rule.length).toBeGreaterThan(0);
  });

  it('à-nettoyer quand des foyers restent ouverts sous les seuils', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: ONE_OPEN_FOYER,
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: SMALL_EXPOSURE,
    });
    expect(verdict.verdict).toBe('à-nettoyer');
    expect(verdict.rule).toContain('1 foyer(s) ouvert(s)');
  });

  it('refusé quand le danger maximal dépasse le seuil', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: { ...ONE_OPEN_FOYER, maxDanger: DEFAULT_AI_ACTIVATION_THRESHOLDS.dangerRefuse },
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: SMALL_EXPOSURE,
    });
    expect(verdict.verdict).toBe('refusé');
    expect(verdict.rule).toContain('Danger maximal');
  });

  it('refusé quand le nombre de foyers ouverts dépasse le seuil', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: { ...ONE_OPEN_FOYER, count: DEFAULT_AI_ACTIVATION_THRESHOLDS.countRefuse },
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: SMALL_EXPOSURE,
    });
    expect(verdict.verdict).toBe('refusé');
    expect(verdict.rule).toContain('seuil de refus');
  });

  it('refusé quand l’exposition résiduelle dépasse le seuil de lecteurs', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: ONE_OPEN_FOYER,
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: { ...SMALL_EXPOSURE, readersHigh: DEFAULT_AI_ACTIVATION_THRESHOLDS.readersRefuse },
    });
    expect(verdict.verdict).toBe('refusé');
    expect(verdict.rule).toContain('lecteurs');
  });

  it('les seuils sont paramétrables', () => {
    const verdict = decideAiActivation({
      coverage: FULL_COVERAGE,
      openFoyers: { ...ONE_OPEN_FOYER, maxDanger: 85 },
      aiExposedFoyers: ONE_AI_EXPOSED,
      residualExposure: SMALL_EXPOSURE,
      thresholds: { dangerRefuse: 90 },
    });
    expect(verdict.verdict).toBe('à-nettoyer');
  });
});