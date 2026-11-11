/**
 * Tests de l'exposition : surface IA (§13, hypothèse conservatrice), coût de
 * remise en état (§8), rapport de pré-activation (§13, §27.5) et visibilité
 * PW-23 (§23 : pas de fuite par le scanner ; §24 : existence et propriétaire
 * seulement, jamais le contenu).
 *
 * Zéro valeur brute (§23) : le foyer de test est fabriqué à l'exécution avec
 * `fakeValue` / `computeFingerprint` / `redactPreview` de `@placard/core` —
 * aucune chaîne au format réel d'un secret n'est écrite dans le dépôt.
 */

import { describe, expect, it } from 'vitest';
import { computeFingerprint, fakeValue, redactPreview } from '@placard/core';
import {
  REMEDIATION_COST_HOURS,
  type Foyer,
  type WikiFamily,
} from '@placard-wiki/domain';
import { aiSurface } from './ai-surface.js';
import { remediationCost } from './remediation.js';
import {
  BASE_BLIND_SPOTS_FR,
  PRE_ACTIVATION_QUESTION_FR,
  isExposed,
  preActivationReport,
  type PreActivationFoyer,
} from './pre-activation.js';
import { UNKNOWN_SPACE_KEY, visibleTo } from './visible-to.js';

const NOW = '2026-11-11T12:00:00.000Z';

describe('aiSurface — hypothèse conservatrice (§13)', () => {
  it('page lisible par Rovo → présumée indexée, hypothesis: true, méthode affichée', () => {
    const surface = aiSurface({ readableByRovo: true });
    expect(surface.presumedIndexed).toBe(true);
    expect(surface.hypothesis).toBe(true);
    expect(surface.method).toContain('Hypothèse conservatrice');
  });

  it('accès Rovo inconnu → présomption d’indexation (le doute profite à l’exposition)', () => {
    expect(aiSurface({ readableByRovo: 'unknown' }).presumedIndexed).toBe(true);
  });

  it('Rovo sans accès, ou page archivée → non présumée indexée', () => {
    expect(aiSurface({ readableByRovo: false }).presumedIndexed).toBe(false);
    expect(aiSurface({ readableByRovo: true, archived: true }).presumedIndexed).toBe(false);
  });
});

describe('remediationCost — fourchette d’heures par famille (§8)', () => {
  it('chaque famille rend la fourchette du domaine, avec sa méthode', () => {
    for (const [family, range] of Object.entries(REMEDIATION_COST_HOURS) as Array<
      [WikiFamily, { low: number; high: number }]
    >) {
      const cost = remediationCost(family);
      expect(cost.low, family).toBe(range.low);
      expect(cost.high, family).toBe(range.high);
      expect(cost.low).toBeLessThanOrEqual(cost.high);
      expect(cost.method.length).toBeGreaterThan(20);
    }
  });
});

