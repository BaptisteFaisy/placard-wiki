/**
 * Le client du bridge — prouve le chargement à l'appel du pont Forge
 * (`@forge/bridge` lève à l'importation hors produit) et l'enveloppe honnête
 * (`ok` / `pending` / `error`) promise par `callBridge` (§23 : jamais d'écran
 * cassé, jamais de faux zéro).
 *
 * `@forge/bridge` est simulé via `vi.mock` : sans ce garde, l'import jette
 * « Unable to establish a connection with the Custom UI bridge ».
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callBridge, outcomeNote } from './bridge';
import { bannerChannel } from './realtime';
import type { SpaceSettings } from '@placard-wiki/domain';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@forge/bridge', () => ({ invoke: invokeMock }));

const DEMO_SETTINGS: SpaceSettings = {
  spaceKey: 'DEMO',
  familiesEnabled: ['cloud-key'],
  minScore: 40,
  exclusions: [{ pattern: 'example', reason: 'hors périmètre' }],
  purgePolicy: 'request-admin',
  demoMode: true,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe('callBridge', () => {
  it('renvoie ok avec les données typées quand le pont répond le contrat', async () => {
    invokeMock.mockResolvedValue(DEMO_SETTINGS);

    const outcome = await callBridge('settings/get', { spaceKey: 'DEMO' });

    expect(outcome).toEqual({ kind: 'ok', data: DEMO_SETTINGS });
    expect(invokeMock).toHaveBeenCalledWith('settings/get', { spaceKey: 'DEMO' });
  });

  it('traduit le corps « pas encore implémenté » en attente honnête', async () => {
    invokeMock.mockResolvedValue({ notImplemented: 'settings/get', honesty: 'réglages en mémoire pour l’instant' });

    const outcome = await callBridge('settings/get', { spaceKey: 'DEMO' });

    expect(outcome).toEqual({
      kind: 'pending',
      method: 'settings/get',
      honesty: 'réglages en mémoire pour l’instant',
    });
  });

  it('capture une erreur du pont et ne lève jamais', async () => {
    invokeMock.mockRejectedValue(new Error('bridge down'));

    const outcome = await callBridge('settings/get', { spaceKey: 'DEMO' });

    expect(outcome).toEqual({ kind: 'error', method: 'settings/get', message: 'bridge down' });
  });

  it('signale une réponse vide (jamais de faux zéro)', async () => {
    invokeMock.mockResolvedValue(undefined);

    const outcome = await callBridge('settings/get', { spaceKey: 'DEMO' });

    expect(outcome.kind).toBe('error');
  });
});

describe('outcomeNote', () => {
  it('renvoie null pour un succès', () => {
    expect(outcomeNote({ kind: 'ok', data: 1 })).toBeNull();
  });

  it('décrit l’attente et l’erreur avec la clé de la méthode', () => {
    expect(outcomeNote({ kind: 'pending', method: 'settings/get', honesty: 'en mémoire' })).toEqual({
      title: 'settings/get',
      body: 'en mémoire',
    });
    expect(outcomeNote({ kind: 'error', method: 'settings/get', message: 'down' })).toEqual({
      title: 'settings/get',
      body: 'down',
    });
  });
});

describe('bannerChannel', () => {
  it('nomme le canal temps réel d’une page', () => {
    expect(bannerChannel('123')).toBe('placard-banner:123');
  });
});