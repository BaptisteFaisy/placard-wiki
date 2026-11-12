/**
 * La demande de purge rendue **actionnable** (§9) : un export que
 * l'administrateur traite en une fois, et un état suivi.
 *
 * Avant, la demande était une lettre à lire. Maintenant c'est un tableau :
 * une ligne par page et par numéro de version, avec l'empreinte du foyer, la
 * famille et la raison — **jamais la valeur brute** (l'empreinte est un
 * HMAC-SHA-256, la raison est du texte d'impossibilité).
 *
 * L'état de la demande suit l'administrateur : `requested` (demandée) →
 * `acknowledged` (reconnue, l'admin l'a prise en compte) → `done` (purge
 * déclarée faite) ou `refused` (refusée, **avec son motif**). Un refus sans
 * motif est refusé : une raison écrite est la moitié du travail.
 */

import type { Foyer, PurgeRequest } from '@placard-wiki/domain';

/** Une ligne du tableau des demandes — l'unité de travail de l'administrateur. */
export interface PurgeRequestLine {
  requestId: string;
  foyerId: string;
  family: string;
  fingerprint: string;
  pageId: string;
  versionNumber: number;
  reason: string;
  state: PurgeRequest['state'];
  requestedAt: string;
  /** Référence de l'administrateur — ou motif de refus (selon l'état). */
  adminRef?: string;
}

/** Colonnes de l'export, dans l'ordre : lisible par un tableur, sans valeur brute. */
export const PURGE_CSV_COLUMNS = [
  'requete', 'foyer', 'famille', 'empreinte', 'page', 'version', 'raison', 'etat', 'demandee_le', 'reference_admin',
] as const;

/** Construit les lignes d'export à partir des demandes et de leurs foyers. */
export function purgeRequestLines(
  requests: readonly PurgeRequest[],
  foyers: ReadonlyMap<string, Foyer>,
): PurgeRequestLine[] {
  const lines: PurgeRequestLine[] = [];
  for (const request of requests) {
    const foyer = foyers.get(request.foyerId);
    const reason = request.blockedReason ?? 'Demande de purge d’historique.';
    for (const versionNumber of request.versionNumbers) {
      const line: PurgeRequestLine = {
        requestId: request.id,
        foyerId: request.foyerId,
        family: foyer?.family ?? 'inconnue',
        fingerprint: foyer?.fingerprint ?? '',
        pageId: request.pageId,
        versionNumber,
        reason,
        state: request.state,
        requestedAt: request.requestedAt,
      };
      if (request.adminRef !== undefined) line.adminRef = request.adminRef;
      lines.push(line);
    }
  }
  return lines;
}

/** Échappe un champ CSV (guillemets doublés, champs protégés). */
export function csvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Sérialise les lignes en CSV : une ligne par page et par version. */
export function purgeRequestsCsv(lines: readonly PurgeRequestLine[]): string {
  const head = PURGE_CSV_COLUMNS.join(',');
  const rows = lines.map((line) => [
    csvField(line.requestId),
    csvField(line.foyerId),
    csvField(line.family),
    csvField(line.fingerprint),
    csvField(line.pageId),
    csvField(String(line.versionNumber)),
    csvField(line.reason),
    csvField(line.state),
    csvField(line.requestedAt),
    csvField(line.adminRef ?? ''),
  ].join(','));
  return [head, ...rows].join('\n');
}

/** La décision de l'administrateur sur une demande. */
export type PurgeDecision = 'acknowledged' | 'refused' | 'done';

/** Les états que l'administrateur peut poser depuis l'état courant. */
const ALLOWED: Readonly<Record<PurgeRequest['state'], readonly PurgeDecision[]>> = {
  requested: ['acknowledged', 'refused', 'done'],
  acknowledged: ['done', 'refused'],
  done: [],
  refused: ['acknowledged'],
};

/** Refus sans motif : la raison écrite est obligatoire (§9). */
export const REFUSAL_WITHOUT_MOTIVE =
  'Un refus de purge doit porter son motif : sans raison écrite, la demande n’est pas suivie.';

/** Transition impossible (demande déjà traitée, ou état incohérent). */
export function invalidTransition(state: PurgeRequest['state'], decision: PurgeDecision): string {
  return `La demande est à l’état « ${state} » : la décision « ${decision} » ne s’applique plus.`;
}

export interface PurgeDecisionResult {
  ok: boolean;
  /** La demande mise à jour, quand la décision s'applique. */
  request?: PurgeRequest;
  /** La raison du refus de la décision — jamais vide. */
  reason?: string;
}

/**
 * Applique la décision de l'administrateur à une demande : état, référence,
 * motif. Pure — la persistance est du ressort de l'appelant.
 */
export function decidePurgeRequest(
  request: PurgeRequest,
  decision: PurgeDecision,
  options: { adminRef?: string; motive?: string } = {},
): PurgeDecisionResult {
  if (!ALLOWED[request.state].includes(decision)) {
    return { ok: false, reason: invalidTransition(request.state, decision) };
  }
  if (decision === 'refused' && (options.motive === undefined || options.motive.trim() === '')) {
    return { ok: false, reason: REFUSAL_WITHOUT_MOTIVE };
  }
  const next: PurgeRequest = { ...request, state: decision };
  // La référence de l'administrateur et le motif de refus partagent la même
  // colonne : pour un refus, le motif passe devant — c'est lui qui est utile.
  const ref = decision === 'refused' ? options.motive : options.adminRef ?? options.motive;
  if (ref !== undefined) next.adminRef = ref;
  return { ok: true, request: next };
}
