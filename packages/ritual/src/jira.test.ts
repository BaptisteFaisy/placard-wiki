import { describe, expect, it } from 'vitest';

import type { OwnerResolution } from '@placard-wiki/domain';
import { fakeValue, redactPreview } from '@placard/core';

import { foyerMaskedPreview, jiraTicketPayload } from './jira.js';
import { makeFoyer } from './test-support.js';

/** PW-13 : ticket assigné au propriétaire résolu, sans valeur brute (§5). */

const SECRET = fakeValue('cloud-key', 'graine-jira');

function owner(overrides: Partial<OwnerResolution> = {}): OwnerResolution {
  return {
    pageId: 'page-1',
    ownerRef: 'ari:identity::alice',
    method: 'declared-owner',
    confidence: 'high',
    resolvedAt: '2026-11-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('jiraTicketPayload', () => {
  it('assigne au propriétaire résolu, avec sa méthode affichée (§12)', () => {
    const payload = jiraTicketPayload(makeFoyer(), owner(), 'SEC');
    expect(payload.projectKey).toBe('SEC');
    expect(payload.assignee).toBe('ari:identity::alice');
    expect(payload.ownerMethod).toBe('declared-owner');
    expect(payload.issueType).toBe('Task');
  });

  it('personne en vue (confiance none) : pas d’assignation inventée, file d’adoption', () => {
    const payload = jiraTicketPayload(makeFoyer(), owner({ ownerRef: undefined, confidence: 'none', method: 'adoption-queue' }), 'SEC');
    expect(payload.assignee).toBeUndefined();
    expect(payload.description).toContain('file d’adoption');
  });

  it('ne transporte aucune valeur brute — seulement empreinte et aperçu masqué (§5)', () => {
    const masked = redactPreview(SECRET, 'cloud-key');
    const foyer = makeFoyer();
    foyer.locations = foyer.locations.map((location) => ({ ...location, maskedPreview: masked }));
    const payload = jiraTicketPayload(foyer, owner(), 'SEC');
    const serialized = JSON.stringify(payload);
    // La valeur factice d'entrée ne sort jamais — pas même un fragment.
    expect(serialized).not.toContain(SECRET);
    expect(serialized).toContain(foyer.fingerprint);
    expect(payload.description).toContain(masked);
    expect(payload.summary).toContain(masked);
    // Les termes du score sont là (§8 : aucun score sans ses termes).
    expect(payload.description).toContain('barème §8');
    expect(payload.description).toContain('74/100');
  });

  it('priorité : Highest à partir de 70 de danger', () => {
    expect(jiraTicketPayload(makeFoyer(), owner(), 'SEC').priority).toBe('Highest');
    expect(jiraTicketPayload(makeFoyer({ score: 42 }), owner(), 'SEC').priority).toBe('High');
  });

  it('foyerMaskedPreview retombe sur ses pieds sans emplacement', () => {
    expect(foyerMaskedPreview(makeFoyer({ locations: [] }))).toBe('[aperçu indisponible]');
  });
});
