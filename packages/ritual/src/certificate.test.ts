import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BLIND_SPOTS,
  canonicalJson,
  certificate,
  contentHashOf,
  verifyCertificate,
} from './certificate';
import type { CertificateCounters } from './certificate';
import { fixedClock } from './ports';

/** Recette §25.16 : le certificat chiffre tout, et son intégrité est un HMAC-SHA-256 du JSON canonique. */

const COUNTERS: CertificateCounters = {
  open: 3,
  rotated: 12,
  redacted: 9,
  purged: 4,
  residualExposure: 'entre 340 et 1 200 lecteurs potentiels (permissions d’espace + partage, §8)',
};

const KEY = 'cle-installation-test';
const clock = fixedClock('2026-11-12T12:00:00.000Z');

describe('certificate (§25.16)', () => {
  it('chiffre : ouverts, tournés, caviardés, purgés, exposition résiduelle, angles morts', () => {
    const cert = certificate('space:SEC', COUNTERS, [], KEY, clock);
    expect(cert.open).toBe(3);
    expect(cert.rotated).toBe(12);
    expect(cert.redacted).toBe(9);
    expect(cert.purged).toBe(4);
    expect(cert.residualExposure).toContain('340');
    // Angles morts non fournis → les angles morts par défaut, déclarés.
    expect(cert.blindSpots).toEqual([...DEFAULT_BLIND_SPOTS]);
    expect(cert.scope).toBe('space:SEC');
    expect(cert.issuedAt).toBe('2026-11-12T12:00:00.000Z');
  });

  it('conserve les angles morts fournis (déclarés, jamais masqués, §19)', () => {
    const spots = ['Whiteboards non balayés', 'Droit manquant sur le Teamwork Graph'];
    const cert = certificate('site', COUNTERS, spots, KEY, clock);
    expect(cert.blindSpots).toEqual(spots);
  });

  it('contentHash = HMAC-SHA-256 du JSON canonique avec la clé d’installation', () => {
    const cert = certificate('space:SEC', COUNTERS, [], KEY, clock);
    // Recalcul indépendant, dans le test : même algorithme, même résultat.
    const content = canonicalJson({
      scope: cert.scope,
      issuedAt: cert.issuedAt,
      open: cert.open,
      rotated: cert.rotated,
      redacted: cert.redacted,
      purged: cert.purged,
      residualExposure: cert.residualExposure,
      blindSpots: cert.blindSpots,
    });
    const expected = `hmac256:${createHmac('sha256', KEY).update(content).digest('hex')}`;
    expect(cert.contentHash).toBe(expected);
    expect(verifyCertificate(cert, KEY)).toBe(true);
  });

  it('JSON canonique : l’ordre des clés n’influe pas sur l’empreinte', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(canonicalJson({ a: [2, { c: 3, d: 4 }], b: 1 }));
  });

  it('toute altération du certificat casse la vérification', () => {
    const cert = certificate('space:SEC', COUNTERS, [], KEY, clock);
    expect(verifyCertificate({ ...cert, open: 0 }, KEY)).toBe(false);
    expect(verifyCertificate(cert, 'autre-clé')).toBe(false);
  });

  it('contentHashOf est déterministe et dépend de la clé', () => {
    const content = { scope: 'site', open: 1 };
    expect(contentHashOf(content, KEY)).toBe(contentHashOf({ open: 1, scope: 'site' }, KEY));
    expect(contentHashOf(content, KEY)).not.toBe(contentHashOf(content, 'autre-clé'));
  });
});
