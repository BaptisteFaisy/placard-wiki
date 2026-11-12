// Tests du shim WebCrypto (lib/fingerprint.ts) — empreinte HMAC-SHA-256.

import { describe, expect, it } from 'vitest';
import { DEMO_HMAC_KEY, hmacFingerprint, toHex } from './fingerprint.js';

describe('hmacFingerprint — shim WebCrypto', () => {
  it('produit 64 caractères hexadécimaux, comme computeFingerprint (Git)', async () => {
    const fp = await hmacFingerprint('valeur-factice-de-test');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe pour une même clé', async () => {
    const a = await hmacFingerprint('même-valeur');
    const b = await hmacFingerprint('même-valeur');
    expect(a).toBe(b);
  });

  it('change avec la clé (l’empreinte dépend de la clé d’installation)', async () => {
    const a = await hmacFingerprint('même-valeur', DEMO_HMAC_KEY);
    const b = await hmacFingerprint('même-valeur', 'autre-cle-de-demo');
    expect(a).not.toBe(b);
  });

  it('toHex encode tous les octets sur deux chiffres', () => {
    expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
  });
});
