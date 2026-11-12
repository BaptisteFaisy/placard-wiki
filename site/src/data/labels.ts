// Vocabulaire statique du site — ni données live, ni données de démo :
// correspondance état de foyer → clé i18n, et coût de remise en état
// (qui vient du DOMAINE, pas d'un jeu de données). Les écrans importent
// ici, jamais depuis `data/demo.ts` : ils ne dépendent d'aucune source.

import { REMEDIATION_COST_HOURS } from '@placard-wiki/domain';
import type { FoyerState, WikiFamily } from '@placard-wiki/domain';

/** Coût de remise en état pour une famille, en heures (fourchette, §8). */
export function remediationHours(family: WikiFamily): { low: number; high: number } {
  return REMEDIATION_COST_HOURS[family];
}

/** Libellé humain d'un état de foyer (utilisé aussi par le registre). */
export const STATE_KEYS: Record<FoyerState, string> = {
  open: 'stateOpen',
  'rotation-attested': 'stateRotationAttested',
  redacted: 'stateRedacted',
  'purge-requested': 'statePurgeRequested',
  purged: 'statePurged',
  'purge-impossible': 'statePurgeImpossible',
  sealed: 'stateSealed',
  dismissed: 'stateDismissed',
};
