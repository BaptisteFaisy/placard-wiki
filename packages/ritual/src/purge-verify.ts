/**
 * La vérification « est-ce encore lisible ? » (§9) — l'honnêteté de l'étape 3.
 *
 * Une purge annoncée n'est pas une purge prouvée. Après une purge **ou** une
 * restauration, on relit ce qui reste : si la version visée n'est **plus**
 * lisible, la purge est vérifiée ; sinon le foyer **reste ouvert** avec la
 * raison exacte — jamais un « purgé » de convenance.
 *
 * Deux pièges mesurés sur le site réel (12 novembre 2026) :
 *
 * 1. **La renumérotation.** Après `DELETE /wiki/rest/api/content/{id}/version/{n}`,
 *    les versions postérieures sont renumérotées (mesuré : `[1,2,3,4]`, purge de la
 *    2 → `[1,2,3]` où la 2 porte l'ancien contenu de la 3). Le numéro de version
 *    n'est donc **pas** un identifiant stable : vérifier « la version 2 n'existe
 *    plus » après une purge de la 1 se trompera. On compare donc l'**empreinte**
 *    du contenu visé, et on cherche s'il est encore lisible **ailleurs**.
 * 2. **Trois issues, pas deux.** Un lecteur peut dire « absente » (la version
 *    n'existe plus) mais aussi « illisible » (droits manquants, HTTP 401). La
 *    seconde ne prouve **rien** : elle ne doit jamais se lire comme un « purgé ».
 */

import type { FoyerState } from '@placard-wiki/domain';

/** Ce que la lecture d'une version donne — trois issues, jamais deux. */
export type VersionRead =
  | { kind: 'found'; body: string }
  /** La version n'existe plus : la purge a fait son effet. */
  | { kind: 'absent' }
  /** La version existe mais n'a pas pu être lue (droits manquants). */
  | { kind: 'unreadable'; status: number; reason: string };

/** Lecteur injectable des versions d'une page (aucun accès réseau dans les tests). */
export interface VersionReader {
  /** Lit une version précise. */
  readVersion(pageId: string, versionNumber: number): Promise<VersionRead>;
  /** Numéros de versions encore listés sur la page. */
  listVersionNumbers(pageId: string): Promise<number[]>;
}

/** Fonction d'empreinte (HMAC côté runtime) — jamais un hash nu. */
export type FingerprintFn = (content: string) => string;

/** Une version à vérifier, avec l'empreinte de ce qu'elle contenait. */
export interface PurgeVerificationTarget {
  pageId: string;
  versionNumber: number;
  /** Empreinte du contenu visé **avant** la purge. */
  expectedFingerprint?: string;
}

/** Le verdict pour une version visée. */
export interface PurgeVerification {
  pageId: string;
  versionNumber: number;
  /** La version visée n'est plus lisible. */
  purged: boolean;
  /** Raison exacte — toujours écrite quand `purged` est faux. */
  reason: string;
}

/** Le verdict d'ensemble, et l'état du foyer qui en découle. */
export interface VerifyPurgeResult {
  /** Toutes les versions visées ont disparu. */
  verified: boolean;
  checks: PurgeVerification[];
  /** Raison exacte du foyer resté ouvert — vide quand tout est vérifié. */
  reason: string;
  /** L'état du foyer après vérification : « purgé » ou un état ouvert. */
  foyerState: FoyerState;
}

export interface VerifyPurgeOptions {
  /** Empreintes attendues, par numéro de version (avant purge). */
  expectedFingerprints?: Readonly<Record<number, string>>;
  /** Fonction d'empreinte : sans elle, la comparaison n'est pas possible. */
  fingerprint?: FingerprintFn;
  /** État du foyer quand la vérification n'est pas concluante. */
  staysOpenState?: FoyerState;
}

/** Vérifie une seule version, en tenant compte de la renumérotation. */
async function checkVersion(
  target: PurgeVerificationTarget,
  reader: VersionReader,
  options: VerifyPurgeOptions,
): Promise<PurgeVerification> {
  const { pageId, versionNumber } = target;
  const read = await reader.readVersion(pageId, versionNumber);
  if (read.kind === 'unreadable') {
    return {
      pageId, versionNumber, purged: false,
      reason: `vérification impossible pour la version ${String(versionNumber)} : ${read.reason} (HTTP ${String(read.status)})`,
    };
  }
  if (read.kind === 'absent') {
    return { pageId, versionNumber, purged: true, reason: `la version ${String(versionNumber)} n'existe plus` };
  }
  const expected = target.expectedFingerprint;
  const fingerprint = options.fingerprint;
  if (expected === undefined || fingerprint === undefined) {
    return { pageId, versionNumber, purged: false, reason: `la version ${String(versionNumber)} est encore lisible` };
  }
  if (fingerprint(read.body) === expected) {
    return {
      pageId, versionNumber, purged: false,
      reason: `la version ${String(versionNumber)} est encore lisible (empreinte inchangée)`,
    };
  }
  const elsewhere = await findElsewhere(pageId, versionNumber, expected, reader, fingerprint);
  if (elsewhere !== null) {
    return {
      pageId, versionNumber, purged: false,
      reason: `le contenu visé est encore lisible en version ${String(elsewhere)} (la version ${String(versionNumber)} a été renumérotée)`,
    };
  }
  return {
    pageId, versionNumber, purged: true,
    reason: `le contenu visé n'est plus lisible (la version ${String(versionNumber)} porte un autre contenu après renumérotation)`,
  };
}

/** Cherche le contenu visé dans les autres versions encore listées. */
async function findElsewhere(
  pageId: string,
  exceptNumber: number,
  expectedFingerprint: string,
  reader: VersionReader,
  fingerprint: FingerprintFn,
): Promise<number | null> {
  const numbers = await reader.listVersionNumbers(pageId);
  for (const number of numbers) {
    if (number === exceptNumber) continue;
    const read = await reader.readVersion(pageId, number);
    if (read.kind !== 'found') continue;
    if (fingerprint(read.body) === expectedFingerprint) return number;
  }
  return null;
}

/**
 * Vérifie ce qui reste lisible après une purge (ou une restauration) et donne
 * l'état du foyer : « purgé » **seulement** si la version n'est plus lisible.
 */
export async function verifyPurge(
  pageId: string,
  versionNumbers: readonly number[],
  reader: VersionReader,
  options: VerifyPurgeOptions = {},
): Promise<VerifyPurgeResult> {
  const expected = options.expectedFingerprints ?? {};
  const targets: PurgeVerificationTarget[] = versionNumbers.map((versionNumber) => ({
    pageId,
    versionNumber,
    ...(expected[versionNumber] !== undefined ? { expectedFingerprint: expected[versionNumber] } : {}),
  }));
  const checks: PurgeVerification[] = [];
  for (const target of targets) checks.push(await checkVersion(target, reader, options));
  const remaining = checks.filter((check) => !check.purged);
  if (remaining.length === 0) {
    return { verified: true, checks, reason: '', foyerState: 'purged' };
  }
  return {
    verified: false,
    checks,
    reason: remaining.map((check) => check.reason).join(' ; '),
    foyerState: options.staysOpenState ?? 'purge-requested',
  };
}
