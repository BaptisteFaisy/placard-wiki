/**
 * CQL — les trois régimes de balayage du cahier (§14) :
 *
 *  - **incrémental** : `lastModified >= <curseur>`, déclencheur planifié long,
 *    repris là où il s'est arrêté (curseur persisté par l'app) ;
 *  - **complet** : passe périodique par tranches d'espaces, tri stable pour
 *    une reprise fiable ;
 *  - **à la demande** : une page, un espace, un lien.
 *
 * Le CQL est construit ici, exécuté via le port (`searchCql`) et paginé via
 * `cursor.ts`. Aucune valeur brute n'entre dans une requête : les entrées
 * texte (clés d'espace, titres) sont échappées.
 */

import type { ConfluenceClient, CqlResultPage } from './api.js';
import { paginate } from './cursor.js';
import type { Batch, PageCursor } from './cursor.js';

/** Échappe une valeur littérale CQL (guillemets et antislashes). */
export function cqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** ISO → format de date CQL (`yyyy-MM-dd HH:mm`), borne du curseur. */
export function cqlDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`curseur de balayage invalide : ${isoTimestamp}`);
  }
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/** Régime incrémental : ce qui a changé depuis le dernier balayage (§14). */
export function cqlIncremental(lastModifiedAt: string, spaceKey?: string): string {
  const scope = spaceKey ? `space = ${cqlQuote(spaceKey)} AND ` : '';
  return `${scope}lastModified >= ${cqlQuote(cqlDate(lastModifiedAt))} ORDER BY lastModified ASC`;
}

/**
 * Régime complet, par tranches d'espaces (§14) : tri par identifiant pour une
 * pagination `start/limit` stable — l'ordre par date bougerait pendant la passe.
 */
export function cqlFullTranche(spaceKey: string): string {
  return `space = ${cqlQuote(spaceKey)} AND type = page ORDER BY id ASC`;
}

/** Régime à la demande : une page précise (depuis un lien ou un choix UI). */
export function cqlOnDemandPage(pageId: string): string {
  return `id = ${cqlQuote(pageId)}`;
}

/** Régime à la demande : tout un espace, borné par le paginateur. */
export function cqlOnDemandSpace(spaceKey: string): string {
  return `space = ${cqlQuote(spaceKey)} AND type = page ORDER BY id ASC`;
}

/** Résultat CQL → lot paginable pour `cursor.ts` (une seule forme de lot). */
export function toBatch(page: CqlResultPage): Batch<{ id: string; title: string; spaceKey?: string }> {
  return {
    items: page.results.map((r) => ({ id: r.id, title: r.title, spaceKey: r.spaceKey })),
    nextStart: page.nextStart,
  };
}

/**
 * Exécute un CQL jusqu'à épuisement ou jusqu'à la borne (`maxItems`) —
 * le générateur yield le curseur après chaque lot pour la reprise (§14).
 */
export async function* searchPaginated(
  client: ConfluenceClient,
  cql: string,
  options: { limit?: number; maxItems?: number; from?: PageCursor } = {},
): AsyncGenerator<{ items: Array<{ id: string; title: string; spaceKey?: string }>; cursor: PageCursor }> {
  yield* paginate(
    async (start, limit) => toBatch(await client.searchCql(cql, start, limit)),
    options,
  );
}
