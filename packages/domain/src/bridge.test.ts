import { describe, expect, it } from 'vitest';
import { BRIDGE_METHODS } from './bridge';
import type { BridgeRequests, BridgeResults } from './bridge';

/**
 * Exhaustivité au niveau des types : chaque clé de BridgeRequests et de
 * BridgeResults doit figurer dans BRIDGE_METHODS, et réciproquement. Si une
 * méthode est ajoutée aux interfaces sans l'être à la liste (ou l'inverse),
 * ce fichier ne compile plus.
 */
type MissingFromList = Exclude<keyof BridgeRequests, (typeof BRIDGE_METHODS)[number]>;
type MissingFromRequests = Exclude<(typeof BRIDGE_METHODS)[number], keyof BridgeRequests>;
type MissingFromResults = Exclude<(typeof BRIDGE_METHODS)[number], keyof BridgeResults>;
type AssertNever<T extends never> = T;
export type _BridgeContractIsExhaustive = [
  AssertNever<MissingFromList>,
  AssertNever<MissingFromRequests>,
  AssertNever<MissingFromResults>,
];

describe('contrat du bridge', () => {
  it('aucune méthode en double', () => {
    expect(new Set(BRIDGE_METHODS).size).toBe(BRIDGE_METHODS.length);
  });

  it('les méthodes du rituel couvrent les cinq verbes attendus', () => {
    const ritual = BRIDGE_METHODS.filter((m) => m.startsWith('ritual/'));
    expect(ritual).toContain('ritual/attest');
    expect(ritual).toContain('ritual/redaction-preview');
    expect(ritual).toContain('ritual/redaction-apply');
    expect(ritual).toContain('ritual/purge-request');
    expect(ritual).toContain('ritual/ticket');
  });

  it('registry, budget, couverture, adoption, réglages et certificat sont présents', () => {
    for (const method of [
      'registry/list', 'finding/get', 'finding/dismiss',
      'sweep/start', 'sweep/status', 'budget/get', 'coverage/get',
      'adoption/list', 'adoption/assign', 'settings/get', 'settings/save',
      'certificate/generate', 'certificate/get', 'building/get', 'exposure/get',
    ] as const) {
      expect(BRIDGE_METHODS).toContain(method);
    }
  });
});
