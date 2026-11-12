// Réglages d'espace par défaut (§18 écran 5, PW-24) — typés `SpaceSettings`
// du domaine. L'écran Réglages les modifie LOCALEMENT (état React), avec
// effet visible sur le registre : familles actives, seuil, exclusions,
// politique de purge, mode démo.

import type { SpaceSettings, WikiFamily } from '@placard-wiki/domain';
import { FAMILY_LABELS } from '@placard-wiki/domain';

/** Toutes les familles du domaine (11 identifiants pour 12 numéros, §7). */
export const ALL_FAMILIES: readonly WikiFamily[] = Object.keys(FAMILY_LABELS) as WikiFamily[];

/** Réglages par défaut d'un espace : tout actif, seuil 0, rien d'exclu. */
export function defaultSettingsFor(spaceKey: string, minScore = 0, demoMode = true): SpaceSettings {
  return {
    spaceKey,
    familiesEnabled: [...ALL_FAMILIES],
    minScore,
    exclusions: [],
    purgePolicy: 'request-admin',
    demoMode,
  };
}

/** Jeu initial des trois espaces de la démo (§15 : mode démo marqué). */
export const INITIAL_SETTINGS: Readonly<Record<string, SpaceSettings>> = {
  DEMO: defaultSettingsFor('DEMO', 0, true),
  OPS: {
    ...defaultSettingsFor('OPS', 20, true),
    purgePolicy: 'api-if-possible',
    exclusions: [
      {
        fingerprint: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        reason: 'Valeur factice documentée par AWS — exemple repris de la documentation (ruban F-5).',
      },
    ],
  },
  ARCH: defaultSettingsFor('ARCH', 0, true),
};

/** Une ligne du registre passe-t-elle les réglages de son espace ? */
export function settingsAllow(
  settings: SpaceSettings | undefined,
  row: { family: WikiFamily; score: number; spaceKey: string; foyerId: string },
  fingerprintOf: (foyerId: string) => string,
): boolean {
  if (settings === undefined || settings.spaceKey !== row.spaceKey) return true;
  if (!settings.familiesEnabled.includes(row.family)) return false;
  if (row.score < settings.minScore) return false;
  const fingerprint = fingerprintOf(row.foyerId);
  return !settings.exclusions.some((exclusion) => exclusion.fingerprint === fingerprint);
}
