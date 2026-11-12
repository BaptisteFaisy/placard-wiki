/**
 * Corpus de canaris — les valeurs de test dont la fuite doit être impossible.
 *
 * Le projet claiming « zéro secret persisté, jamais testé, jamais journalisé »
 * doit être **prouvé**, pas affirmé. Ce corpus en est l'instrument : chaque
 * valeur est une valeur **factice** (générée à l'exécution par
 * `@placard/core`, source unique autorisée), plantée dans l'espace de
 * démonstration, et **connue du test** — donc traçable.
 *
 * Trois formes par fixture, parce que trois chemins de fuite existent :
 *  - la valeur brute (le corps de page, le commentaire, la pièce jointe) ;
 *  - la valeur aplatie sur une ligne (un bloc PEM recopié dans un titre) ;
 *  - la valeur **bornée** qui tient dans les 255 caractères d'un titre
 *    Confluence — c'est le cas mesuré : les titres de la démo contiennent des
 *    faux secrets, et c'est par les titres que la charge utile live a failli
 *    laisser passer (12 novembre 2026).
 *
 * Discipline : une fuite est nommée par son **étiquette** et son **empreinte**
 * HMAC — jamais par sa valeur. Le test qui échoue ne recopie donc jamais le
 * secret qu'il a trouvé.
 */

import { computeFingerprint } from '@placard/core';
import { SECRET_FIXTURES, surUneLigne, titreSecret } from '@placard-wiki/demo-space';

/** Un canari : une valeur factice étiquetée, à ne jamais voir apparaître. */
export interface Canary {
  /** Étiquette lisible — famille, gîte et variante. Jamais la valeur. */
  label: string;
  /** La valeur factice plantée dans la démo. */
  value: string;
}

/** Extrait la valeur portée par un titre de démo (entre « (mdp: » et « ) [ »). */
function valeurDansTitre(titre: string): string {
  const debut = titre.indexOf('(mdp: ');
  const fin = titre.lastIndexOf(') [');
  if (debut < 0 || fin <= debut) return '';
  return titre.slice(debut + '(mdp: '.length, fin);
}

/** Construit le corpus : chaque fixture, plus ses formes dérivées. */
function buildCanaries(): readonly Canary[] {
  const out: Canary[] = [];
  const vus = new Set<string>();
  const ajouter = (label: string, value: string): void => {
    if (value.trim() === '' || vus.has(value)) return;
    vus.add(value);
    out.push({ label, value });
  };
  for (const fixture of SECRET_FIXTURES) {
    const base = `${fixture.family}/${fixture.gite}`;
    ajouter(`${base}/brut`, fixture.value);
    ajouter(`${base}/une-ligne`, surUneLigne(fixture.value));
    ajouter(`${base}/titre`, valeurDansTitre(titreSecret(fixture)));
  }
  return Object.freeze(out);
}

/** Le corpus de canaris, figé à l'import (déterministe : mêmes valeurs à chaque passage). */
export const CANARIES: readonly Canary[] = buildCanaries();

/** Empreinte HMAC d'une valeur : nommer une fuite sans la montrer. */
export function canaryFingerprint(value: string, hmacKey: string): string {
  return computeFingerprint(value, hmacKey);
}

/** Une fuite constatée : étiquette + empreinte + longueur. Jamais la valeur. */
export interface CanaryHit {
  label: string;
  fingerprint: string;
  length: number;
}

/** Cherche les canaris dans un texte (charge utile, journal, registre, invite…). */
export function findCanaries(
  haystack: string,
  hmacKey: string,
  canaries: readonly Canary[] = CANARIES,
): CanaryHit[] {
  const hits: CanaryHit[] = [];
  for (const canary of canaries) {
    if (haystack.includes(canary.value)) {
      hits.push({
        label: canary.label,
        fingerprint: canaryFingerprint(canary.value, hmacKey),
        length: canary.value.length,
      });
    }
  }
  return hits;
}

/**
 * Les canaris que le balayage a **reconnus** : leur empreinte figure dans les
 * détections. Ce sont ceux dont l'app a la connaissance — donc ceux dont la
 * fuite serait une faute de l'app, et non une limite des règles.
 *
 * Les autres (une valeur qu'aucune règle ne reconnaît) restent un angle mort
 * déclaré : ils sont constatés par la preuve, pas dissimulés.
 */
export function canariesReconnus(
  fingerprints: ReadonlySet<string>,
  hmacKey: string,
  canaries: readonly Canary[] = CANARIES,
): readonly Canary[] {
  return canaries.filter((canary) => fingerprints.has(canaryFingerprint(canary.value, hmacKey)));
}

/**
 * Échoue si un canari apparaît dans le texte. Le message nomme l'emplacement,
 * l'étiquette et l'empreinte du canari — **pas sa valeur** : même en cas
 * d'échec, la preuve ne recopie pas ce qu'elle a trouvé.
 */
export function assertNoCanary(
  haystack: string,
  where: string,
  hmacKey: string,
  canaries: readonly Canary[] = CANARIES,
): void {
  const hits = findCanaries(haystack, hmacKey, canaries);
  if (hits.length === 0) return;
  const detail = hits.map((hit) => `${hit.label} [${hit.fingerprint}] (${String(hit.length)} car.)`).join(', ');
  throw new Error(`Fuite de valeur de test dans ${where} : ${detail}`);
}
