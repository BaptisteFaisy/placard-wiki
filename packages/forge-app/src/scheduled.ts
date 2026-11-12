/**
 * Déclencheurs planifiés (§14, §19) :
 *  - incrémental toutes les 5 minutes (un seul autorisé à cette fréquence) :
 *    CQL `lastModified >= dernier balayage`, repris sur curseur ;
 *  - passe complète hebdomadaire, par tranches d'espaces priorisées par
 *    exposition, exécutée par le consumer (jusqu'à 900 s par tranche).
 */

import { Queue } from '@forge/events';

import { getServiceContext } from './runtime/context';
import { runSweep } from './services/index';

/** File de balayage long (§19). */
const SWEEP_QUEUE = 'pw-sweep-queue';

/** Borne d'une tranche incrémentale directe (le déclencheur tient en 900 s). */
const INCREMENTAL_SLICE = 200;

export async function incrementalSweep(): Promise<void> {
  console.info('[placard] incremental-sweep (CQL lastModified >= dernier balayage)');
  const ctx = await getServiceContext();
  const result = await runSweep(ctx, { mode: 'incremental', scope: 'site', maxPages: INCREMENTAL_SLICE });
  console.info(
    `[placard] incrémental pages=${String(result.pagesScanned)} done=${String(result.done)}`,
  );
  if (result.nextCursor !== null) {
    // La passe n'est pas terminée : la suite part sur la file du consumer (§14).
    try {
      await new Queue({ key: SWEEP_QUEUE }).push({
        body: { mode: 'incremental', scope: 'site', cursor: result.nextCursor },
      });
    } catch {
      // File indisponible : le curseur est persisté, la reprise se fera au
      // prochain passage du déclencheur. Déclaré, jamais masqué (§19).
      console.info('[placard] incrémental : mise en file impossible — curseur conservé, reprise au prochain passage.');
    }
  }
}

export async function fullSweep(): Promise<void> {
  console.info('[placard] full-sweep (passe complète, priorisée par exposition)');
  // §14 : la passe complète est découpée en tranches d'espaces priorisées par
  // exposition. La liste des espaces et l'ordre exact sont à valider semaine 1
  // (§22) ; en l'état, une tranche « site » est publiée, le consumer la découpe.
  try {
    await new Queue({ key: SWEEP_QUEUE }).push({
      body: { mode: 'full', scope: 'site' },
    });
  } catch {
    console.info('[placard] full-sweep : mise en file impossible — passe complète à déclencher autrement.');
  }
}