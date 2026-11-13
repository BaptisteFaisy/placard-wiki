/**
 * La lecture de la configuration d'installation (PW-31).
 *
 * Ce que ce fichier prouve :
 * 1. sans variable, le namespace est **propre à l'installation** (le
 *    comportement actuel, voulu par le cahier §4) ;
 * 2. avec les deux variables, le namespace est **partagé** — c'est
 *    l'opt-in de l'administrateur ;
 * 3. la clé partagée seule ne suffit pas : le partage reste désactivé, avec
 *    une raison écrite ;
 * 4. la variable statique Forge est lue comme `process.env` ;
 * 5. la clé partagée n'apparaît dans aucun état renvoyé ni journalisé.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readNamespaceSetup, configVariable } from './secret';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuration du namespace — par défaut', () => {
  it('sans variable : le namespace est propre à l’installation', () => {
    const { namespace, sharedKey } = readNamespaceSetup('inst-a');
    expect(namespace.shared).toBe(false);
    expect(namespace.id).toBe('installation:inst-a');
    expect(sharedKey).toBeUndefined();
    expect(namespace.warning).toBeUndefined();
  });

  it('la variable absente est lue comme absente', () => {
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE_KEY', '');
    expect(configVariable('PW_FINGERPRINT_NAMESPACE_KEY')).toBeUndefined();
  });
});

describe('configuration du namespace — partagé (opt-in)', () => {
  it('les deux variables : le namespace est partagé', () => {
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE_KEY', 'cle-partagee-de-test');
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE', 'atlassian:acme');
    const { namespace, sharedKey } = readNamespaceSetup('inst-a');
    expect(namespace.shared).toBe(true);
    expect(namespace.id).toBe('atlassian:acme');
    expect(namespace.source).toBe('process-env');
    expect(sharedKey).toBe('cle-partagee-de-test');
  });

  it('la variable statique Forge est lue aussi', () => {
    vi.stubEnv('FORGE_VARIABLES', JSON.stringify({
      PW_FINGERPRINT_NAMESPACE_KEY: 'cle-partagee-de-test',
      PW_FINGERPRINT_NAMESPACE: 'atlassian:acme',
    }));
    const { namespace } = readNamespaceSetup('inst-a');
    expect(namespace.shared).toBe(true);
    expect(namespace.id).toBe('atlassian:acme');
    expect(namespace.source).toBe('forge-variable');
  });

  it('la clé seule : le partage reste désactivé, avec une raison', () => {
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE_KEY', 'cle-partagee-de-test');
    const { namespace } = readNamespaceSetup('inst-a');
    expect(namespace.shared).toBe(false);
    expect(namespace.warning).toBeDefined();
    expect(namespace.warning).toContain('namespace');
  });

  it('la clé partagée n’apparaît dans aucun état renvoyé', () => {
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE_KEY', 'cle-partagee-de-test');
    vi.stubEnv('PW_FINGERPRINT_NAMESPACE', 'atlassian:acme');
    const { namespace } = readNamespaceSetup('inst-a');
    expect(JSON.stringify(namespace)).not.toContain('cle-partagee-de-test');
  });
});
