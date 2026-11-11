/**
 * Le consumer de balayage long (§14, §19) : exécute les tranches de balayage
 * hors du chemin de l'événement, avec reprise sur curseur. Jusqu'à 900 s.
 */

interface ConsumeContext {
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  accountId?: string;
}

export async function sweepConsumer({ payload }: ConsumeContext): Promise<void> {
  const scope = typeof payload?.['scope'] === 'string' ? payload['scope'] : 'site';
  const mode = typeof payload?.['mode'] === 'string' ? payload['mode'] : 'incremental';
  console.info(`[placard] sweep-consumer scope=${scope} mode=${mode}`);
  // Lot « balayage » : lire la tranche suivante depuis le curseur (sweep_cursor),
  // scanner via @placard-wiki/wiki-source + @placard-wiki/detectors, écrire les
  // foyers, mettre à jour le budget (table budget), republier si pas terminé.
}
