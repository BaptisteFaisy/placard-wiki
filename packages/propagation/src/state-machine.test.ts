/**
 * Machine à états (§9, §20) : transitions illégales refusées, sceau de cire,
 * ruban revalidé quand la page change (§25.12), page disparue (§24).
 */

import { describe, expect, it } from 'vitest';

import type { Foyer } from '@placard-wiki/domain';

import { fausseCleAws, empreinteDe, makeDetection } from './fixtures.js';
import { groupIntoFoyers } from './group.js';
import {
  ALLOWED_TRANSITIONS,
  TransitionIllégale,
  canTransitionState,
  checkSeal,
  dismissFoyer,
  markLocationsVanished,
  revalidateRibbons,
  sealFoyer,
  transitionFoyer,
} from './state-machine.js';

function foyerOuvert(): Foyer {
  const cle = fausseCleAws('recette-etats');
  const [foyer] = groupIntoFoyers([
    makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-runbook' }),
  ]);
  return foyer!;
}

const T = '2026-11-09T10:00:00.000Z';

describe('transitions d’état (§9)', () => {
  it('refuse les sauts : open → sealed est illégal', () => {
    expect(canTransitionState('open', 'sealed')).toBe(false);
    expect(() => transitionFoyer(foyerOuvert(), 'sealed', T)).toThrow(TransitionIllégale);
  });

  it('refuse de sceller sans être passé par la purge', () => {
    const tourné = transitionFoyer(foyerOuvert(), 'rotation-attested', T);
    expect(() => transitionFoyer(tourné, 'sealed', T)).toThrow(/Transition refusée/);
  });

  it('accepte le chemin complet du rituel : open → … → purged → sealed', () => {
    let f = foyerOuvert();
    for (const état of ['rotation-attested', 'redacted', 'purge-requested', 'purged'] as const) {
      f = transitionFoyer(f, état, T);
      expect(f.state).toBe(état);
    }
    const scellé = transitionFoyer(f, 'sealed', T);
    expect(scellé.state).toBe('sealed');
  });

  it('tout état peut rouvrir (nouvelle détection) sauf depuis dismissed vers sealed', () => {
    for (const état of Object.keys(ALLOWED_TRANSITIONS)) {
      if (état === 'open') continue;
      expect(ALLOWED_TRANSITIONS[état as keyof typeof ALLOWED_TRANSITIONS]).toContain('open');
    }
  });
});

describe('sceau de cire (§4, §9 étape 5)', () => {
  it('refusé sans attestation de rotation humaine', () => {
    const f = transitionFoyer(foyerOuvert(), 'rotation-attested', T);
    const check = checkSeal({ ...f, locations: [] }, undefined);
    expect(check.sealed).toBe(false);
    expect(check.missing.join(' ')).toContain('rotation attestée');
  });

  it('refusé tant qu’un emplacement est encore présent', () => {
    const f = {
      ...foyerOuvert(),
      state: 'purged' as const,
      rotatedAt: T,
      rotationEvidenceRef: 'SEC-417',
    };
    expect(() => sealFoyer(f, T)).toThrow(/encore présent/);
  });

  it('accepté : rotation attestée + tout caviardé + purge vérifiée', () => {
    const base = foyerOuvert();
    const f: Foyer = {
      ...base,
      state: 'purged',
      rotatedAt: T,
      rotationEvidenceRef: 'SEC-417',
      locations: base.locations.map((l) => ({ ...l, status: 'redacted' as const, redactedAt: T })),
    };
    expect(sealFoyer(f, T).state).toBe('sealed');
  });

  it('accepté avec purge impossible **documentée**, refusé sans raison écrite', () => {
    const base = foyerOuvert();
    const f: Foyer = {
      ...base,
      state: 'purge-impossible',
      rotatedAt: T,
      rotationEvidenceRef: 'SEC-417',
      locations: base.locations.map((l) => ({ ...l, status: 'redacted' as const, redactedAt: T })),
    };
    expect(() => sealFoyer(f, T)).toThrow(/raison écrite/);
    expect(sealFoyer(f, T, 'API Forge sans purge d’historique ; demande admin n° 12').state)
      .toBe('sealed');
  });
});

describe('rubans (§9, §25.12)', () => {
  it('un ruban sans raison écrite est refusé', () => {
    expect(() => dismissFoyer(foyerOuvert(), '   ', T)).toThrow(/raison écrite/);
  });

  it('un ruban est revalidé quand la page change', () => {
    const rubané = dismissFoyer(foyerOuvert(), 'Exemple de documentation AKIA…EXAMPLE', T);
    expect(rubané.state).toBe('dismissed');

    const pageModifiée = '2026-11-11T08:00:00.000Z';
    const resa = revalidateRibbons(rubané, pageModifiée);
    expect(resa.revalidated).toBe(true);
    expect(resa.foyer.dismissedReviewAt).toBe(pageModifiée);
    expect(resa.reason).toContain('re-confirmé');
  });

  it('page inchangée depuis la révision : rien ne bouge', () => {
    const rubané = dismissFoyer(foyerOuvert(), 'Faux positif : jeu de données', T);
    const resa = revalidateRibbons(rubané, '2026-11-09T09:00:00.000Z');
    expect(resa.revalidated).toBe(false);
    expect(resa.foyer).toEqual(rubané);
  });
});

describe('page disparue (§24)', () => {
  it('emplacements « disparus » + corbeille signalée comme résiduelle', () => {
    const f = foyerOuvert();
    const resa = markLocationsVanished(f, 'p-runbook');
    expect(resa.vanishedCount).toBe(1);
    expect(resa.foyer.locations[0]!.status).toBe('vanished');
    expect(resa.note).toContain('corbeille');
    expect(resa.foyer.state).toBe('open'); // exposition recalculée, foyer pas clos
  });
});
