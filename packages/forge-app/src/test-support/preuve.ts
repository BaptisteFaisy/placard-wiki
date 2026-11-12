/**
 * La passe de preuve — un balayage complet de l'espace de canaris, en mémoire.
 *
 * Une seule passe produit toutes les surfaces à vérifier : le store, les
 * aperçus, le registre, la charge utile du webtrigger, le certificat, le
 * rapport de couverture, le journal et les questions posées à l'oracle.
 *
 * Aucun réseau : le client Confluence est le client mémoire instrumenté, et
 * le `fetch` global est bloqué pendant toute la passe (si quelque chose
 * tentait de sortir, le test le verrait).
 */

import type { LlmOracleQuestion } from '@placard-wiki/detectors';
import type { Certificate, CoverageReportReelle, Foyer, RegistryRow } from '@placard-wiki/domain';

import { buildPublicPayload } from '../public-payload';
import type { LiveContractPayload } from '@placard-wiki/domain';
import { coverageReport } from '../services/coverage';
import { registryRows } from '../services/registry';
import { generateCertificate } from '../services/ritual-service';
import { runSweep } from '../services/sweep';
import type { SweepResult } from '../services/ports';
import { makeTestContext } from '../services/test-support';

import { canaryConfluenceClient, CANARY_SPACE } from './canary-pages';
import type { ClientCall } from './canary-pages';
import { blockNetwork, captureConsole, recordingOracle } from './recorders';

/** La clé HMAC du test : fixe, pour que les empreintes soient reproductibles. */
export const HMAC_KEY = 'cle-hmac-de-preuve';

/** Tout ce que la passe a produit, prêt à être vérifié. */
export interface Preuve {
  foyers: Foyer[];
  rows: RegistryRow[];
  payload: LiveContractPayload;
  certificate: Certificate;
  coverage: CoverageReportReelle;
  logs: string[];
  questions: LlmOracleQuestion[];
  calls: ClientCall[];
  networkCalls: string[];
  sweep: SweepResult;
}

/** La passe complète : balayage, puis lecture de toutes les surfaces publiées. */
export async function runPreuve(): Promise<Preuve> {
  const client = canaryConfluenceClient();
  const oracle = recordingOracle(HMAC_KEY);
  const ctx = { ...makeTestContext({ hmacKey: HMAC_KEY, confluence: client }), oracle: oracle.oracle };
  const net = blockNetwork();
  try {
    const { result, logs } = await captureConsole(async () => {
      const sweep = await runSweep(ctx, { mode: 'full', scope: CANARY_SPACE, maxPages: 100 });
      const foyers = await ctx.store.listFoyers({ limit: 500 });
      const { rows } = await registryRows(ctx, { limit: 500, sort: 'score' });
      const payload = await buildPublicPayload(ctx);
      const certificate = await generateCertificate(ctx, 'site');
      const coverage = await coverageReport(ctx);
      return { sweep, foyers, rows, payload, certificate, coverage };
    });
    return {
      ...result,
      logs,
      questions: oracle.questions,
      calls: client.calls,
      networkCalls: net.calls,
    };
  } finally {
    net.restore();
  }
}
