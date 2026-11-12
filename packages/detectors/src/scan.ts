/**
 * Pipeline de balayage wiki (§7) : `scanItem` transforme un champ de
 * conteneur Confluence en candidats bornés, sans jamais exposer de valeur.
 *
 * Chaîne d'assemblage — réemploi, pas copie (§21) :
 *  1. les **neuf familles Git** passent par le moteur vendor
 *     (`createDetectorEngine` de `@placard/detectors`), ligne par ligne ;
 *  2. la **famille 10** (chaînes de connexion) s'ajoute par-dessus, et gagne
 *     sur la règle vendor « mot de passe dans une URL » à chevauchement égal ;
 *  3. la **famille 11** (tableaux d'identifiants) est structurelle : la table
 *     entière est candidate, toujours ambigue (oracle LLM, §7) ;
 *  4. la **famille 12** (pièces jointes) combine `scanPath` du vendor,
 *     les extensions wiki complémentaires et l'entropie de l'extrait.
 *
 * Chaque candidat porte : empreinte HMAC (`computeFingerprint` de
 * `@placard/core`, clé injectable), aperçu masqué (`redactPreview`), bornes
 * dans le texte, règle, confiance, ambiguïté et `isKnownFake` (`isDummyValue`).
 */

import { computeFingerprint, isDummyValue, redactPreview } from '@placard/core';
import { createDetectorEngine } from '@placard/detectors';

import {
  RULE_ATTACHMENT_ENTROPY,
  findWikiRiskyExtension,
  isHighEntropyBlob,
} from './rules/attachments';
import { findConnectionStrings } from './rules/connection-strings';
import { findCredentialTables, tableIsKnownFake } from './rules/credential-tables';
import type { DetectionCandidate, ScanItem, VendorEngine, WikiScanDeps } from './types';

/** Borne du nombre de candidats par élément (budget §14, anti-contenu hostile). */
const MAX_CANDIDATES_PER_ITEM = 200;

/** Familles dont le contexte décide → toujours marquées ambiguës (§7). */
const AMBIGUOUS_FAMILIES: readonly string[] = ['suspicious-string', 'credential-table'];

/** Confiance déclarée des règles wiki (le vendor apporte la sienne). */
const CONFIDENCE = {
  connectionString: 0.9,
  credentialTable: 0.55,
  riskyExtension: 0.75,
  binaryEntropy: 0.5,
} as const;

/** Occurrence intermédiaire : valeur brute en mémoire, bornes absolues. */
interface SpanHit {
  family: string;
  ruleId: string;
  value: string;
  charStart: number;
  charEnd: number;
  confidence: number;
}

/** Moteur vendor par défaut, construit une fois par appel de `scanItem`. */
function vendorEngineOf(deps: WikiScanDeps): VendorEngine {
  if (deps.engine !== undefined) return deps.engine;
  return createDetectorEngine(
    deps.entropyThreshold === undefined ? {} : { entropyThreshold: deps.entropyThreshold },
  ) as unknown as VendorEngine;
}

/** Priorité wiki par règle : l'URI gagne sur la forme JDBC à paramètre. */
const WIKI_PRIORITIES: Readonly<Record<string, number>> = {
  'connection-string-uri': 72,
  'connection-string-jdbc-param': 71,
};

/**
 * Résolution des chevauchements, même discipline que `overlap.ts` du vendor :
 * la règle wiki la plus prioritaire gagne (une chaîne de connexion absorbe le
 * « mot de passe dans une URL » de la famille 5), puis la confiance, puis la
 * longueur. Une valeur ne produit qu'un seul candidat.
 */
function dedupeHits(hits: readonly SpanHit[]): SpanHit[] {
  const sorted = [...hits].sort(
    (a, b) =>
      (WIKI_PRIORITIES[b.ruleId] ?? 0) - (WIKI_PRIORITIES[a.ruleId] ?? 0) ||
      b.confidence - a.confidence ||
      b.charEnd - b.charStart - (a.charEnd - a.charStart),
  );
  const kept: SpanHit[] = [];
  for (const hit of sorted) {
    const clashes = kept.some(
      (winner) => winner.charStart < hit.charEnd && hit.charStart < winner.charEnd,
    );
    if (!clashes) kept.push(hit);
  }
  return kept.sort((a, b) => a.charStart - b.charStart || b.charEnd - a.charEnd);
}

/** Occurrences des neuf familles Git, ligne par ligne, en bornes absolues. */
function collectVendorHits(item: ScanItem, engine: VendorEngine): SpanHit[] {
  const hits: SpanHit[] = [];
  let lineStart = 0;
  const lines = item.text.split('\n');
  for (let index = 0; index < lines.length && hits.length < MAX_CANDIDATES_PER_ITEM; index += 1) {
    const line = lines[index] ?? '';
    const result = engine.scanLine({
      line,
      path: item.filename ?? '',
      commit: '',
      lineNumber: index + 1,
      side: 'added',
    });
    for (const detection of result.detections) {
      hits.push({
        family: detection.family,
        ruleId: detection.rule,
        value: detection.value,
        charStart: lineStart + detection.start,
        charEnd: lineStart + detection.end,
        confidence: detection.confidence,
      });
    }
    lineStart += line.length + 1;
  }
  return hits;
}

