import { describe, expect, it } from 'vitest';

import { fixedClock } from './ports.js';
import {
  REFUSAL_NO_ACTOR,
  REFUSAL_NO_REASON,
  REFUSAL_NO_REVIEW,
  attachRibbon,
  dismissedStillHolds,
  ribbonNeedsRevalidation,
} from './ribbon.js';
import { makeFoyer } from './test-support.js';

/** Recette §25.12 : raison écrite + personne + date de révision, revalidation au changement de page. */

const clock = fixedClock('2026-11-12T11:00:00.000Z');

function ribbon(overrides: Partial<Parameters<typeof attachRibbon>[0]> = {}) {
  return attachRibbon(
    { foyerId: 'foyer-1', reason: 'Compte de démonstration, clé factice assumée.', actorRef: 'ari:identity::bob', reviewAt: '2027-02-12T00:00:00.000Z', ...overrides },
    clock,
  );
}

describe('attachRibbon — les trois champs obligatoires (§25.12)', () => {
  it('refuse un ruban sans raison écrite', () => {
    expect(ribbon({ reason: '   ' })).toEqual({ ok: false, reason: REFUSAL_NO_REASON });
  });

  it('refuse un ruban sans personne', () => {
    expect(ribbon({ actorRef: '' })).toEqual({ ok: false, reason: REFUSAL_NO_ACTOR });
  });

  it('refuse un ruban sans date de révision (ou invalide)', () => {
    expect(ribbon({ reviewAt: '' })).toEqual({ ok: false, reason: REFUSAL_NO_REVIEW });
    expect(ribbon({ reviewAt: 'bientôt' }).ok).toBe(false);
  });

  it('accepte et produit le correctif du foyer (état dismissed)', () => {
    const result = ribbon();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.state).toBe('dismissed');
    expect(result.patch.dismissedReason).toContain('démonstration');
    expect(result.patch.dismissedReviewAt).toBe('2027-02-12T00:00:00.000Z');
    expect(result.attachedAt).toBe('2026-11-12T11:00:00.000Z');
  });
});

describe('revalidation au changement de page (§9)', () => {
  it('le ruban tient tant que la page n’a pas changé depuis sa pose', () => {
    expect(ribbonNeedsRevalidation('2026-11-12T11:00:00.000Z', '2026-11-12T10:00:00.000Z')).toBe(false);
  });

  it('le ruban est à revalider dès que la page change après sa pose', () => {
    expect(ribbonNeedsRevalidation('2026-11-12T11:00:00.000Z', '2026-11-13T09:00:00.000Z')).toBe(true);
  });

  it('dates illisibles : dans le doute, revalidation (jamais de confiance implicite)', () => {
    expect(ribbonNeedsRevalidation('?', '2026-11-13T09:00:00.000Z')).toBe(true);
  });

  it('dismissedStillHolds : faux si la page a changé, faux si le foyer n’est pas rubanné', () => {
    const dismissed = makeFoyer({ state: 'dismissed' });
    expect(dismissedStillHolds(dismissed, '2026-11-12T11:00:00.000Z', '2026-11-12T12:00:00.000Z')).toBe(false);
    expect(dismissedStillHolds(dismissed, '2026-11-12T11:00:00.000Z', '2026-11-12T10:00:00.000Z')).toBe(true);
    expect(dismissedStillHolds(makeFoyer(), '2026-11-12T11:00:00.000Z', '2026-11-12T10:00:00.000Z')).toBe(false);
  });
});
