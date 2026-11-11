/**
 * Étape 2 du rituel (§9) : le caviardage, en deux temps.
 *
 * 1. `redactionPreview` — aperçu **masqué** : le contexte est montré, la
 *    valeur jamais (PW-04). Chaque diff porte la ligne avant avec la valeur
 *    remplacée par son aperçu masqué (`AKIA…(20)`), et la ligne après avec le
 *    marqueur daté `[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]`
 *    (date et référence **réelles**, tirées de l'attestation — jamais un
 *    exemple codé en dur). Les modèles de page passent en premier (recette
 *    §25.4 : amplification, chaque nouvelle page recopierait la valeur).
 *
 * 2. `applyRedaction` — refuse sans attestation humaine (§25.7), écrit la
 *    nouvelle version via `StoragePort` **au nom de la personne qui approuve**
 *    (`asUser` = `approvedBy`, recette §25.9) avec un commentaire de version
 *    explicite. Le texte retiré n'est recopié nulle part : cette logique ne
 *    reçoit jamais la valeur brute, seulement des positions (start/end) dans
 *    le texte — les occurrences viennent d'un re-scan éphémère côté résolveur.
 *
 * Réemploi : l'aperçu masqué vient de `redactPreview` (@placard/core) via le
 * champ `maskedPreview` des emplacements — jamais recalculé ici.
 */

import type { Foyer, RedactionDiff, RotationAttestation } from '@placard-wiki/domain';
import type { ContainerType } from '@placard-wiki/domain';

import { canRedact } from './lock.js';
import type { StoragePort } from './ports.js';

/** Une occurrence de la valeur dans un texte : des positions, jamais la valeur. */
export interface Occurrence {
  start: number;
  end: number;
}

/** Un emplacement avec son texte courant (format storage) et ses occurrences. */
export interface RedactionSource {
  locationId: string;
  pageId: string;
  versionNumber?: number;
  containerType: ContainerType;
  /** Texte courant au format storage — la valeur y est présente, à ses positions. */
  text: string;
  occurrences: readonly Occurrence[];
  /** Aperçu masqué de la valeur (`AKIA…(20)`) — vient de la détection. */
  maskedPreview: string;
}

export interface RedactionPreviewResult {
  diffs: RedactionDiff[];
  /** Identifiants des modèles proposés en premier (§25.4). */
  templateFirst: string[];
}

const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
] as const;

/** Formate une date ISO en français court : `12 nov. 2026`. */
export function formatDateFr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate());
  const month = MONTHS_FR[date.getUTCMonth()] ?? 'janv.';
  return `${day} ${month} ${String(date.getUTCFullYear())}`;
}

/**
 * Le marqueur inséré à la place de la valeur (§9) : date de l'attestation et
 * référence de la preuve **réelles**.
 */
export function redactionMarker(attestation: RotationAttestation): string {
  return `[retiré — rotation attestée le ${formatDateFr(attestation.attestedAt)}, voir ${attestation.evidenceRef}]`;
}

/** Remplace les plages `occurrences` par `replacement` (de la fin vers le début). */
export function replaceOccurrences(text: string, occurrences: readonly Occurrence[], replacement: string): string {
  const sorted = [...occurrences].sort((a, b) => b.start - a.start);
  let out = text;
  for (const occurrence of sorted) {
    out = out.slice(0, occurrence.start) + replacement + out.slice(occurrence.end);
  }
  return out;
}

/** Bornes de la ligne contenant la position `at` (le diff montre une ligne). */
function lineBounds(text: string, at: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', at) + 1;
  let end = text.indexOf('\n', at);
  if (end === -1) end = text.length;
  return { start, end };
}

function diffFor(source: RedactionSource, occurrence: Occurrence, marker: string): RedactionDiff {
  const bounds = lineBounds(source.text, occurrence.start);
  const line = source.text.slice(bounds.start, bounds.end);
  const shift = -bounds.start;
  const moved: Occurrence = { start: occurrence.start + shift, end: occurrence.end + shift };
  return {
    locationId: source.locationId,
    pageId: source.pageId,
    ...(source.versionNumber !== undefined ? { versionNumber: source.versionNumber } : {}),
    containerType: source.containerType,
    maskedBefore: replaceOccurrences(line, [moved], source.maskedPreview),
    after: replaceOccurrences(line, [moved], marker),
    replacement: marker,
  };
}