/** Occurrences de la famille 10 (chaînes de connexion), en bornes absolues. */
function collectConnectionStringHits(item: ScanItem): SpanHit[] {
  const hits: SpanHit[] = [];
  let lineStart = 0;
  for (const line of item.text.split('\n')) {
    for (const match of findConnectionStrings(line)) {
      hits.push({
        family: 'connection-string',
        ruleId: match.ruleId,
        value: match.password,
        charStart: lineStart + match.start,
        charEnd: lineStart + match.end,
        confidence: CONFIDENCE.connectionString,
      });
    }
    lineStart += line.length + 1;
  }
  return hits;
}

/** Candidats de la famille 11 : la structure entière, toujours ambigue. */
function collectTableCandidates(item: ScanItem, deps: WikiScanDeps): DetectionCandidate[] {
  return findCredentialTables(item.text).map((matched) =>
    toCandidate(
      {
        family: 'credential-table',
        ruleId: matched.ruleId,
        value: matched.structure,
        charStart: matched.start,
        charEnd: matched.end,
        confidence: CONFIDENCE.credentialTable,
      },
      deps,
      tableIsKnownFake(matched),
    ),
  );
}

/** Candidats de la famille 12 : nom (vendor + wiki) et entropie de l'extrait. */
function collectAttachmentCandidates(
  item: ScanItem,
  deps: WikiScanDeps,
  engine: VendorEngine,
): DetectionCandidate[] {
  const filename = item.filename;
  if (filename === undefined || filename.length === 0) return [];
  const out = nameBasedCandidates(item, deps, engine, filename);
  if (isHighEntropyBlob(item.text)) {
    out.push(
      toCandidate(
        {
          family: 'risky-file',
          ruleId: RULE_ATTACHMENT_ENTROPY,
          value: filename,
          charStart: 0,
          charEnd: Math.min(item.text.length, 4096),
          confidence: CONFIDENCE.binaryEntropy,
        },
        deps,
      ),
    );
  }
  return out;
}

/** Signal n° 1 : le nom — scanPath du vendor, complété par les règles wiki. */
function nameBasedCandidates(
  item: ScanItem,
  deps: WikiScanDeps,
  engine: VendorEngine,
  filename: string,
): DetectionCandidate[] {
  const out: DetectionCandidate[] = [];
  for (const detection of engine.scanPath(filename).detections) {
    out.push(
      toCandidate(
        {
          family: 'risky-file',
          ruleId: detection.rule,
          value: detection.value,
          charStart: 0,
          charEnd: item.text.length,
          confidence: detection.confidence,
        },
        deps,
      ),
    );
  }
  const wikiMatch = findWikiRiskyExtension(filename);
  if (wikiMatch !== undefined && out.length === 0) {
    out.push(
      toCandidate(
        {
          family: 'risky-file',
          ruleId: wikiMatch.ruleId,
          value: filename,
          charStart: 0,
          charEnd: item.text.length,
          confidence: CONFIDENCE.riskyExtension,
        },
        deps,
      ),
    );
  }
  return out;
}

/** Occurrence → candidat : empreinte HMAC + aperçu masqué, valeur oubliée. */
function toCandidate(hit: SpanHit, deps: WikiScanDeps, knownFake?: boolean): DetectionCandidate {
  return {
    family: hit.family as DetectionCandidate['family'],
    fingerprint: computeFingerprint(hit.value, deps.hmacKey),
    maskedPreview: redactPreview(hit.value, hit.family),
    charStart: hit.charStart,
    charEnd: hit.charEnd,
    ruleId: hit.ruleId,
    confidence: hit.confidence,
    ambiguous: AMBIGUOUS_FAMILIES.includes(hit.family),
    isKnownFake: knownFake ?? isDummyValue(hit.value),
  };
}

/**
 * Balaye un élément et rend ses candidats, triés par position. Ne lève jamais :
 * un contenu hostile produit une liste vide ou partielle (PLA-P-10).
 */
export function scanItem(item: ScanItem, deps: WikiScanDeps): DetectionCandidate[] {
  if (typeof deps?.hmacKey !== 'string' || deps.hmacKey.length === 0) {
    throw new Error('scanItem: deps.hmacKey est obligatoire (clé HMAC de l’installation)');
  }
  const disabled = new Set(deps.disabledFamilies ?? []);
  try {
    return assemble(item, deps, disabled);
  } catch {
    return [];
  }
}

/** Assemblage des quatre étages, filtré par familles désactivées. */
function assemble(
  item: ScanItem,
  deps: WikiScanDeps,
  disabled: ReadonlySet<string>,
): DetectionCandidate[] {
  const text = typeof item.text === 'string' ? item.text : '';
  const bounded: ScanItem = { ...item, text };
  const engine = vendorEngineOf(deps);
  const connectionHits = disabled.has('connection-string')
    ? []
    : collectConnectionStringHits(bounded);
  const vendorHits = collectVendorHits(bounded, engine);
  const hits = dedupeHits([...connectionHits, ...vendorHits]).filter(
    (hit) => !disabled.has(hit.family),
  );
  const candidates = hits.map((hit) => toCandidate(hit, deps));
  if (!disabled.has('credential-table')) candidates.push(...collectTableCandidates(bounded, deps));
  if (!disabled.has('risky-file')) {
    candidates.push(...collectAttachmentCandidates(bounded, deps, engine));
  }
  return candidates
    .sort((a, b) => a.charStart - b.charStart || b.charEnd - a.charEnd)
    .slice(0, MAX_CANDIDATES_PER_ITEM);
}

/** Fabrique un scanner lié à ses dépendances (clé HMAC injectée une fois). */
export function createWikiScanner(deps: WikiScanDeps): { scanItem(item: ScanItem): DetectionCandidate[] } {
  return { scanItem: (item: ScanItem) => scanItem(item, deps) };
}
