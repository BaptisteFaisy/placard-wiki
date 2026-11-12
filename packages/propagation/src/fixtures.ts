/**
 * Fixtures de test du lot « propagation » — valeurs **factice** uniquement,
 * générées par `fake-values` de `vendor/placard/packages/core` (§27 : tout est
 * synthétique, aucune valeur réelle ne circule nulle part).
 */

import { computeFingerprint, fakeValue } from '@placard/core';

import { maskedPreviewOf, type WikiDetection, type WikiPageMeta } from './detection';

/** Sel de démonstration — une empreinte n'a de sens que pour son installation. */
export const SEL_DEMO = 'sel-de-demonstration-placard-wiki';

/** Une fausse clé AWS (`AKIA…`) — jamais une vraie (§5). */
export function fausseCleAws(seed = 'demo-aws'): string {
  return fakeValue('cloud-key', seed);
}

/** Empreinte HMAC d'une valeur factice, avec le sel de démo. */
export function empreinteDe(value: string): string {
  return computeFingerprint(value, SEL_DEMO);
}

let compteurAri = 0;

/** Détection wiki avec des valeurs par défaut cohérentes (corps de page). */
export function makeDetection(
  overrides: Partial<WikiDetection> & Pick<WikiDetection, 'fingerprint' | 'pageId'>,
): WikiDetection {
  compteurAri += 1;
  return {
    family: 'cloud-key',
    containerType: 'page',
    containerAri: `ari:cloud:confluence:::page/${overrides.pageId}#d${compteurAri}`,
    field: 'body',
    maskedPreview: 'AKIA…(20)',
    detectedAt: '2026-11-05T09:00:00.000Z',
    ...overrides,
  };
}

/** Métadonnées de page avec des valeurs par défaut (aucune date sensible). */
export function makePage(
  overrides: Partial<WikiPageMeta> & Pick<WikiPageMeta, 'pageId'>,
): WikiPageMeta {
  return {
    title: `Runbook ${overrides.pageId}`,
    createdAt: '2026-02-10T08:00:00.000Z',
    ...overrides,
  };
}

/** Aperçu masqué d'une valeur factice, pour les tests de bout en bout. */
export function aperçuDe(value: string): string {
  return maskedPreviewOf(value);
}
