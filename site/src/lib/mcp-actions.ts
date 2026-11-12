// Outils MCP d'ÉCRITURE (§17) — le VRAI code du paquet `@placard-wiki/ritual`
// (attestation, verrou, ruban, caviardage, ticket Jira) importé par sous-module
// : `ritual/src/certificate.ts` utilise `node:crypto` (non importable côté
// navigateur), mais les modules de règles sont purs — écart documenté : le
// certificat n'est pas recalculé ici, il est servi depuis les données de démo.

import { attestRotation, REFUSAL_AGENT } from '@placard-wiki/ritual/src/attestation.js';
import { attachRibbon } from '@placard-wiki/ritual/src/ribbon.js';
import { canRedact, REDACT_LOCK_REASON } from '@placard-wiki/ritual/src/lock.js';
import { applyRedaction, redactionPreview, REFUSAL_NO_ATTESTATION } from '@placard-wiki/ritual/src/redaction.js';
import { jiraTicketPayload } from '@placard-wiki/ritual/src/jira.js';
import { fixedClock } from '@placard-wiki/ritual/src/ports.js';
import type { StoragePort } from '@placard-wiki/ritual/src/ports.js';
import type { Foyer, RotationAttestation } from '@placard-wiki/domain';
import type { RedactionSource } from '@placard-wiki/ritual/src/redaction.js';
import { FOYERS, OWNERS } from '../data/demo.js';
import { asJson } from './mcp-run.js';
import type { ActorKind, JsonValue, McpSession } from './mcp-run.js';

/** Horloge figée de la démo — dates déterministes (§20 : jamais Date.now()). */
const DEMO_CLOCK = fixedClock('2026-11-10T10:15:00Z');

/** Acteur humain de la démo — référence masquée, comme ailleurs sur le site. */
const DEMO_ACTOR = '5f2a…dile';

/** Valeur factice des textes storage de démonstration — jamais une vraie. */
const FAKE_VALUE = 'SYNTHETIC-FAKE-VALUE';

/** L'attestation disponible pour un foyer : session, puis traces du foyer. */
export function attestationFor(foyer: Foyer, session: McpSession): RotationAttestation | undefined {
  const fromSession = session.attestations[foyer.id];
  if (fromSession) return fromSession;
  if (foyer.rotatedAt && foyer.rotationEvidenceRef) {
    return {
      foyerId: foyer.id,
      actorRef: DEMO_ACTOR,
      actorKind: 'human',
      provider: 'generic',
      evidenceRef: foyer.rotationEvidenceRef,
      attestedAt: foyer.rotatedAt,
      strength: 'attested',
    };
  }
  return undefined;
}

/** Texte storage synthétique d'un emplacement : la valeur factice, à sa position. */
function syntheticSource(foyer: Foyer, locationId: string): RedactionSource | null {
  const location = foyer.locations.find((l) => l.id === locationId);
  if (!location) return null;
  const text = `<p>Accès service (démo) : ${FAKE_VALUE} — à révoquer.</p>`;
  const start = text.indexOf(FAKE_VALUE);
  return {
    locationId,
    pageId: location.pageId,
    ...(location.versionNumber !== undefined ? { versionNumber: location.versionNumber } : {}),
    containerType: location.containerType,
    text,
    occurrences: [{ start, end: start + FAKE_VALUE.length }],
    maskedPreview: location.maskedPreview,
  };
}

/** Les sources de caviardage d'un foyer (emplacements encore présents). */
function sourcesOf(foyer: Foyer): RedactionSource[] {
  return foyer.locations
    .filter((l) => l.status === 'present')
    .map((l) => syntheticSource(foyer, l.id))
    .filter((s): s is RedactionSource => s !== null);
}

/** Port de stockage LOCAL : aucune écriture réelle, journal de la démo. */
function localStoragePort(writes: Array<{ pageId: string; asUser: string }>): StoragePort {
  return {
    writeVersion: async (pageId, _text, _comment, asUser) => {
      writes.push({ pageId, asUser });
      return writes.length + 1;
    },
  };
}

