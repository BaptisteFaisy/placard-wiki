import { describe, expect, it } from 'vitest';

import { sealFoyer } from './seal';
import { makeAttestation, makeFoyer } from './test-support';

describe('sealFoyer — le sceau de cire (§9)', () => {
  const attestation = makeAttestation();

  it('purge vérifiée : rotation + caviardage + purge vérifiée → sealed, base distincte', () => {
    const foyer = makeFoyer({ state: 'purged' });
    const outcome = sealFoyer({ foyer, attestation, purgeVerified: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state).toBe('sealed');
      expect(outcome.basis).toBe('purge-verifiee');
      expect(outcome.note).toContain('Purge vérifiée');
    }
  });

  it('purge impossible documentée : sealed aussi, mais base distincte', () => {
    const foyer = makeFoyer({ state: 'purge-impossible' });
    const outcome = sealFoyer({ foyer, attestation, purgeImpossibleReason: 'L’identité de l’app reçoit HTTP 401.' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.basis).toBe('purge-impossible-documentee');
      expect(outcome.note).toContain('impossible documentée');
    }
  });

  it('raison manquante : ni purge vérifiée ni impossibilité documentée → refus', () => {
    const foyer = makeFoyer({ state: 'purge-requested' });
    const outcome = sealFoyer({ foyer, attestation, purgeVerified: false });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('ni l’une ni l’autre');
  });

  it('sans rotation attestée : refus, le foyer reste ouvert', () => {
    const foyer = makeFoyer({ state: 'purged' });
    const outcome = sealFoyer({ foyer, purgeVerified: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('rotation attestée');
  });

  it('sans caviardage : refus', () => {
    const foyer = makeFoyer({ state: 'rotation-attested' });
    const outcome = sealFoyer({ foyer, attestation, purgeVerified: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('caviardage');
  });

  it('les deux bases sont bien distinctes l’une de l’autre', () => {
    expect('purge-verifiee').not.toBe('purge-impossible-documentee');
  });
});