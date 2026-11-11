/**
 * Score de danger d'un foyer (§8) : applique le catalogue du domaine via
 * `@placard-wiki/exposure`, à partir des emplacements du foyer et de
 * l'exposition de sa page principale. Aucun score sans ses termes.
 */

import { computeDangerScore } from '@placard-wiki/exposure';
import type { DangerScoreInput, ScoredLocation } from '@placard-wiki/exposure';
import type { Foyer, PageExposure } from '@placard-wiki/domain';

/** Emplacements du foyer réduits à ce dont le score a besoin. */
function scoredLocations(foyer: Foyer): ScoredLocation[] {
  return foyer.locations.map((l) => ({
    status: l.status,
    containerType: l.containerType,
    pageId: l.pageId,
    versionNumber: l.versionNumber,
  }));
}

/** Option du score d'un foyer. */
export interface ScoreFoyerOptions {
  testContent?: boolean;
  knownFake?: boolean;
  archived?: boolean;
  rotatedAt?: string;
  now?: string;
}

/**
 * Recalcule le score d'un foyer avec l'exposition de sa page principale.
 * Si l'exposition manque (page illisible), on retombe sur une fourchette vide
 * et le score reste la base de famille — jamais un score inventé.
 */
export function scoreFoyer(
  foyer: Foyer,
  exposure: PageExposure | null,
  options: ScoreFoyerOptions = {},
): Foyer {
  const readers = exposure?.readers ?? { low: 0, high: 0, method: 'exposition indisponible', caveats: [] };
  const sharing = exposure?.sharing ?? 'space-default';
  const ai = exposure?.aiSurface ?? { presumedIndexed: false, hypothesis: true as const, method: '' };
  const input: DangerScoreInput = {
    family: foyer.family,
    locations: scoredLocations(foyer),
    readers,
    sharing,
    aiSurface: { presumedIndexed: ai.presumedIndexed },
    firstSeenAt: foyer.firstSeenAt,
  };
  if (options.testContent !== undefined) input.testContent = options.testContent;
  if (options.knownFake !== undefined) input.knownFake = options.knownFake;
  if (options.archived !== undefined) input.archived = options.archived;
  if (options.rotatedAt !== undefined) input.rotatedAt = options.rotatedAt;
  if (options.now !== undefined) input.now = options.now;
  const result = computeDangerScore(input);
  return { ...foyer, score: result.total, scoreTerms: result.terms };
}