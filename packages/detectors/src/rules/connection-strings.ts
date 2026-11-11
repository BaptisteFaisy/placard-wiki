/**
 * Famille 10 (§7) : chaînes de connexion avec mot de passe intégré.
 *
 * `postgres://`, `mongodb://` (et `+srv`), `mysql://`, `redis://`, `amqp://`
 * et les URL JDBC. Le réemploi est total pour la logique délicate :
 * `passwordFromUrl` de `@placard/detectors` extrait le mot de passe d'une
 * autorité `scheme://user:pass@host`, `isPlausibleSecret` et `isDummyValue`
 * décident si la valeur est un secret plausible ou une valeur factice connue.
 *
 * La valeur retenue pour l'empreinte est le **mot de passe seul** : deux pages
 * qui recopient la même chaîne partagent le même foyer, et l'aperçu masqué ne
 * révèle ni l'hôte, ni l'utilisateur, ni la valeur.
 */

import { isDummyValue } from '@placard/core';
import { PASSWORD_MIN_ENTROPY, isPlausibleSecret, passwordFromUrl } from '@placard/detectors';

/** Une occurrence bornée de chaîne de connexion dans une ligne. */
export interface ConnectionMatch {
  ruleId: string;
  /** Le mot de passe intégré — en mémoire seulement, à destination du HMAC. */
  password: string;
  /** Début de la chaîne entière dans la ligne. */
  start: number;
  /** Fin (exclue) de la chaîne entière dans la ligne. */
  end: number;
  /** La valeur est une valeur factice connue (malus −20, §8). */
  isKnownFake: boolean;
}

/** Identifiants stables des règles de la famille. */
export const RULE_CONNECTION_URI = 'connection-string-uri';
export const RULE_CONNECTION_JDBC_PARAM = 'connection-string-jdbc-param';

/**
 * Schémas visés par le cahier (§7, famille 10), construits par concaténation :
 * aucun littéral au format d'un secret réel n'est écrit ici (couche 0 CI).
 */
const SCHEMES = [
  'postgres',
  'postgresql',
  'mongodb',
  'mongodb\\+srv',
  'mysql',
  'mariadb',
  'redis',
  'rediss',
  'amqp',
  'amqps',
  'mssql',
  'sqlserver',
];

/** Mot-clés du préfiltre : sans l'un d'eux, la règle n'est pas essayée. */
const KEYWORDS: readonly string[] = ['://', 'jdbc:'];

/**
 * Motif URI : `scheme://utilisateur:motdepasse@` — l'autorité porte des
 * identifiants. Borné (longueurs maximales) pour éviter tout backtracking
 * catastrophique sur un contenu hostile.
 */
const URI_PATTERN = new RegExp(
  `(?<![\\w+])((?:${SCHEMES.join('|')})://[^\\s:/@'\"]{0,64}:[^\\s:/@'\"]{1,128}@)`,
  'gi',
);

/**
 * Motif JDBC à paramètre : `jdbc:sous-protocole://hôte/base?...password=X...`
 * avec `X` non vide. Certains pilotes acceptent aussi `?user=U&password=P`.
 */
const JDBC_PARAM_PATTERN = new RegExp(
  `(jdbc:[a-z0-9]+:[^\\s'\"]{0,300}?[?;&](?:password|passwd|pwd)=([^\\s&;'"]{1,128}))`,
  'gi',
);

/** Le préfiltre par mots-clés passe-t-il ? (même discipline que le vendor) */
function prefilterPasses(loweredLine: string): boolean {
  return KEYWORDS.some((keyword) => loweredLine.includes(keyword));
}

/** Un mot de passe est-il un secret plausible (ni gabarit, ni valeur factice) ? */
export function isRealisticPassword(password: string): boolean {
  return isPlausibleSecret(password, 4, PASSWORD_MIN_ENTROPY) || isDummyValue(password);
}

/** Énumère les occurrences URI d'une ligne ; ne lève jamais. */
function scanUriForm(line: string, out: ConnectionMatch[]): void {
  URI_PATTERN.lastIndex = 0;
  let match = URI_PATTERN.exec(line);
  let seen = 0;
  while (match !== null && seen < 32) {
    seen += 1;
    const whole = match[1] ?? match[0] ?? '';
    const password = passwordFromUrl(whole);
    const index = match.index;
    if (password !== undefined && isRealisticPassword(password)) {
      out.push({
        ruleId: RULE_CONNECTION_URI,
        password,
        start: index,
        end: index + whole.length,
        isKnownFake: isDummyValue(password),
      });
    }
    if (whole.length === 0) URI_PATTERN.lastIndex += 1;
    match = URI_PATTERN.exec(line);
  }
}

/** Énumère les occurrences JDBC à paramètre d'une ligne ; ne lève jamais. */
function scanJdbcParamForm(line: string, out: ConnectionMatch[]): void {
  JDBC_PARAM_PATTERN.lastIndex = 0;
  let match = JDBC_PARAM_PATTERN.exec(line);
  let seen = 0;
  while (match !== null && seen < 32) {
    seen += 1;
    const whole = match[1] ?? match[0] ?? '';
    const password = match[2] ?? '';
    const index = match.index;
    if (password.length > 0 && isRealisticPassword(password)) {
      out.push({
        ruleId: RULE_CONNECTION_JDBC_PARAM,
        password,
        start: index,
        end: index + whole.length,
        isKnownFake: isDummyValue(password),
      });
    }
    if (whole.length === 0) JDBC_PARAM_PATTERN.lastIndex += 1;
    match = JDBC_PARAM_PATTERN.exec(line);
  }
}

/**
 * Trouve les chaînes de connexion d'une ligne. Retour vide si le préfiltre ne
 * passe pas : la règle est bon marché mais le balayage porte sur des centaines
 * de milliers de lignes (§14).
 */
export function findConnectionStrings(line: string): ConnectionMatch[] {
  if (typeof line !== 'string' || line.length === 0) return [];
  if (!prefilterPasses(line.toLowerCase())) return [];
  const out: ConnectionMatch[] = [];
  try {
    scanUriForm(line, out);
    scanJdbcParamForm(line, out);
  } catch {
    // Contenu hostile : la ligne est abandonnée, le balayage continue (PLA-P-10).
  }
  return out;
}
