/**
 * Webtrigger : demandes de purge groupées à l'administrateur du site (§9,
 * étape 3). Quand l'API ne permet pas de purger une version, ou que les droits
 * manquent, l'app produit la demande exacte (page, numéro de version,
 * empreinte) — et le foyer reste ouvert. Dire « on ne peut pas » fait partie
 * du produit.
 */

interface WebtriggerRequest {
  method: string;
  path: string;
  queryParameters?: Record<string, string | string[]>;
  body?: string;
}

interface WebtriggerResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export async function purgeRequestHook(request: WebtriggerRequest): Promise<WebtriggerResponse> {
  console.info(`[placard] purge-request-hook ${request.method} ${request.path}`);
  // Lot « rituel » : authentifier l'admin (pont signé), rendre la liste des
  // demandes de purge en attente, marquer les demandes reconnues.
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notImplemented: 'purge-request-hook',
      honesty: 'La demande groupée à l’administrateur est au plan du lot « rituel ».',
    }),
  };
}
