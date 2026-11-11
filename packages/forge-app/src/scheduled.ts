/**
 * Déclencheurs planifiés (§14) : incrémental toutes les 5 minutes (un seul
 * autorisé à cette fréquence par la plateforme), passe complète hebdomadaire
 * par tranches d'espaces priorisées par exposition.
 */

export async function incrementalSweep(): Promise<void> {
  console.info('[placard] incremental-sweep (CQL lastModified >= dernier balayage)');
  // Lot « balayage » : publier une tranche sur la file pw-sweep-queue.
}

export async function fullSweep(): Promise<void> {
  console.info('[placard] full-sweep (passe complète, priorisée par exposition)');
  // Lot « balayage » : planifier les espaces par exposition, tranches + curseur.
}
