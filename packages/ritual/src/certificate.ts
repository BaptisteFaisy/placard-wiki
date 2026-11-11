/**
 * Étape 5 du rituel (§9) : le certificat — une page datée et chiffrée, pour
 * un auditeur (PW-17, recette §25.16).
 *
 * Le certificat chiffre : foyers ouverts, tournés, caviardés, purgés,
 * exposition résiduelle, angles morts déclarés. **Aucun secret, jamais** :
 * que des compteurs, des dates, des fourchettes et des limites assumées.
 *
 * Réemploi : la structure vient du certificat de `@placard/ritual` (Git) —
 * mêmes principes (compteurs + section « ce que le certificat ne couvre pas »
 * + intégrité par empreinte), adaptés au domaine wiki : ici le certificat est
 * une donnée du registre (`Certificate`, types.ts), pas un fichier
 * `PLACARD.md` ; l'empreinte est un HMAC-SHA-256 du JSON canonique avec la
 * clé propre à l'installation, jamais un hash nu.
 */

import { createHmac } from 'node:crypto';

import type { Certificate } from '@placard-wiki/domain';

import type { ClockPort } from './ports.js';

/** Les compteurs du certificat (§25.16) — que des nombres et une fourchette. */
export interface CertificateCounters {
  open: number;
  rotated: number;
  redacted: number;
  purged: number;
  /** Exposition résiduelle, en lettres et en chiffres (fourchettes, méthodes). */
  residualExposure: string;
}

/**
 * Angles morts par défaut — la partie honnête du document, adaptée de la
 * section « what this certificate does not cover » de `@placard/ritual`.
 */
export const DEFAULT_BLIND_SPOTS: readonly string[] = [
  'Le certificat ne prouve pas que la clé a été tournée : l’étape 1 enregistre une attestation humaine, l’app n’interroge jamais le fournisseur.',
  'Les whiteboards et bases Confluence ne sont pas balayés (PW-29).',
  'Les pièces jointes non textuelles (captures d’écran, archives) ne sont pas lues : elles figurent au budget, avec leur raison.',
  'Une purge d’historique ne désactive rien : une valeur jamais tournée reste valide même purgée.',
  'Les copies hors du wiki (dépôts Git, sauvegardes, exports, caches d’IA) ne sont pas couvertes par ce certificat.',
];

/** JSON canonique : clés triées, sans espace — même contenu, même empreinte. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${parts.join(',')}}`;
}

/** HMAC-SHA-256 du JSON canonique, avec la clé propre à l'installation (§25.16). */
export function contentHashOf(content: Record<string, unknown>, installationKey: string): string {
  const hmac = createHmac('sha256', installationKey);
  hmac.update(canonicalJson(content));
  return `hmac256:${hmac.digest('hex')}`;
}

/**
 * Émet le certificat. `blindSpots` remplace les angles morts par défaut quand
 * il est fourni — un angle mort déclaré reste déclaré, jamais masqué (§19).
 */
export function certificate(
  scope: string,
  counters: CertificateCounters,
  blindSpots: readonly string[],
  installationKey: string,
  clock: ClockPort,
): Certificate {
  const issuedAt = clock.now();
  const spots = blindSpots.length > 0 ? [...blindSpots] : [...DEFAULT_BLIND_SPOTS];
  const content = {
    scope,
    issuedAt,
    open: counters.open,
    rotated: counters.rotated,
    redacted: counters.redacted,
    purged: counters.purged,
    residualExposure: counters.residualExposure,
    blindSpots: spots,
  };
  const contentHash = contentHashOf(content, installationKey);
  return {
    id: `cert:${contentHash.slice(8, 24)}`,
    scope,
    issuedAt,
    open: counters.open,
    rotated: counters.rotated,
    redacted: counters.redacted,
    purged: counters.purged,
    residualExposure: counters.residualExposure,
    blindSpots: spots,
    contentHash,
  };
}

/** Vérifie l'intégrité d'un certificat avec la clé d'installation (§25.16). */
export function verifyCertificate(cert: Certificate, installationKey: string): boolean {
  const content = {
    scope: cert.scope,
    issuedAt: cert.issuedAt,
    open: cert.open,
    rotated: cert.rotated,
    redacted: cert.redacted,
    purged: cert.purged,
    residualExposure: cert.residualExposure,
    blindSpots: cert.blindSpots,
  };
  return contentHashOf(content, installationKey) === cert.contentHash;
}
