import { describe, expect, it } from 'vitest';

import {
  BLOCKED_NO_API,
  BLOCKED_NO_RIGHTS,
  BLOCKED_NO_VERSIONS,
  adminPurgeBrief,
  foyerResteOuvert,
  purgeHistory,
} from './purge.js';
import type { PurgeTarget } from './purge.js';
import { fixedClock, sequenceIds } from './ports.js';
import { makeFoyer } from './test-support.js';

/** Recette §25.10 : purge impossible → demande admin groupée, foyer ouvert. */

const VERSIONS: PurgeTarget[] = [
  { pageId: 'page-1', versionNumbers: [3, 5] },
  { pageId: 'page-2', versionNumbers: [7] },
];

function params() {
  return { requestedByRef: 'ari:identity::alice', clock: fixedClock('2026-11-12T10:00:00.000Z'), ids: sequenceIds() };
}

describe('purgeHistory — possible (API + droits admin)', () => {
  it('crée la liste exacte : page, versions, empreinte via le foyer', () => {
    const foyer = makeFoyer();
    const outcome = purgeHistory(foyer, VERSIONS, true, true, params());
    expect(outcome.possible).toBe(true);
    expect(outcome.foyerState).toBe('purge-requested');
    expect(outcome.requests).toHaveLength(2);
    const first = outcome.requests[0]!;
    expect(first.pageId).toBe('page-1');
    expect(first.versionNumbers).toEqual([3, 5]);
    expect(first.foyerId).toBe(foyer.id);
    expect(first.state).toBe('requested');
    expect(first.blockedReason).toBeUndefined();
    expect(first.requestedAt).toBe('2026-11-12T10:00:00.000Z');
  });
});

describe('purgeHistory — impossible (§25.10)', () => {
  it('API incapable : blockedReason écrit, demande groupée, foyer reste ouvert', () => {
    const foyer = makeFoyer();
    const outcome = purgeHistory(foyer, VERSIONS, false, true, params());
    expect(outcome.possible).toBe(false);
    if (outcome.possible) return;
    expect(outcome.blockedReason).toBe(BLOCKED_NO_API);
    // Demande groupée à l'administrateur : liste exacte (page, version, empreinte).
    expect(outcome.adminBrief).toContain('- page page-1, version 3, empreinte ' + foyer.fingerprint);
    expect(outcome.adminBrief).toContain('- page page-1, version 5, empreinte ' + foyer.fingerprint);
    expect(outcome.adminBrief).toContain('- page page-2, version 7, empreinte ' + foyer.fingerprint);
    // Le foyer RESTE OUVERT : ni purgé, ni scellé.
    expect(foyerResteOuvert(outcome.foyerState)).toBe(true);
    expect(outcome.requests.every((request) => request.blockedReason === BLOCKED_NO_API)).toBe(true);
  });

  it('droits admin manquants : même honnêteté, autre raison écrite', () => {
    const outcome = purgeHistory(makeFoyer(), VERSIONS, true, false, params());
    expect(outcome.possible).toBe(false);
    if (outcome.possible) return;
    expect(outcome.blockedReason).toBe(BLOCKED_NO_RIGHTS);
    expect(foyerResteOuvert(outcome.foyerState)).toBe(true);
  });

  it('aucune version listée : pas de demande vide', () => {
    const outcome = purgeHistory(makeFoyer(), [], true, true, params());
    expect(outcome.possible).toBe(false);
    if (outcome.possible) return;
    expect(outcome.blockedReason).toBe(BLOCKED_NO_VERSIONS);
    expect(outcome.requests).toHaveLength(0);
  });

  it('la demande groupée ne contient aucune valeur brute — que l’empreinte', () => {
    const foyer = makeFoyer();
    const brief = adminPurgeBrief(foyer, VERSIONS, BLOCKED_NO_API);
    expect(brief).toContain(foyer.fingerprint);
    expect(brief).toContain('Demande groupée');
    expect(brief.length).toBeGreaterThan(0);
  });
});

describe('foyerResteOuvert', () => {
  it('seuls « purged » et « sealed » referment l’exposition', () => {
    expect(foyerResteOuvert('open')).toBe(true);
    expect(foyerResteOuvert('redacted')).toBe(true);
    expect(foyerResteOuvert('purge-impossible')).toBe(true);
    expect(foyerResteOuvert('purged')).toBe(false);
    expect(foyerResteOuvert('sealed')).toBe(false);
  });
});
