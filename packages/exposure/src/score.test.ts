/**
 * Tests du score de danger (§8) : recette §25.5 (le partage ajoute son terme,
 * visible dans la fiche), §25.6 (chaque terme s'affiche, malus compris, avec
 * méthode + évidence), paliers de lecteurs uniques, tranches d'historique,
 * rotation, propagation, malus et clamp 0-100.
 */

import { describe, expect, it } from 'vitest';
import {
  BASE_SCORE_BY_FAMILY,
  SCORE_TERMS,
  type AppliedScoreTerm,
} from '@placard-wiki/domain';
import {
  computeDangerScore,
  daysSince,
  readersTierTerm,
  MS_PER_DAY,
  type DangerScoreInput,
  type ScoredLocation,
} from './score.js';

/** Horloge fixe : les tests sont déterministes (§22). */
const NOW = '2026-11-11T12:00:00.000Z';

function isoDaysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * MS_PER_DAY).toISOString();
}

/** Entrée minimale : base 55 (cloud-key) + version courante 20 = 75. */
function baseInput(overrides: Partial<DangerScoreInput> = {}): DangerScoreInput {
  return {
    family: 'cloud-key',
    locations: [{ status: 'present', containerType: 'page', pageId: 'p1' }],
    readers: { low: 3, high: 5, method: 'm', caveats: [] },
    sharing: 'space-default',
    aiSurface: { presumedIndexed: false },
    firstSeenAt: NOW,
    now: NOW,
    ...overrides,
  };
}

/** N versions historiques lisibles, numérotées 1..N. */
function versions(count: number): ScoredLocation[] {
  return Array.from({ length: count }, (_, index) => ({
    status: 'present' as const,
    containerType: 'version' as const,
    pageId: 'p1',
    versionNumber: index + 1,
  }));
}

function idsOf(terms: readonly AppliedScoreTerm[]): string[] {
  return terms.map((term) => term.id);
}

describe('computeDangerScore — catalogue §8 terme à terme', () => {
  it('cas minimal : base par famille + version courante, et rien d’autre', () => {
    const result = computeDangerScore(baseInput());
    expect(idsOf(result.terms)).toEqual(['base-family', 'current-version']);
    expect(result.total).toBe(BASE_SCORE_BY_FAMILY['cloud-key'] + 20);
  });

  it('le premier terme est toujours la base, dans l’ordre du catalogue', () => {
    const result = computeDangerScore(
      baseInput({
        locations: [...versions(25), { status: 'present', containerType: 'comment', pageId: 'p2' }],
        readers: { low: 900, high: 1500, method: 'm', caveats: [] },
        sharing: 'public',
        aiSurface: { presumedIndexed: true },
        firstSeenAt: isoDaysAgo(120),
        testContent: true,
        knownFake: true,
      }),
    );
    const order: readonly string[] = SCORE_TERMS.map((spec) => spec.id);
    const applied = result.terms.map((term) => order.indexOf(term.id));
    expect(applied[0]).toBe(0); // base-family d’abord
    expect(applied).toEqual([...applied].sort((a, b) => a - b));
  });

  it('§25.5 : partage « anyone with link » → terme public-share visible dans la fiche', () => {
    for (const sharing of ['public', 'anyone-with-link'] as const) {
      const result = computeDangerScore(baseInput({ sharing }));
      const term = result.terms.find((candidate) => candidate.id === 'public-share');
      expect(term, sharing).toBeDefined();
      expect(term?.points).toBe(10);
      expect(term?.evidence).toContain(sharing);
    }
    for (const sharing of ['restricted', 'space-default'] as const) {
      const result = computeDangerScore(baseInput({ sharing }));
      expect(idsOf(result.terms)).not.toContain('public-share');
    }
  });

  it('§25.6 : chaque terme appliqué porte libellé, méthode et évidence — malus compris', () => {
    const result = computeDangerScore(
      baseInput({ testContent: true, knownFake: true, archived: true }),
    );
    expect(result.terms.length).toBeGreaterThanOrEqual(5);
    for (const term of result.terms) {
      expect(term.label.length, term.id).toBeGreaterThan(3);
      expect(term.method.length, term.id).toBeGreaterThan(10);
      expect(term.evidence ?? '', term.id).not.toBe('');
    }
    const malus = result.terms.filter((term) => term.points < 0);
    expect(idsOf(malus).sort()).toEqual(['archived-restricted', 'known-fake', 'test-content']);
    expect(malus.map((term) => term.points)).toEqual([-30, -20, -15]);
  });
});

describe('paliers de lecteurs — un seul palier (§8)', () => {
  it('readersTierTerm choisit le palier le plus haut franchi, sinon rien', () => {
    expect(readersTierTerm(1001)?.id).toBe('readers-1000');
    expect(readersTierTerm(500)?.id).toBe('readers-100');
    expect(readersTierTerm(50)?.id).toBe('readers-10');
    expect(readersTierTerm(10)).toBeNull();
    expect(readersTierTerm(0)).toBeNull();
  });

  it('jamais deux paliers de lecteurs dans les termes appliqués', () => {
    for (const high of [5, 11, 101, 1001, 100_000]) {
      const result = computeDangerScore(
        baseInput({ readers: { low: 0, high, method: 'm', caveats: [] } }),
      );
      const tiers = result.terms.filter((term) => term.id.startsWith('readers-'));
      expect(tiers.length, `high=${high}`).toBeLessThanOrEqual(1);
      if (high > 1000) expect(tiers[0]?.id).toBe('readers-1000');
    }
  });
});

