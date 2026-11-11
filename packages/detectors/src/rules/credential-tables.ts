/**
 * Famille 11 (§7) : tableaux d'identifiants — le motif Confluence par
 * excellence.
 *
 * Détection **structurelle** du XML storage : un `<table>` (ou une liste
 * `<ul>`/`<ol>`) dont une colonne ressemble à un identifiant et une autre à un
 * secret. La **structure entière** est candidate (bornes = toute la table),
 * jamais une cellule isolée : caviarder une valeur sans retirer le tableau
 * laisserait le motif se recopier.
 *
 * Deux voies, dans l'ordre :
 *  1. **en-têtes** : une colonne « identifiant » (login, user, compte, e-mail…)
 *     et une colonne « secret » (mot de passe, mdp, token, clé…) ;
 *  2. **contenu** : sans en-tête parlant, une cellule e-mail/login voisine
 *     d'une cellule à forte entropie dans la même ligne.
 *
 * Le candidat est toujours marqué `ambiguous` : seule la lecture du contexte
 * (runbook réel ou exemple de documentation) tranche — c'est le rôle de
 * l'oracle LLM (§7, §14), avec cache par empreinte de contenu.
 */

import { isDummyValue, shannonEntropy } from '@placard/core';

/** Identifiant stable de la règle structurelle. */
export const RULE_CREDENTIAL_TABLE = 'credential-table-structure';
export const RULE_CREDENTIAL_LIST = 'credential-list-structure';

/** Mots-clés d'une colonne « identifiant » (FR/EN, vocabulaire wiki courant). */
const LOGIN_HEADER =
  /\b(identifiant|login|utilisateur|user ?name|compte|account|e-?mail|courriel|id)\b/i;

/** Mots-clés d'une colonne « secret ». */
const SECRET_HEADER =
  /\b(mot de passe|password|passphrase|mdp|pwd|secret|token|jeton|cl[ée]|key|otp|code|credential)\b/i;

/** Taille maximale d'une structure analysée (borne anti-contenu hostile, §14). */
export const MAX_STRUCTURE_CHARS = 20_000;

/** Entropie minimale d'une cellule « valeur secrète » sans en-tête parlant. */
const CELL_SECRET_ENTROPY = 3.0;

/** Longueur minimale d'une cellule « valeur secrète » sans en-tête parlant. */
const CELL_SECRET_MIN_LENGTH = 8;

/** Une occurrence structurelle bornée dans le texte. */
export interface TableMatch {
  ruleId: string;
  /** Début de la structure entière dans le texte. */
  start: number;
  /** Fin (exclue) de la structure entière dans le texte. */
  end: number;
  /** Le texte brut de la structure — en mémoire seulement, à destination du HMAC. */
  structure: string;
  /** Valeurs de la colonne secret : toutes factices → `isKnownFake`. */
  secretCells: string[];
}

/** Retire les balises d'un fragment XML storage : reste le texte visible. */
function stripTags(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}

/** Cellules d'une ligne : `<th>` et `<td>`, texte visible, vides écartées. */
function cellsOfRow(rowXml: string): string[] {
  const cells: string[] = [];
  const pattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let match = pattern.exec(rowXml);
  while (match !== null && cells.length < 64) {
    const text = stripTags(match[1] ?? '').trim();
    if (text.length > 0) cells.push(text);
    match = pattern.exec(rowXml);
  }
  return cells;
}

/** Une cellule ressemble-t-elle à un identifiant (e-mail ou login) ? */
function looksLikeLogin(cell: string): boolean {
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(cell)) return true;
  return cell.length >= 3 && cell.length <= 64 && /^[\w.-]+$/.test(cell) && /[a-z]/i.test(cell);
}

/**
 * Une cellule ressemble-t-elle à une valeur secrète ? Entropie + longueur, et
 * au moins un chiffre ou un symbole : un mot du dictionnaire (« Documentation »,
 * seul, majuscule incluse) a une entropie proche du seuil sans être un secret.
 */
function looksLikeSecret(cell: string): boolean {
  if (cell.length < CELL_SECRET_MIN_LENGTH || cell.length > 256) return false;
  if (/\s/.test(cell)) return false;
  if (!/[0-9]/.test(cell) && !/[^A-Za-z0-9]/.test(cell)) return false;
  return shannonEntropy(cell) >= CELL_SECRET_ENTROPY;
}

/** Les en-têtes annoncent-ils une colonne identifiant et une colonne secret ? */
function headersAnnounceCredentials(headerCells: string[]): boolean {
  const hasLogin = headerCells.some((cell) => LOGIN_HEADER.test(cell));
  const hasSecret = headerCells.some((cell) => SECRET_HEADER.test(cell));
  return hasLogin && hasSecret;
}

