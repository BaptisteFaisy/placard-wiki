/**
 * Recette §25.4 : le secret est présent dans un modèle → le modèle est
 * proposé en premier dans le lot de caviardage (§11 : l'ordre compte).
 */

import { describe, expect, it } from 'vitest';

import { fausseCleAws, empreinteDe, makeDetection } from './fixtures.js';
import { groupIntoFoyers } from './group.js';
import { redactionOrder } from './redaction-order.js';

describe('redactionOrder (§11, §25.4)', () => {
  const cle = fausseCleAws('recette-25-4');
  const empreinte = empreinteDe(cle);
  const détections = [
    makeDetection({
      fingerprint: empreinte,
      pageId: 'p-forte',
      containerAri: 'ari:cloud:confluence:::page/p-forte',
      detectedAt: '2026-03-01T09:00:00.000Z',
    }),
    makeDetection({
      fingerprint: empreinte,
      pageId: 'p-faible',
      containerAri: 'ari:cloud:confluence:::page/p-faible',
      detectedAt: '2026-03-02T09:00:00.000Z',
    }),
    makeDetection({
      fingerprint: empreinte,
      pageId: 'p-modele',
      containerType: 'template',
      containerAri: 'ari:cloud:confluence:::template/tpl-runbook',
      detectedAt: '2026-03-03T09:00:00.000Z',
    }),
    makeDetection({
      fingerprint: empreinte,
      pageId: 'p-forte',
      containerType: 'version',
      containerAri: 'ari:cloud:confluence:::page/p-forte/version/3',
      versionNumber: 3,
      detectedAt: '2026-03-04T09:00:00.000Z',
    }),
  ];

  it('modèle premier, puis version courante, puis exposition décroissante', () => {
    const [foyer] = groupIntoFoyers(détections);
    const ordre = redactionOrder(foyer!, new Map([
      ['p-forte', 82],
      ['p-faible', 30],
    ]));

    expect(ordre.templateFirst).toBe(true);
    const séquence = ordre.orderedLocations.map((l) => `${l.containerType}:${l.pageId}`);
    expect(séquence).toEqual([
      'template:p-modele', // §25.4 : le modèle d'abord, sinon il recopie
      'page:p-forte',      // exposition 82 avant 30
      'page:p-faible',
      'version:p-forte',   // l'historique en dernier : caviardage impossible (§9)
    ]);
  });

  it('sans données d’exposition, l’ordre chronologique prend le relais', () => {
    const [foyer] = groupIntoFoyers(détections);
    const ordre = redactionOrder(foyer!);
    expect(ordre.orderedLocations[0]!.containerType).toBe('template');
    expect(ordre.orderedLocations[1]!.pageId).toBe('p-forte'); // détecté en premier
  });

  it('les emplacements déjà caviardés ou disparus sortent du lot', () => {
    const [foyer] = groupIntoFoyers(détections);
    const nettoyé = {
      ...foyer!,
      locations: foyer!.locations.map((l) =>
        l.pageId === 'p-faible' ? { ...l, status: 'redacted' as const, redactedAt: '2026-11-08T09:00:00.000Z' } : l,
      ),
    };
    const ordre = redactionOrder(nettoyé);
    expect(ordre.orderedLocations.some((l) => l.pageId === 'p-faible')).toBe(false);
    expect(ordre.exclus).toHaveLength(1);
    expect(ordre.exclus[0]!.status).toBe('redacted');
  });
});
