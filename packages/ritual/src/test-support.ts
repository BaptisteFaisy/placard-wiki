/**
 * Fixtures de test du rituel — partagées par les fichiers `*.test.ts`.
 *
 * Règle PLA-N-09 héritée de `@placard/core` : aucune valeur au format réel
 * d'un secret n'est écrite dans le dépôt. Les valeurs factices sont
 * fabriquées à l'exécution par `fakeValue` (@placard/core).
 */

import type { Foyer, FoyerLocation, RotationAttestation } from '@placard-wiki/domain';
import { giteOf } from '@placard-wiki/domain';

/** Foyer de test : une clé cloud factice, deux emplacements, rotation non attestée. */
export function makeFoyer(overrides: Partial<Foyer> = {}): Foyer {
  const base: Foyer = {
    id: 'foyer-1',
    fingerprint: 'hmac256:0123456789abcdef0123456789abcdef',
    family: 'cloud-key',
    baseScore: 70,
    score: 74,
    scoreTerms: [
      { id: 'famille', points: 70, label: 'Famille « clés cloud »', method: 'barème §8' },
      { id: 'partage', points: 4, label: 'Partage « toute personne ayant le lien »', method: 'état de partage' },
    ],
    state: 'open',
    firstSeenAt: '2026-11-01T08:00:00.000Z',
    lastSeenAt: '2026-11-09T08:00:00.000Z',
    locations: [
      makeLocation('loc-page', 'page-1', 'page'),
      makeLocation('loc-template', 'page-2', 'template'),
    ],
  };
  return { ...base, ...overrides };
}

/** Emplacement de test (aperçu masqué, jamais la valeur). */
export function makeLocation(
  id: string,
  pageId: string,
  containerType: FoyerLocation['containerType'],
  overrides: Partial<FoyerLocation> = {},
): FoyerLocation {
  return {
    id,
    foyerId: 'foyer-1',
    containerType,
    containerAri: `ari:cloud:confluence::site/page/${pageId}`,
    pageId,
    field: 'body',
    maskedPreview: 'AKIA…(20)',
    detectedAt: '2026-11-09T08:00:00.000Z',
    status: 'present',
    gite: giteOf(containerType, 'body'),
    ...overrides,
  };
}

/** Attestation humaine valide (§9) : date et référence réelles, jamais un exemple. */
export function makeAttestation(overrides: Partial<RotationAttestation> = {}): RotationAttestation {
  return {
    foyerId: 'foyer-1',
    actorRef: 'ari:identity::alice',
    actorKind: 'human',
    provider: 'AWS',
    evidenceRef: 'SEC-417',
    attestedAt: '2026-11-12T09:30:00.000Z',
    strength: 'attested',
    ...overrides,
  };
}