describe('historique et profondeur (§8)', () => {
  it('version historique lisible → +15, sans tranche sous 10 versions', () => {
    const result = computeDangerScore(baseInput({ locations: versions(9) }));
    expect(idsOf(result.terms)).toContain('history-present');
    expect(idsOf(result.terms)).not.toContain('history-depth');
    expect(idsOf(result.terms)).not.toContain('current-version'); // aucune version courante
  });

  it('+5 par tranche de 10 versions concernées', () => {
    const ten = computeDangerScore(baseInput({ locations: versions(10) }));
    expect(ten.terms.find((t) => t.id === 'history-depth')?.points).toBe(5);
    const twentyFive = computeDangerScore(baseInput({ locations: versions(25) }));
    expect(twentyFive.terms.find((t) => t.id === 'history-depth')?.points).toBe(10);
  });

  it('versions caviardées ou disparues ne comptent plus (§24)', () => {
    const result = computeDangerScore(
      baseInput({
        locations: [
          { status: 'redacted', containerType: 'version', pageId: 'p1', versionNumber: 3 },
          { status: 'vanished', containerType: 'version', pageId: 'p1', versionNumber: 4 },
        ],
      }),
    );
    expect(idsOf(result.terms)).not.toContain('history-present');
  });
});

describe('rotation, propagation, archivée/restreinte (§8)', () => {
  it('rotation inconnue depuis plus de 90 jours → +10 ; attestation ou ≤ 90 jours → rien', () => {
    const old = computeDangerScore(baseInput({ firstSeenAt: isoDaysAgo(91) }));
    expect(idsOf(old.terms)).toContain('rotation-unknown-90d');
    const fresh = computeDangerScore(baseInput({ firstSeenAt: isoDaysAgo(90) }));
    expect(idsOf(fresh.terms)).not.toContain('rotation-unknown-90d');
    const rotated = computeDangerScore(
      baseInput({ firstSeenAt: isoDaysAgo(400), rotatedAt: isoDaysAgo(2) }),
    );
    expect(idsOf(rotated.terms)).not.toContain('rotation-unknown-90d');
    expect(daysSince(isoDaysAgo(400), NOW)).toBe(400);
  });

  it('propagation : 3 emplacements distincts ou plus → +10, doublons et disparus exclus', () => {
    const three = computeDangerScore(
      baseInput({
        locations: [
          { status: 'present', containerType: 'page', pageId: 'p1' },
          { status: 'present', containerType: 'comment', pageId: 'p1' },
          { status: 'present', containerType: 'page', pageId: 'p2' },
        ],
      }),
    );
    expect(idsOf(three.terms)).toContain('propagation-3');
    const duplicated = computeDangerScore(
      baseInput({
        locations: [
          { status: 'present', containerType: 'page', pageId: 'p1' },
          { status: 'present', containerType: 'page', pageId: 'p1' },
          { status: 'vanished', containerType: 'page', pageId: 'p3' },
        ],
      }),
    );
    expect(idsOf(duplicated.terms)).not.toContain('propagation-3');
  });

  it('archivée OU restreinte à moins de 3 lecteurs → −15 (une seule fois)', () => {
    const archived = computeDangerScore(baseInput({ archived: true }));
    const restricted = computeDangerScore(
      baseInput({ readers: { low: 0, high: 2, method: 'm', caveats: [] } }),
    );
    for (const result of [archived, restricted]) {
      const malus = result.terms.filter((term) => term.id === 'archived-restricted');
      expect(malus).toHaveLength(1);
      expect(malus[0]?.points).toBe(-15);
    }
  });

  it('surface IA : terme présent seulement si la page est présumée indexée (§13)', () => {
    const indexed = computeDangerScore(baseInput({ aiSurface: { presumedIndexed: true } }));
    expect(indexed.terms.find((t) => t.id === 'ai-surface')?.points).toBe(10);
    expect(indexed.terms.find((t) => t.id === 'ai-surface')?.method).toContain('hypothèse');
    const notIndexed = computeDangerScore(baseInput());
    expect(idsOf(notIndexed.terms)).not.toContain('ai-surface');
  });
});

describe('total borné 0-100 (§8)', () => {
  it('plafond : tous les bonus réunis → 100, jamais plus', () => {
    const result = computeDangerScore(
      baseInput({
        locations: [{ status: 'present', containerType: 'page', pageId: 'p1' }, ...versions(25)],
        readers: { low: 1200, high: 5000, method: 'm', caveats: [] },
        sharing: 'public',
        aiSurface: { presumedIndexed: true },
        firstSeenAt: isoDaysAgo(412),
      }),
    );
    expect(result.total).toBe(100);
  });

  it('plancher : malus cumulés → 0, jamais négatif', () => {
    const result = computeDangerScore(
      baseInput({
        family: 'suspicious-string',
        locations: [{ status: 'redacted', containerType: 'page', pageId: 'p1' }],
        testContent: true,
        knownFake: true,
        archived: true,
      }),
    );
    expect(result.total).toBe(0);
    expect(idsOf(result.terms)).toContain('test-content');
  });

  it('le total reste dans 0-100 sur un balayage de combinaisons', () => {
    for (const family of Object.keys(BASE_SCORE_BY_FAMILY) as Array<keyof typeof BASE_SCORE_BY_FAMILY>) {
      for (const high of [0, 50, 500, 5000]) {
        const result = computeDangerScore(
          baseInput({ family, readers: { low: 0, high, method: 'm', caveats: [] } }),
        );
        expect(result.total, `${family}/${high}`).toBeGreaterThanOrEqual(0);
        expect(result.total, `${family}/${high}`).toBeLessThanOrEqual(100);
      }
    }
  });
});