/** `record-rotation` — vraie validation ; un acteur « agent » est REFUSÉ. */
function recordRotation(args: Record<string, string>, actorKind: ActorKind, session: McpSession): JsonValue {
  const result = attestRotation(
    {
      foyerId: args.findingId ?? '',
      provider: args.provider ?? '',
      evidenceRef: args.evidenceRef ?? '',
      actorRef: DEMO_ACTOR,
      actorKind,
    },
    DEMO_CLOCK,
  );
  if (!result.ok) return { ok: false, reason: result.reason, refusedAgent: actorKind === 'agent' && result.reason === REFUSAL_AGENT };
  session.attestations[result.attestation.foyerId] = result.attestation;
  return { ok: true, attestation: asJson(result.attestation), strength: 'attested (preuve humaine, jamais machine)' };
}

/** `request-redaction` — diff masqué proposé ; verrou sans attestation. */
function requestRedaction(args: Record<string, string>, session: McpSession): JsonValue {
  const foyer = FOYERS[args.findingId ?? ''];
  if (!foyer) return { error: 'finding-introuvable', findingId: args.findingId ?? '' };
  const attestation = attestationFor(foyer, session);
  if (!canRedact(foyer, attestation)) return { ok: false, reason: REDACT_LOCK_REASON };
  if (!attestation) return { ok: false, reason: REFUSAL_NO_ATTESTATION };
  const preview = redactionPreview(attestation, sourcesOf(foyer));
  return { ok: true, applied: false, note: 'Rien d’appliqué — diff proposé, modèles en premier (§11).', diffs: asJson(preview.diffs), templateFirst: preview.templateFirst };
}

/** `apply-redaction` — application asUser() ; VERROU sans attestation humaine. */
async function applyRedactionTool(args: Record<string, string>, session: McpSession): Promise<JsonValue> {
  const foyer = FOYERS[args.findingId ?? ''];
  if (!foyer) return { error: 'finding-introuvable', findingId: args.findingId ?? '' };
  const writes: Array<{ pageId: string; asUser: string }> = [];
  const result = await applyRedaction(
    foyer,
    attestationFor(foyer, session),
    { approvedBy: args.approvedBy ?? '', comment: args.comment ?? '', sources: sourcesOf(foyer) },
    localStoragePort(writes),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, applied: result.applied, versionComment: result.versionComment, asUser: result.asUser, writes: writes.length };
}

/** `dismiss-finding` — ruban : raison écrite OBLIGATOIRE (vrai contrôle). */
function dismissFinding(args: Record<string, string>): JsonValue {
  const result = attachRibbon(
    { foyerId: args.findingId ?? '', reason: args.reason ?? '', actorRef: DEMO_ACTOR, reviewAt: args.reviewAt ?? '' },
    DEMO_CLOCK,
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, ribbon: asJson(result.patch), attachedAt: result.attachedAt };
}

/** `open-remediation-ticket` — vraie charge utile Jira, ticket synthétique. */
function openTicket(args: Record<string, string>): JsonValue {
  const foyer = FOYERS[args.findingId ?? ''];
  if (!foyer) return { error: 'finding-introuvable', findingId: args.findingId ?? '' };
  const projectKey = args.projectKey ?? 'SEC';
  const owner = OWNERS[foyer.primaryPageId ?? ''];
  const payload = jiraTicketPayload(foyer, owner, projectKey);
  return { syntheticTicketKey: `${projectKey}-417`, url: `https://example.atlassian.net/browse/${projectKey}-417 (synthétique)`, payload: asJson(payload) };
}

/** Dispatch des outils d'écriture (verbes CREATE/UPDATE du §17). */
export async function runAction(
  toolKey: string,
  args: Record<string, string>,
  actorKind: ActorKind,
  session: McpSession,
): Promise<JsonValue> {
  switch (toolKey) {
    case 'record-rotation': return recordRotation(args, actorKind, session);
    case 'request-redaction': return requestRedaction(args, session);
    case 'apply-redaction': return applyRedactionTool(args, session);
    case 'dismiss-finding': return dismissFinding(args);
    case 'open-remediation-ticket': return openTicket(args);
    default: return { error: 'outil-inconnu', toolKey };
  }
}
