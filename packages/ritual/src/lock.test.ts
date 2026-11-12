import { describe, expect, it } from 'vitest';

import { RITUAL_STEPS } from '@placard-wiki/domain';

import { REDACT_LOCK_REASON, canRedact, ritualStepStates, stepsInOrder } from './lock';
import { makeAttestation, makeFoyer } from './test-support';

/** Recette §25.7 (PW-09) : l'étape 2 est verrouillée sans attestation humaine. */
describe('canRedact — verrou PW-09', () => {
  it('vaut false sans attestation humaine (§25.7)', () => {
    const foyer = makeFoyer();
    expect(canRedact(foyer)).toBe(false);
    expect(canRedact(foyer, undefined)).toBe(false);
  });

  it('vaut false si le foyer n’a que des champs de rotation vides', () => {
    const foyer = makeFoyer({ rotatedAt: '', rotationEvidenceRef: '  ' });
    expect(canRedact(foyer)).toBe(false);
  });

  it("vaut false pour une attestation d'un autre foyer", () => {
    const foyer = makeFoyer();
    const autre = makeAttestation({ foyerId: 'foyer-999' });
    expect(canRedact(foyer, autre)).toBe(false);
  });

  it('vaut true avec une attestation humaine valide', () => {
    const foyer = makeFoyer();
    expect(canRedact(foyer, makeAttestation())).toBe(true);
  });

  it('vaut true si le foyer porte déjà la trace d’une rotation attestée', () => {
    const foyer = makeFoyer({
      state: 'rotation-attested',
      rotatedAt: '2026-11-12T09:30:00.000Z',
      rotationEvidenceRef: 'SEC-417',
    });
    expect(canRedact(foyer)).toBe(true);
  });
});

describe('ritualStepStates — les cinq étapes dans l’ordre imposé (§9)', () => {
  it('couvre RITUAL_STEPS (domaine), dans l’ordre', () => {
    const states = ritualStepStates(makeFoyer());
    expect(stepsInOrder(states)).toBe(true);
    expect(states.map((s) => s.step)).toEqual([...RITUAL_STEPS]);
  });

  it('verrouille « redact » avec sa raison écrite, sans attestation', () => {
    const states = ritualStepStates(makeFoyer());
    const redact = states.find((s) => s.step === 'redact');
    expect(redact?.state).toBe('locked');
    expect(redact?.note).toBe(REDACT_LOCK_REASON);
    const purge = states.find((s) => s.step === 'purge');
    expect(purge?.state).toBe('locked');
  });

  it('déverrouille « redact » avec une attestation humaine valide', () => {
    const states = ritualStepStates(makeFoyer(), makeAttestation());
    const rotate = states.find((s) => s.step === 'rotate');
    const redact = states.find((s) => s.step === 'redact');
    expect(rotate?.state).toBe('done');
    expect(redact?.state).toBe('pending');
  });

  it('marque « verify » done seulement au sceau de cire', () => {
    const sealed = makeFoyer({ state: 'sealed', rotatedAt: '2026-11-12T09:30:00.000Z', rotationEvidenceRef: 'SEC-417' });
    const states = ritualStepStates(sealed);
    expect(states.find((s) => s.step === 'verify')?.state).toBe('done');
    expect(states.find((s) => s.step === 'redact')?.state).toBe('done');
  });
});
