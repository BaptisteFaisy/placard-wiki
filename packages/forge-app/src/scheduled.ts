/**
 * Déclencheurs planifiés (§14, §19) :
 *  - incrémental toutes les 5 minutes (un seul autorisé à cette fréquence) :
 *    CQL `lastModified >= dernier balayage`, repris sur curseur ;
 *  - passe complète hebdomadaire, par tranches d'espaces priorisées par
 *    exposition, exécutée par le consumer (jusqu'à 900 s par tranche).
 *
 * Deux règles tiennent ici, mesurées le 13 novembre 2026 :
 *  - la file répond 400 en production : un refus est **décrit** (statut +
 *    message), jamais avalé ;
 *  - quand la file refuse, la passe **continue en ligne** dans la même
 *    invocation (le déclencheur tient 900 s) au lieu d'attendre le prochain
 *    passage — sinon la passe complète du site n'avançait que d'une tranche
 *    toutes les cinq minutes.
 */

import { getServiceContext } from './runtime/context';
import { pushSweepEvent } from './runtime/queue';
import { runSweep } from './services/index';
import type { ServiceContext, SweepResult } from './services/ports';

/** Borne d'une tranche incrémentale directe (le déclencheur tient en 900 s). */
const INCREMENTAL_SLICE = 200;

/**
 * Tranches enchaînées **en ligne** quand la file refuse. Deux tranches :
 * la première (200 pages + 20 appels d'oracle au plus) tient largement dans
 * les 900 s du déclencheur, la deuxième reste une marge.
 */
const MAX_TRANCHES_EN_LIGNE = 2;

/** Journalise le résultat d'une tranche (mesures, jamais masquées). */
function journaliser(result: SweepResult): void {
  console.info(
    `[placard] incrémental pages=${String(result.pagesScanned)} foyers=${String(result.foyersTouched)} done=${String(result.done)} angles morts=${String(result.blindSpots.length)}`,
  );
  for (const spot of result.blindSpots.slice(0, 3)) console.info(`[placard] angle mort : ${spot}`);
}

/**
 * Enchaîne une tranche dans la même invocation : c'est le repli quand la file
 * refuse. Le curseur est persisté par la passe, donc rien n'est perdu.
 */
async function trancheEnLigne(ctx: ServiceContext, cursor: string): Promise<SweepResult> {
  const result = await runSweep(ctx, { mode: 'incremental', scope: 'site', maxPages: INCREMENTAL_SLICE, cursor });
  journaliser(result);
  return result;
}

export async function incrementalSweep(): Promise<void> {
  console.info('[placard] incremental-sweep (CQL lastModified >= dernier balayage)');
  const ctx = await getServiceContext();
  let result = await runSweep(ctx, { mode: 'incremental', scope: 'site', maxPages: INCREMENTAL_SLICE });
  journaliser(result);

  let tranches = 0;
  while (result.nextCursor !== null && tranches < MAX_TRANCHES_EN_LIGNE) {
    tranches += 1;
    const mise = await pushSweepEvent({ mode: 'incremental', scope: 'site', cursor: result.nextCursor });
    if (mise.ok) return; // la suite part sur la file du consumer (§14)
    console.info(
      `[placard] incrémental : mise en file impossible (${mise.reason}) — tranche suivante en ligne.`,
    );
    result = await trancheEnLigne(ctx, result.nextCursor);
  }
  if (result.nextCursor !== null) {
    // Curseur conservé : la passe reprendra au prochain passage. Déclaré (§19).
    console.info('[placard] incrémental : tranche(s) en ligne épuisée(s) — curseur conservé, reprise au prochain passage.');
  }
}

export async function fullSweep(): Promise<void> {
  console.info('[placard] full-sweep (passe complète, priorisée par exposition)');
  // §14 : la passe complète est découpée en tranches d'espaces priorisées par
  // exposition. La liste des espaces et l'ordre exact sont à valider semaine 1
  // (§22) ; en l'état, une tranche « site » est publiée, le consumer la découpe.
  const mise = await pushSweepEvent({ mode: 'full', scope: 'site' });
  if (!mise.ok) {
    console.info(`[placard] full-sweep : mise en file impossible (${mise.reason}) — passe complète à déclencher autrement.`);
  }
}
