// Exécuteur SIMULÉ des outils MCP (§17) — réponses JSON exactes : empreintes
// + aperçus masqués, jamais de valeur brute (PW-04).
// Maximum de vrai code : `ritualStepStates` et `redactionOrder` viennent des
// paquets réels ; `check-text` est un VRAI calcul local (lib/check-text.ts +
// empreinte WebCrypto). Les outils d'écriture sont dans lib/mcp-actions.ts.
//
// Les lectures portent sur le DATASET (live si disponible, snapshot sinon) :
// l'écran ne sait jamais d'où viennent les données.

import { ritualStepStates } from '@placard-wiki/ritual/src/lock.js';
import { redactionOrder } from '@placard-wiki/propagation';
import type { Foyer, FoyerLocation } from '@placard-wiki/domain';
import { checkText } from './check-text.js';
import { hmacFingerprint } from './fingerprint.js';
import { runAction } from './mcp-actions.js';
import type { PlacardDataset } from '../data/dataset.js';

/** Valeur JSON — aucune échappatoire `any`, union explicite. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Session du playground : les attestations posées pendant la démo. */
export interface McpSession {
  attestations: Record<string, import('@placard-wiki/domain').RotationAttestation>;
}

/**
 * Convertit une valeur typée des paquets en JSON affichable : les interfaces
 * du domaine n'ont pas d'index signature, la conversion passe par une
 * sérialisation (aucune donnée non sérialisable dans ces types).
 */
export function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Nouvelle session vide (état local, jamais persisté). */
export function newSession(): McpSession {
  return { attestations: {} };
}

/** Type d'acteur de l'appel — `record-rotation` refuse `agent` (§17). */
export type ActorKind = 'human' | 'agent';

/** Emplacement → JSON (version incluse seulement si définie). */
function locationJson(location: FoyerLocation): JsonValue {
  return {
    locationId: location.id,
    containerType: location.containerType,
    pageId: location.pageId,
    ...(location.versionNumber !== undefined ? { versionNumber: location.versionNumber } : {}),
    field: location.field,
    gite: location.gite,
    status: location.status,
    maskedPreview: location.maskedPreview,
  };
}

/** Foyer → JSON compact : empreinte, aperçu masqué, danger et ses termes. */
function foyerJson(foyer: Foyer): { readonly [key: string]: JsonValue } {
  return {
    foyerId: foyer.id,
    family: foyer.family,
    fingerprint: foyer.fingerprint,
    maskedPreview: foyer.locations[0]?.maskedPreview ?? '',
    state: foyer.state,
    danger: foyer.score,
    terms: foyer.scoreTerms.map((term) => ({ label: term.label, points: term.points })),
  };
}

/** `scan-page` : foyers de la page, famille, empreinte, danger et termes. */
function scanPage(args: Record<string, string>, data: PlacardDataset): JsonValue {
  const pageId = args.pageId ?? '';
  const foyers = Object.values(data.foyers).filter((f) => f.locations.some((l) => l.pageId === pageId));
  return { pageId, foyerCount: foyers.length, foyers: foyers.map(foyerJson) };
}

/** `scan-space` : balayage borné — état d'avancement et curseur de reprise. */
function scanSpace(args: Record<string, string>, data: PlacardDataset): JsonValue {
  const spaceKey = args.spaceKey ?? '';
  const limit = Math.max(1, Number(args.limit ?? '10'));
  const foyers = Object.values(data.foyers).filter((f) => f.spaceKey === spaceKey);
  return {
    spaceKey,
    mode: 'incremental',
    pagesScanned: Math.min(limit * 120, 960),
    foyersFound: foyers.length,
    foyers: foyers.map((f) => f.id),
    state: 'partial',
    cursor: { scope: spaceKey, mode: 'incremental', lastPageId: 'P-140', resume: true },
    note: 'Couverture partielle déclarée, jamais masquée (§14).',
  };
}

