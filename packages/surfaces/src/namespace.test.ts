/**
 * Le namespace d'empreinte partagé (PW-31) — opt-in.
 *
 * Ce que ce fichier prouve :
 * 1. **sans** clé partagée, l'empreinte reste propre à l'installation : deux
 *    installations ne donnent pas la même empreinte (le comportement actuel,
 *    voulu par le cahier §4) ;
 * 2. **avec** clé partagée et même identifiant de namespace, deux
 *    installations donnent la **même** empreinte ;
 * 3. deux namespaces différents ne donnent **pas** la même empreinte ;
 * 4. la clé partagée n'apparaît nulle part dans ce qui est renvoyé.
 */

import { describe, expect, it } from 'vitest';
import { computeFingerprint } from '@placard/core';

import {
  deriveNamespaceKey,
  effectiveHmacKey,
  resolveNamespace,
} from './namespace';

/**
 * La valeur dont on compare les empreintes. Ce n'est **pas** une valeur au
 * format d'un secret (PLA-N-09) : une phrase de test ne peut rien fuiter.
 */
const VALEUR = 'valeur-de-test-partagee-entre-surfaces';

/** La clé partagée de test (une phrase, pas un secret). */
const CLE_PARTAGEE = 'cle-partagee-de-test';

/** L'empreinte d'une valeur sous une clé donnée. */
function empreinte(value: string, key: string): string {
  return computeFingerprint(value, key);
}

describe('namespace d’empreinte — clé propre à l’installation (par défaut)', () => {
  it('deux installations ne produisent pas la même empreinte', () => {
    const a = resolveNamespace({ installationId: 'inst-a', source: 'absent' });
    const b = resolveNamespace({ installationId: 'inst-b', source: 'absent' });
    expect(a.shared).toBe(false);
    expect(b.shared).toBe(false);
    const fpA = empreinte(VALEUR, effectiveHmacKey(a, undefined, 'cle-installation-a'));
    const fpB = empreinte(VALEUR, effectiveHmacKey(b, undefined, 'cle-installation-b'));
    expect(fpA).not.toBe(fpB);
  });

  it('le namespace porte l’identifiant d’installation : il n’est pas comparable', () => {
    const a = resolveNamespace({ installationId: 'inst-a', source: 'absent' });
    const b = resolveNamespace({ installationId: 'inst-b', source: 'absent' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toContain('inst-a');
  });

  it('une clé partagée sans identifiant laisse le partage désactivé, avec une raison', () => {
    const ns = resolveNamespace({
      sharedKey: CLE_PARTAGEE,
      installationId: 'inst-a',
      source: 'forge-variable',
    });
    expect(ns.shared).toBe(false);
    expect(ns.warning).toBeDefined();
    expect(ns.warning).toContain('namespace');
    // La clé effective reste celle de l'installation.
    expect(effectiveHmacKey(ns, CLE_PARTAGEE, 'cle-installation-a')).toBe('cle-installation-a');
  });
});

describe('namespace d’empreinte — partagé (opt-in)', () => {
  it('même clé partagée, même identifiant : la même empreinte', () => {
    const a = resolveNamespace({
      sharedKey: CLE_PARTAGEE,
      namespaceId: 'atlassian:acme',
      installationId: 'inst-a',
      source: 'forge-variable',
    });
    const b = resolveNamespace({
      sharedKey: CLE_PARTAGEE,
      namespaceId: 'atlassian:acme',
      installationId: 'inst-b',
      source: 'process-env',
    });
    expect(a.shared).toBe(true);
    expect(b.shared).toBe(true);
    const fpA = empreinte(VALEUR, effectiveHmacKey(a, CLE_PARTAGEE, 'cle-installation-a'));
    const fpB = empreinte(VALEUR, effectiveHmacKey(b, CLE_PARTAGEE, 'cle-installation-b'));
    expect(fpA).toBe(fpB);
  });

  it('identifiants de namespace différents : les empreintes diffèrent', () => {
    const a = resolveNamespace({
      sharedKey: CLE_PARTAGEE, namespaceId: 'atlassian:acme', installationId: 'inst-a', source: 'forge-variable',
    });
    const b = resolveNamespace({
      sharedKey: CLE_PARTAGEE, namespaceId: 'atlassian:autre', installationId: 'inst-b', source: 'forge-variable',
    });
    const fpA = empreinte(VALEUR, effectiveHmacKey(a, CLE_PARTAGEE, 'cle-installation-a'));
    const fpB = empreinte(VALEUR, effectiveHmacKey(b, CLE_PARTAGEE, 'cle-installation-b'));
    expect(fpA).not.toBe(fpB);
  });

  it('la clé effective est dérivée de la clé partagée et de l’identifiant', () => {
    const derived = deriveNamespaceKey(CLE_PARTAGEE, 'atlassian:acme');
    expect(derived).toHaveLength(64);
    expect(derived).not.toBe(CLE_PARTAGEE);
    expect(deriveNamespaceKey(CLE_PARTAGEE, 'atlassian:acme')).toBe(derived);
    expect(deriveNamespaceKey(CLE_PARTAGEE, 'atlassian:autre')).not.toBe(derived);
  });

  it('la clé partagée n’apparaît dans aucun état renvoyé', () => {
    const ns = resolveNamespace({
      sharedKey: CLE_PARTAGEE, namespaceId: 'atlassian:acme', installationId: 'inst-a', source: 'forge-variable',
    });
    expect(JSON.stringify(ns)).not.toContain(CLE_PARTAGEE);
  });
});
