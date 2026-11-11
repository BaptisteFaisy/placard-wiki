import { describe, expect, it } from 'vitest';

import {
  ROTATION_PROVIDERS,
  REFUSAL_AGENT,
  REFUSAL_NO_EVIDENCE,
  REFUSAL_UNKNOWN_PROVIDER,
  attestRotation,
  isKnownProvider,
} from './attestation.js';
import { fixedClock } from './ports.js';
import { makeAttestation } from './test-support.js';

/** Recette §25.8 + §17 : l'attestation est un fait humain, horodaté, avec preuve. */
describe('attestRotation', () => {
  const clock = fixedClock('2026-11-12T09:30:00.000Z');

  it('refuse explicitement une attestation déposée par un agent (§25.8)', () => {
    const result = attestRotation(
      {
        foyerId: 'foyer-1',
        provider: 'AWS',
        evidenceRef: 'SEC-417',
        actorRef: 'ari:agent::rovo-gardien',
        actorKind: 'agent',
      },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Le refus est explicite et écrit — jamais silencieux.
    expect(result.reason).toBe(REFUSAL_AGENT);
    expect(result.reason).toContain('agent');
  });

  it('refuse une preuve vide (§9 : lien vers la preuve obligatoire)', () => {
    const result = attestRotation(
      {
        foyerId: 'foyer-1',
        provider: 'AWS',
        evidenceRef: '   ',
        actorRef: 'ari:identity::alice',
        actorKind: 'human',
      },
      clock,
    );
    expect(result).toEqual({ ok: false, reason: REFUSAL_NO_EVIDENCE });
  });

  it('refuse un fournisseur hors de la liste fermée du §9', () => {
    const result = attestRotation(
      {
        foyerId: 'foyer-1',
        provider: 'fournisseur-inconnu',
        evidenceRef: 'SEC-417',
        actorRef: 'ari:identity::alice',
        actorKind: 'human',
      },
      clock,
    );
    expect(result).toEqual({ ok: false, reason: REFUSAL_UNKNOWN_PROVIDER });
  });

  it('accepte les huit fournisseurs du rituel (§9)', () => {
    const expected = [
      'AWS',
      'GitHub',
      'Stripe',
      'OpenAI',
      'Slack',
      'Google Workspace',
      'internal-db',
      'generic',
    ];
    expect([...ROTATION_PROVIDERS]).toEqual(expected);
    for (const provider of expected) {
      expect(isKnownProvider(provider)).toBe(true);
      const result = attestRotation(
        { foyerId: 'foyer-1', provider, evidenceRef: 'SEC-417', actorRef: 'ari:identity::alice', actorKind: 'human' },
        clock,
      );
      expect(result.ok).toBe(true);
    }
  });

  it('produit une attestation horodatée strength "attested", et c’est tout', () => {
    const result = attestRotation(
      {
        foyerId: 'foyer-1',
        provider: 'AWS',
        evidenceRef: 'SEC-417',
        actorRef: 'ari:identity::alice',
        actorKind: 'human',
      },
      clock,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attestation).toEqual(makeAttestation());
    // Preuve *attestée*, pas une preuve machine : une seule force possible.
    expect(result.attestation.strength).toBe('attested');
    expect(result.attestation.actorKind).toBe('human');
    // La date est celle de l'attestation (horloge injectée), jamais celle de la clé.
    expect(result.attestation.attestedAt).toBe('2026-11-12T09:30:00.000Z');
  });
});
