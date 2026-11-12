// Détection locale « motifs légers du site » — pour `check-text` et le skill
// `before-sharing-a-page`.
//
// Écart documenté (règle du dépôt) : le VRAI moteur `@placard-wiki/detectors`
// n'est pas importable côté navigateur — il dépend de `@placard/core`, qui
// importe `node:crypto` (createHmac). Le site réimplémente donc un sous-ensemble
// de motifs par famille, volontairement plus simple que le moteur réel
// (pas d'entropie de Shannon, pas de validateurs, pas d'oracle LLM). La
// discipline reste identique : APERÇU MASQUÉ uniquement, jamais la valeur
// brute dans la sortie (PW-04). L'empreinte passe par le shim WebCrypto
// (`lib/fingerprint.ts`).

import type { WikiFamily } from '@placard-wiki/domain';

/** Une occurrence détectée : positions + aperçu masqué, jamais la valeur. */
export interface TextHit {
  family: WikiFamily;
  /** Aperçu masqué (`AKIA…(20)`) — PW-04. */
  maskedPreview: string;
  start: number;
  end: number;
  /** Valeur factice connue (documentation fournisseur) → signalée, pas tue. */
  knownFake: boolean;
}

/** Une règle légère : famille, motif, constructeur d'aperçu masqué. */
interface LightRule {
  family: WikiFamily;
  regex: RegExp;
  /** Construit l'aperçu masqué depuis le match complet (jamais la valeur). */
  preview: (match: string) => string;
  /** Valeurs factices documentées par les fournisseurs (isDummyValue, adapté). */
  fakes?: readonly string[];
}

/** Aperçu générique : préfixe lisible + longueur totale. */
function masked(prefix: string, match: string): string {
  return `${prefix}…(${String(match.length)})`;
}

/** Le mot-clé d'affectation capturé, sans la valeur qui suit. */
function keywordPreview(match: string): string {
  const keyword = match.split(/[:=]/)[0]?.trim() ?? 'valeur';
  const valueLength = match.length - keyword.length;
  return `${keyword}: …(${String(Math.max(valueLength, 0))})`;
}

// Les motifs : écrits en RegExp littérales ; aucune valeur d'exemple complète
// n'apparaît dans ce fichier (couche 0 du dépôt).
const RULES: readonly LightRule[] = [
  {
    family: 'cloud-key',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    preview: (m) => masked(m.slice(0, 4), m),
    fakes: ['AKIAIOSFODNN7EXAMPLE'], // valeur d'exemple documentée par AWS
  },
  {
    family: 'platform-token',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
    preview: (m) => masked(m.slice(0, 5), m),
  },
  {
    family: 'platform-token',
    regex: /\bghp_[A-Za-z0-9]{36}\b/g,
    preview: (m) => masked('ghp_', m),
  },
  {
    family: 'platform-token',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    preview: (m) => masked('sk-', m),
  },
  {
    family: 'private-key',
    regex: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY(?: BLOCK)?-----/g,
    preview: () => '-----BEGIN…PRIVATE KEY-----',
  },
  {
    family: 'signed-token',
    regex: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    preview: (m) => masked('eyJ', m),
  },
  {
    family: 'connection-string',
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:@/]+:[^\s@/]+@[^\s'"<>]+/g,
    preview: (m) => masked(m.split('://')[0] + '://', m),
  },
  {
    family: 'plaintext-password',
    regex: /\b(?:password|passwd|pwd|mot[ _-]de[ _-]passe|mdp)\s*[:=]\s*[^\s,;'"<>]{6,}/gi,
    preview: keywordPreview,
  },
  {
    family: 'bank-data',
    regex: /\bFR76(?:\s?\d){23}\b/g,
    preview: (m) => masked('FR76 ', m),
  },
  {
    family: 'credential-table',
    regex: /^[^\n]*\b(?:login|identifiant|username|user)\b[:=|][^\n]*\b(?:pass|mdp|password|mot de passe)\b[:=|][^\n]*$/gim,
    preview: () => 'ligne « identifiant + mot de passe » — masquée',
  },
];

/** Deux occurrences se chevauchent-elles (mêmes caractères concernés) ? */
function overlaps(a: TextHit, b: TextHit): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Applique une règle au texte et produit les occurrences (aperçus masqués). */
function applyRule(rule: LightRule, text: string): TextHit[] {
  const hits: TextHit[] = [];
  for (const match of text.matchAll(rule.regex)) {
    const value = match[0];
    hits.push({
      family: rule.family,
      maskedPreview: rule.preview(value),
      start: match.index,
      end: match.index + value.length,
      knownFake: rule.fakes?.includes(value) ?? false,
    });
  }
  return hits;
}

/**
 * Détecte les motifs légers dans un texte, sans chevauchement (la première
 * règle qui couvre une position gagne — ordre du tableau RULES).
 */
export function checkText(text: string): TextHit[] {
  const hits: TextHit[] = [];
  for (const rule of RULES) {
    for (const hit of applyRule(rule, text)) {
      if (!hits.some((existing) => overlaps(existing, hit))) hits.push(hit);
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}