/** Trie les sources : modèles d'abord (§25.4), puis l'ordre d'origine. */
export function sortTemplatesFirst(sources: readonly RedactionSource[]): RedactionSource[] {
  return [...sources].sort((a, b) => {
    const aTemplate = a.containerType === 'template' ? 0 : 1;
    const bTemplate = b.containerType === 'template' ? 0 : 1;
    return aTemplate - bTemplate;
  });
}

/** Aperçu masqué du lot de caviardage, modèles en premier. */
export function redactionPreview(
  attestation: RotationAttestation,
  sources: readonly RedactionSource[],
): RedactionPreviewResult {
  const marker = redactionMarker(attestation);
  const ordered = sortTemplatesFirst(sources);
  const diffs: RedactionDiff[] = [];
  for (const source of ordered) {
    for (const occurrence of source.occurrences) {
      diffs.push(diffFor(source, occurrence, marker));
    }
  }
  const templateFirst = ordered
    .filter((source) => source.containerType === 'template')
    .map((source) => source.locationId);
  return { diffs, templateFirst };
}

/** Refus écrits de l'application (§5 : jamais de modification sans approbation). */
export const REFUSAL_NO_ATTESTATION =
  'Caviardage refusé : aucune attestation de rotation humaine pour ce foyer ' +
  '(PW-09, recette §25.7). Le verrou cède sur une attestation posée par une ' +
  'personne, avec lien vers la preuve.';

export interface ApplyRedactionParams {
  /** La personne qui approuve — la modification est faite en son nom (§25.9). */
  approvedBy: string;
  /** Commentaire de version voulu par la personne (complété par l'app). */
  comment: string;
  sources: readonly RedactionSource[];
}

export type ApplyRedactionResult =
  | {
      ok: true;
      applied: number;
      versionComment: string;
      asUser: string;
      /** Les nouveaux textes storage, par emplacement (la valeur n'y est plus). */
      texts: Array<{ locationId: string; pageId: string; text: string }>;
    }
  | { ok: false; reason: string };

/** Commentaire de version explicite (§9) — sans valeur, avec attribution. */
export function versionCommentOf(foyer: Foyer, attestation: RotationAttestation, approvedBy: string, comment: string): string {
  const base =
    `Placard du wiki : ${foyer.family} retiré — rotation attestée le ` +
    `${formatDateFr(attestation.attestedAt)} (${attestation.evidenceRef}) ; ` +
    `historique non purgé à ce stade. Approuvé par ${approvedBy}.`;
  return comment.trim() === '' ? base : `${comment.trim()} — ${base}`;
}

/**
 * Applique le caviardage : refuse sans attestation humaine valide, puis écrit
 * une nouvelle version par page au nom de `approvedBy`.
 */
export async function applyRedaction(
  foyer: Foyer,
  attestation: RotationAttestation | undefined,
  params: ApplyRedactionParams,
  storage: StoragePort,
): Promise<ApplyRedactionResult> {
  if (!canRedact(foyer, attestation)) return { ok: false, reason: REFUSAL_NO_ATTESTATION };
  if (attestation === undefined) return { ok: false, reason: REFUSAL_NO_ATTESTATION };
  if (params.approvedBy.trim() === '') {
    return {
      ok: false,
      reason: 'Caviardage refusé : approbation nominative absente — la modification est faite au nom de la personne qui approuve (§5).',
    };
  }
  const marker = redactionMarker(attestation);
  const versionComment = versionCommentOf(foyer, attestation, params.approvedBy, params.comment);
  const texts: Array<{ locationId: string; pageId: string; text: string }> = [];
  let applied = 0;
  for (const source of sortTemplatesFirst(params.sources)) {
    const text = replaceOccurrences(source.text, source.occurrences, marker);
    await storage.writeVersion(source.pageId, text, versionComment, params.approvedBy);
    applied += 1;
    texts.push({ locationId: source.locationId, pageId: source.pageId, text });
  }
  return { ok: true, applied, versionComment, asUser: params.approvedBy, texts };
}