describe('preActivationReport — « que verra l’assistant ? » (§13, §27.5)', () => {
  const foyers: PreActivationFoyer[] = [
    { id: 'f-cloud-open', family: 'cloud-key', score: 80, state: 'open', presumedIndexed: true },
    { id: 'f-cloud-sealed', family: 'cloud-key', score: 90, state: 'sealed', presumedIndexed: true },
    { id: 'f-identity', family: 'identity', score: 60, state: 'rotation-attested', presumedIndexed: false },
    { id: 'f-bank-dismissed', family: 'bank-data', score: 70, state: 'dismissed', presumedIndexed: true },
    { id: 'f-token-purged', family: 'platform-token', score: 50, state: 'purged', presumedIndexed: false },
  ];

  it('agrège par famille les foyers qui exposent encore du texte, triés par exposition max', () => {
    const report = preActivationReport({ spaceKey: 'DEMO', foyers, now: NOW });
    expect(report.question).toBe(PRE_ACTIVATION_QUESTION_FR);
    expect(report.scannedFoyers).toBe(5);
    expect(report.exposedFoyers).toBe(2); // sealed, dismissed et purged exclus
    expect(report.presumedIndexedFoyers).toBe(1);
    expect(report.byFamily).toHaveLength(2);
    expect(report.byFamily[0]).toMatchObject({ family: 'cloud-key', count: 1, maxScore: 80 });
    expect(report.byFamily[1]).toMatchObject({ family: 'identity', count: 1, maxScore: 60 });
    expect(report.maxExposure).toEqual({ foyerId: 'f-cloud-open', family: 'cloud-key', score: 80 });
    expect(report.generatedAt).toBe(NOW);
  });

  it('coût de remise en état agrégé par famille (heures × foyers)', () => {
    const report = preActivationReport({ spaceKey: 'DEMO', foyers, now: NOW });
    const cloud = report.byFamily.find((entry) => entry.family === 'cloud-key');
    const cost = remediationCost('cloud-key');
    expect(cloud?.hoursLow).toBe(cost.low);
    expect(cloud?.hoursHigh).toBe(cost.high);
    expect(cloud?.labelFr.length).toBeGreaterThan(3);
    expect(cloud?.labelEn.length).toBeGreaterThan(3);
  });

  it('angles morts toujours déclarés, y compris sur un espace vide', () => {
    const empty = preActivationReport({
      spaceKey: 'VIDE',
      foyers: [],
      blindSpots: ['3 pièces jointes non lues (trop volumineuses)'],
      now: NOW,
    });
    expect(empty.maxExposure).toBeNull();
    expect(empty.byFamily).toEqual([]);
    expect(empty.blindSpots.slice(0, BASE_BLIND_SPOTS_FR.length)).toEqual([...BASE_BLIND_SPOTS_FR]);
    expect(empty.blindSpots).toContain('3 pièces jointes non lues (trop volumineuses)');
    expect(empty.blindSpots.join(' ')).toContain('captures d’écran');
  });

  it('isExposed : rotation attestée mais texte présent → encore exposé (§24)', () => {
    expect(isExposed('open')).toBe(true);
    expect(isExposed('rotation-attested')).toBe(true);
    expect(isExposed('redacted')).toBe(true);
    expect(isExposed('purge-requested')).toBe(true);
    expect(isExposed('purge-impossible')).toBe(true);
    expect(isExposed('purged')).toBe(false);
    expect(isExposed('sealed')).toBe(false);
    expect(isExposed('dismissed')).toBe(false);
  });
});

describe('visibleTo — PW-23 : pas de fuite par le scanner (§23, §24)', () => {
  /** Foyer synthétique, fabriqué à l'exécution — aucune valeur brute au dépôt. */
  function fakeFoyer(spaceKey?: string): Foyer {
    const secret = fakeValue('cloud-key', 'graine-pw23', 0);
    const preview = redactPreview(secret, 'cloud-key');
    return {
      id: 'foyer-1',
      fingerprint: computeFingerprint(secret, 'sel-installation-test'),
      family: 'cloud-key',
      baseScore: 55,
      score: 75,
      scoreTerms: [],
      state: 'open',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      locations: [
        {
          id: 'loc-1',
          foyerId: 'foyer-1',
          containerType: 'page',
          containerAri: 'ari:cloud:confluence::site/demo:page/1',
          pageId: 'p1',
          field: 'body',
          maskedPreview: preview,
          detectedAt: NOW,
          status: 'present',
          gite: 'corps-de-page',
        },
      ],
      ...(spaceKey === undefined ? {} : { spaceKey }),
    };
  }

  it('lecture autorisée → foyer complet', () => {
    const foyer = fakeFoyer('DEMO');
    const view = visibleTo(true, foyer);
    expect(view.kind).toBe('full');
    if (view.kind === 'full') expect(view.foyer).toBe(foyer);
  });

  it('lecture refusée → existence + propriétaire seulement, jamais le contenu', () => {
    const foyer = fakeFoyer('DEMO');
    const view = visibleTo(false, foyer, 'owner-ref-1');
    expect(view).toEqual({
      kind: 'space-aggregate',
      exists: true,
      spaceKey: 'DEMO',
      ownerRef: 'owner-ref-1',
    });
    // Aucune fuite : ni empreinte, ni famille, ni score, ni aperçu, ni emplacement.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(foyer.fingerprint);
    expect(serialized).not.toContain(foyer.locations[0]?.maskedPreview ?? '');
    expect(serialized).not.toContain('cloud-key');
    expect(serialized).not.toContain(foyer.locations[0]?.pageId ?? '');
    expect(Object.keys(view).sort()).toEqual(['exists', 'kind', 'ownerRef', 'spaceKey']);
  });

  it('sans propriétaire résolu, l’agrégat ne l’invente pas ; espace absent → « inconnu »', () => {
    const view = visibleTo(false, fakeFoyer());
    expect(view.kind).toBe('space-aggregate');
    if (view.kind === 'space-aggregate') {
      expect(view.spaceKey).toBe(UNKNOWN_SPACE_KEY);
      expect('ownerRef' in view).toBe(false);
    }
  });
});