/** `list-exposed-secrets` : foyers triés par danger, filtres optionnels. */
function listExposed(args: Record<string, string>, data: PlacardDataset): JsonValue {
  const minScore = Number(args.minScore ?? '0');
  const limit = Math.max(1, Number(args.limit ?? '10'));
  const foyers = Object.values(data.foyers)
    .filter((f) => (args.spaceKey === '' || args.spaceKey === undefined || f.spaceKey === args.spaceKey))
    .filter((f) => args.state === '' || args.state === undefined || f.state === args.state)
    .filter((f) => f.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { total: foyers.length, sortedBy: 'danger-desc', foyers: foyers.map(foyerJson) };
}

/** `get-finding` : emplacements, rituel (vrai calcul), exposition, termes. */
function getFinding(args: Record<string, string>, session: McpSession, data: PlacardDataset): JsonValue {
  const foyer = data.foyers[args.findingId ?? ''];
  if (!foyer) return { error: 'finding-introuvable', findingId: args.findingId ?? '' };
  const pageId = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const exposure = data.exposures[pageId];
  const owner = data.owners[pageId];
  return {
    ...foyerJson(foyer),
    locations: foyer.locations.map(locationJson),
    ritual: asJson(ritualStepStates(foyer, session.attestations[foyer.id])),
    exposure: exposure
      ? {
          readersLow: exposure.readers.low,
          readersHigh: exposure.readers.high,
          sharing: exposure.sharing,
          aiSurfacePresumedIndexed: exposure.aiSurface.presumedIndexed,
        }
      : null,
    owner: owner ? { ownerRef: owner.ownerRef ?? null, method: owner.method } : null,
    purgeRequests: asJson(data.purgeRequests[foyer.id] ?? []),
  };
}

/** `trace-fingerprint` : tous les emplacements, dans l'ordre du lot (§11). */
function traceFingerprint(args: Record<string, string>, data: PlacardDataset): JsonValue {
  const fingerprint = args.fingerprint ?? '';
  const foyer = Object.values(data.foyers).find((f) => f.fingerprint === fingerprint);
  if (!foyer) return { error: 'empreinte-inconnue', fingerprint };
  const order = redactionOrder(foyer);
  return {
    fingerprint,
    foyerId: foyer.id,
    locationCount: foyer.locations.length,
    templateFirst: order.templateFirst,
    redactionBatchOrder: order.orderedLocations.map(locationJson),
    excluded: order.exclus.map((l) => l.id),
  };
}

/** `get-exposure` : fourchette + méthode, partage, restrictions, surface IA. */
function getExposure(args: Record<string, string>, data: PlacardDataset): JsonValue {
  const exposure = data.exposures[args.pageId ?? ''];
  if (!exposure) return { error: 'page-inconnue', pageId: args.pageId ?? '' };
  return {
    pageId: exposure.pageId,
    readers: { low: exposure.readers.low, high: exposure.readers.high },
    method: exposure.readers.method,
    sharing: exposure.sharing,
    restrictions: exposure.restrictions.map((r) => `${r.type}:${r.name}`),
    aiSurface: { presumedIndexed: exposure.aiSurface.presumedIndexed, hypothesis: true },
  };
}

/** `check-text` : VRAI calcul local — motifs légers + empreinte WebCrypto. */
async function checkTextTool(args: Record<string, string>): Promise<JsonValue> {
  const hits = checkText(args.text ?? '');
  const withFingerprints = await Promise.all(
    hits.map(async (hit) => ({
      family: hit.family,
      fingerprint: await hmacFingerprint(`${hit.family}:${String(hit.start)}:${hit.maskedPreview}`),
      maskedPreview: hit.maskedPreview,
      knownFake: hit.knownFake,
    })),
  );
  return {
    hits: withFingerprints,
    stored: false,
    logged: false,
    note: 'Le texte n’est ni stocké ni journalisé (§17). Empreinte de démonstration : clé publique, calcul local.',
  };
}

/** `get-certificate` : résumé daté et chiffré — chiffres, jamais de valeur. */
function getCertificate(data: PlacardDataset): JsonValue {
  const c = data.certificate;
  return {
    id: c.id,
    scope: c.scope,
    issuedAt: c.issuedAt,
    open: c.open,
    rotated: c.rotated,
    redacted: c.redacted,
    purged: c.purged,
    residualExposure: c.residualExposure,
    blindSpots: c.blindSpots,
    contentHash: c.contentHash,
  };
}

/** Exécute un outil MCP sur le dataset et renvoie la réponse JSON. */
export async function runTool(
  toolKey: string,
  args: Record<string, string>,
  actorKind: ActorKind,
  session: McpSession,
  data: PlacardDataset,
): Promise<JsonValue> {
  switch (toolKey) {
    case 'scan-page': return scanPage(args, data);
    case 'scan-space': return scanSpace(args, data);
    case 'list-exposed-secrets': return listExposed(args, data);
    case 'get-finding': return getFinding(args, session, data);
    case 'trace-fingerprint': return traceFingerprint(args, data);
    case 'get-exposure': return getExposure(args, data);
    case 'get-certificate': return getCertificate(data);
    case 'check-text': return checkTextTool(args);
    default: return runAction(toolKey, args, actorKind, session, data);
  }
}