/** Le contenu des lignes trahit-il un tableau d'identifiants (voie 2) ? */
function rowsContainCredentialPairs(rows: string[][]): boolean {
  let pairs = 0;
  for (const cells of rows) {
    if (cells.some(looksLikeLogin) && cells.some(looksLikeSecret)) pairs += 1;
    if (pairs >= 2) return true;
  }
  return false;
}

/** Extrait les lignes d'une table et décide du candidat ; `undefined` si rien. */
function analyzeTable(structure: string, start: number): TableMatch | undefined {
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[][] = [];
  let match = rowPattern.exec(structure);
  while (match !== null && rows.length < 200) {
    const cells = cellsOfRow(match[1] ?? '');
    if (cells.length > 0) rows.push(cells);
    match = rowPattern.exec(structure);
  }
  if (rows.length < 2) return undefined;
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const announced = headersAnnounceCredentials(header);
  if (!announced && !rowsContainCredentialPairs(rows)) return undefined;
  const secretCells = collectSecretCells(header, body, announced);
  return { ruleId: RULE_CREDENTIAL_TABLE, start, end: start + structure.length, structure, secretCells };
}

/** Rassemble les valeurs probables de la colonne secret (pour `isKnownFake`). */
function collectSecretCells(header: string[], body: string[][], announced: boolean): string[] {
  if (!announced) {
    return body.flatMap((cells) => cells.filter(looksLikeSecret));
  }
  const secretColumn = header.findIndex((cell) => SECRET_HEADER.test(cell));
  if (secretColumn < 0) return [];
  return body.map((cells) => cells[secretColumn] ?? '').filter((cell) => cell.length > 0);
}

/**
 * Les entrées d'une liste portent-elles des paires « identifiant + secret » ?
 * Voie liste de la famille 11 : `<li>login: X — mdp: Y</li>` recopié en liste.
 */
function analyzeList(structure: string, start: number): TableMatch | undefined {
  const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match = itemPattern.exec(structure);
  let pairs = 0;
  const secretCells: string[] = [];
  while (match !== null && pairs < 200) {
    const text = stripTags(match[1] ?? '');
    const secretPart = /(?:mot de passe|password|mdp|pwd|secret|token)\s*[:=]\s*(\S{4,128})/i.exec(text);
    const loginPart = /(?:identifiant|login|user|compte|account)\s*[:=]\s*(\S{2,64})/i.exec(text);
    if (secretPart !== null && loginPart !== null) {
      pairs += 1;
      secretCells.push(secretPart[1] ?? '');
    }
    match = itemPattern.exec(structure);
  }
  if (pairs === 0) return undefined;
  return { ruleId: RULE_CREDENTIAL_LIST, start, end: start + structure.length, structure, secretCells };
}

/** Préfiltre : sans `table` ni liste, la structure n'est pas essayée (§14). */
function prefilterPasses(lowered: string): boolean {
  return lowered.includes('<table') || lowered.includes('<ul') || lowered.includes('<ol');
}

/** Énumère les tables candidates d'un texte XML storage ; ne lève jamais. */
export function findCredentialTables(text: string): TableMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  if (!prefilterPasses(text.toLowerCase())) return [];
  const out: TableMatch[] = [];
  try {
    collectStructures(text, /<table[^>]*>[\s\S]*?<\/table>/gi, analyzeTable, out);
    collectStructures(text, /<(?:ul|ol)[^>]*>[\s\S]*?<\/(?:ul|ol)>/gi, analyzeList, out);
  } catch {
    // Contenu hostile : structures déjà collectées conservées, le scan continue.
  }
  return out;
}

/** Parcours générique des structures bornées (tables puis listes). */
function collectStructures(
  text: string,
  pattern: RegExp,
  analyze: (structure: string, start: number) => TableMatch | undefined,
  out: TableMatch[],
): void {
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  let seen = 0;
  while (match !== null && seen < 64 && out.length < 64) {
    seen += 1;
    const structure = match[0] ?? '';
    if (structure.length <= MAX_STRUCTURE_CHARS) {
      const found = analyze(structure, match.index);
      if (found !== undefined) out.push(found);
    }
    if (structure.length === 0) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }
}

/** Toutes les valeurs de la colonne secret sont-elles des valeurs factices ? */
export function tableIsKnownFake(matched: TableMatch): boolean {
  if (matched.secretCells.length === 0) return false;
  return matched.secretCells.every((cell) => isDummyValue(cell));
}
