// Exécuteur SIMULÉ des outils MCP (§17) sur le jeu de démo — réponses JSON
// exactes : empreintes + aperçus masqués, jamais de valeur brute (PW-04).
// Maximum de vrai code : `ritualStepStates` et `redactionOrder` viennent des
// paquets réels ; `check-text` est un VRAI calcul local (lib/check-text.ts +
// empreinte WebCrypto). Les outils d'écriture sont dans lib/mcp-actions.ts.

import { ritualStepStates } from '@placard-wiki/ritual/src/lock.js';
import { redactionOrder } from '@placard-wiki/propagation';
import type { Foyer, FoyerLocation } from '@placard-wiki/domain';
import { EXPOSURES, FOYERS, OWNERS, PURGE_REQUESTS } from '../data/demo.js';
import { CERTIFICATE } from '../data/demo-site.js';
import { checkText } from './check-text.js';
import { hmacFingerprint } from './fingerprint.js';
import { runAction } from './mcp-actions.js';

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
function scanPage(args: Record<string, string>): JsonValue {
  const pageId = args.pageId ?? '';
  const foyers = Object.values(FOYERS).filter((f) => f.locations.some((l) => l.pageId === pageId));
  return { pageId, foyerCount: foyers.length, foyers: foyers.map(foyerJson) };
}

/** `scan-space` : balayage borné — état d'avancement et curseur de reprise. */
function scanSpace(args: Record<string, string>): JsonValue {
  const spaceKey = args.spaceKey ?? '';
  const limit = Math.max(1, Number(args.limit ?? '10'));
  const foyers = Object.values(FOYERS).filter((f) => f.spaceKey === spaceKey);
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
function listExposed(args: Record<string, string>): JsonValue {
  const minScore = Number(args.minScore ?? '0');
  const limit = Math.max(1, Number(args.limit ?? '10'));
  const foyers = Object.values(FOYERS)
    .filter((f) => (args.spaceKey === '' || args.spaceKey === undefined || f.spaceKey === args.spaceKey))
    .filter((f) => args.state === '' || args.state === undefined || f.state === args.state)
    .filter((f) => f.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { total: foyers.length, sortedBy: 'danger-desc', foyers: foyers.map(foyerJson) };
}

/** `get-finding` : emplacements, rituel (vrai calcul), exposition, termes. */
function getFinding(args: Record<string, string>, session: McpSession): JsonValue {
  const foyer = FOYERS[args.findingId ?? ''];
  if (!foyer) return { error: 'finding-introuvable', findingId: args.findingId ?? '' };
  const pageId = foyer.primaryPageId ?? foyer.locations[0]?.pageId ?? '';
  const exposure = EXPOSURES[pageId];
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
    owner: OWNERS[pageId] ? { ownerRef: OWNERS[pageId]!.ownerRef ?? null, method: OWNERS[pageId]!.method } : null,
    purgeRequests: asJson(PURGE_REQUESTS[foyer.id] ?? []),
  };
}

/** `trace-fingerprint` : tous les emplacements, dans l'ordre du lot (§11). */
function traceFingerprint(args: Record<string, string>): JsonValue {
  const fingerprint = args.fingerprint ?? '';
  const foyer = Object.values(FOYERS).find((f) => f.fingerprint === fingerprint);
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
function getExposure(args: Record<string, string>): JsonValue {
  const exposure = EXPOSURES[args.pageId ?? ''];
  if (!exposure) return { error: 'page-inconnue', pageId: args.pageId ?? '' };
  return {
    pageId: exposure.pageId,
    readers: { low: exposure.readers.low, high: exposure.readers.high },
    method: 'Fourchette — permissions de l’espace + restrictions + partage (§8).',
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
function getCertificate(): JsonValue {
  return {
    id: CERTIFICATE.id,
    scope: CERTIFICATE.scope,
    issuedAt: CERTIFICATE.issuedAt,
    open: CERTIFICATE.open,
    rotated: CERTIFICATE.rotated,
    redacted: CERTIFICATE.redacted,
    purged: CERTIFICATE.purged,
    residualExposure: CERTIFICATE.residualExposure,
    blindSpots: CERTIFICATE.blindSpots,
    contentHash: CERTIFICATE.contentHash,
  };
}

/** Exécute un outil MCP sur le jeu de démo et renvoie la réponse JSON. */
export async function runTool(
  toolKey: string,
  args: Record<string, string>,
  actorKind: ActorKind,
  session: McpSession,
): Promise<JsonValue> {
  switch (toolKey) {
    case 'scan-page': return scanPage(args);
    case 'scan-space': return scanSpace(args);
    case 'list-exposed-secrets': return listExposed(args);
    case 'get-finding': return getFinding(args, session);
    case 'trace-fingerprint': return traceFingerprint(args);
    case 'get-exposure': return getExposure(args);
    case 'get-certificate': return getCertificate();
    case 'check-text': return checkTextTool(args);
    default: return runAction(toolKey, args, actorKind, session);
  }
}
