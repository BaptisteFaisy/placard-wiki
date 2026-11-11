/**
 * Coût de remise en état (§8) : fourchette en heures par famille
 * (rotation + caviardage + purge + vérification), toujours avec sa méthode.
 *
 * Réemploi : les fourchettes (`REMEDIATION_COST_HOURS`) et la méthode
 * (`REMEDIATION_COST_METHOD`) viennent du domaine — ce module ne fait que les
 * exposer avec la forme attendue par les écrans, sans aucun chiffre local.
 */

import { REMEDIATION_COST_HOURS, REMEDIATION_COST_METHOD, type WikiFamily } from '@placard-wiki/domain';

/** Fourchette d'heures + méthode affichable. */
export interface RemediationCost {
  low: number;
  high: number;
  method: string;
}

/** Coût de remise en état d'un foyer de cette famille (§8). */
export function remediationCost(family: WikiFamily): RemediationCost {
  const range = REMEDIATION_COST_HOURS[family];
  return { low: range.low, high: range.high, method: REMEDIATION_COST_METHOD.fr };
}
