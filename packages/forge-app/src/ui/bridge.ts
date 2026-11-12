/**
 * Le client du bridge, côté interface.
 *
 * Tous les écrans passent par ici : une seule fonction `callBridge` qui
 * appelle le résolveur unique (méthodes = exactement `BRIDGE_METHODS` du
 * contrat `@placard-wiki/domain`). Le résolveur renvoie aujourd'hui un
 * « pas encore implémenté » honnête ; ici on le détecte et on le traduit en
 * état vide — jamais un écran cassé, jamais un faux zéro.
 *
 * Règle absolue : aucune méthode ne transporte de valeur brute de secret.
 * Les types du domaine (RegistryRow, RedactionDiff, Certificate…) le
 * garantissent ; l'interface n'affiche que des empreintes et des aperçus
 * masqués.
 */

import type { BridgeMethod, BridgeRequests, BridgeResults } from '@placard-wiki/domain';

/** Le résultat d'un appel : données, attente honnête, ou erreur. */
export type BridgeOutcome<T> =
  | { kind: 'ok'; data: T }
  /** Le résolveur a répondu « pas encore implémenté » — état vide honnête. */
  | { kind: 'pending'; method: BridgeMethod; honesty: string }
  /** L'appel a échoué (réseau, droits…) — on le dit, on ne le masque pas. */
  | { kind: 'error'; method: BridgeMethod; message: string };

/**
 * La réponse brute du résolveur : soit le résultat typé du contrat, soit le
 * corps « pas encore implémenté » posé par `resolver.ts` (lot en cours).
 */
type RawBridgeResponse<T> =
  | T
  | { notImplemented: BridgeMethod; honesty: string };

/** Le payload accepté par `invoke` (objet simple, jamais de fonction). */
type InvokePayload = Record<string, unknown>;

/**
 * Détecte le corps « pas encore implémenté » du résolveur. On ne se fie pas
 * au type — le résolveur peut répondre autre chose que le contrat pendant le
 * chantier. C'est un garde-fou honnête, pas un contournement.
 */
function isNotImplemented<T>(value: unknown): value is { notImplemented: BridgeMethod; honesty: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'notImplemented' in value &&
    'honesty' in value
  );
}

/**
 * Appelle une méthode du résolveur par le pont Forge.
 *
 * Le pont est chargé à l'appel, jamais à l'importation : `@forge/bridge` lève
 * hors d'un produit Atlassian (« unable to establish a connection »), et la
 * ressource d'écran est un module importé par Forge. Le charger à l'appel
 * garde l'écran testable hors produit. Même convention que l'app sœur
 * `tickets-pieges` (même atelier, déployée).
 */
async function bridgeInvoke(method: string, payload: InvokePayload): Promise<unknown> {
  const bridge = await import('@forge/bridge');
  return bridge.invoke(method, payload) as Promise<unknown>;
}

/**
 * Appelle une méthode du bridge, typée à la fois en entrée et en sortie.
 * Ne lève jamais : tout échec devient un `BridgeOutcome` affichable.
 */
export async function callBridge<M extends BridgeMethod>(
  method: M,
  payload: BridgeRequests[M],
): Promise<BridgeOutcome<BridgeResults[M]>> {
  try {
    const raw = (await bridgeInvoke(method, payload as unknown as InvokePayload)) as
      | RawBridgeResponse<BridgeResults[M]>
      | undefined;
    if (isNotImplemented<BridgeResults[M]>(raw)) {
      return { kind: 'pending', method, honesty: raw.honesty };
    }
    if (raw === undefined || raw === null) {
      return { kind: 'error', method, message: 'empty response' };
    }
    return { kind: 'ok', data: raw as BridgeResults[M] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', method, message };
  }
}

/**
 * Extrait un message d'erreur lisible (ou la clé de la méthode) depuis un
 * `BridgeOutcome` en attente/erreur — pour l'état vide honnête.
 */
export function outcomeNote<T>(outcome: BridgeOutcome<T>): { title: string; body: string } | null {
  if (outcome.kind === 'ok') return null;
  if (outcome.kind === 'pending') {
    return { title: outcome.method, body: outcome.honesty };
  }
  return { title: outcome.method, body: outcome.message };
}
