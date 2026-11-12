/**
 * Les deux dépôts de couverture par gîte, côté SQL (§6, §14).
 *
 * Ils vivent dans un module à part : `forge-store.ts` est le seul fichier qui
 * parle à `@forge/sql`, et il était déjà proche de la limite de taille. Ici,
 * les requêtes sont **injectées** par l'appelant — ce module ne connaît que
 * le contrat des dépôts (`./ports`), jamais le SDK.
 *
 * Deux mesures, deux tables, une seule vérité par unité :
 *
 *  - `gite_coverage` : la mesure **par élément** (un commentaire lu, une
 *    pièce jointe lue), cumulée sur la journée ;
 *  - `gite_scan` : la mesure **par page** de la dernière passe — c'est elle
 *    qui donne le pourcentage de couverture et son dénominateur.
 */

import type { Gite } from '@placard-wiki/domain';

import { giteScanFromRow, giteScanToRow } from './serialize';
import type { ForgeStore, GiteCoverageLine, GiteScanRecord, GiteScanRow } from './ports';

/** DDL de la table technique de couverture par gîte (§6). */
export const GITE_COVERAGE_DDL = `CREATE TABLE IF NOT EXISTS gite_coverage (
  day TEXT,
  gite TEXT,
  scanned INTEGER,
  skipped INTEGER,
  reason TEXT
)`;

/**
 * DDL de la table `gite_scan` : l'état de lecture d'un gîte (§6) — lu, non
 * lu, inaccessible, avec la raison. Elle ne porte que des COMPTEURS et des
 * RAISONS (jamais de valeur, jamais de texte de page).
 *
 * Elle est déclarée ici, et non dans le DDL du domaine, pour deux raisons :
 * le schéma du §20 (onze tables) est celui du cahier et n'y touche pas ; et
 * l'état de couverture est une donnée de MESURE de l'app, pas une donnée
 * métier du domaine. Même principe que `app_secret` : une table technique,
 * dans le seul fichier qui parle à `@forge/sql`.
 *
 * Elle complète `gite_coverage` (mesure par élément, cumulée sur la journée)
 * : ici la mesure est par PAGE, pour la dernière passe — c'est le
 * dénominateur du pourcentage de couverture.
 */
export const GITE_SCAN_DDL = `CREATE TABLE IF NOT EXISTS gite_scan (
  gite TEXT,
  pages_read INTEGER,
  pages_unread INTEGER,
  pages_inaccessible INTEGER,
  reason TEXT,
  pass_at TEXT
)`;

/** Lecture paramétrée, injectée par le store SQL. */
export type SelectFn = <T>(query: string, params: unknown[]) => Promise<T[]>;

/**
 * Mutation paramétrée, injectée par le store SQL.
 *
 * Le résultat est rendu tel quel par le store (le nombre de lignes touchées
 * sert au registre multi-surfaces) ; les dépôts de couverture n'en ont pas
 * besoin — ils vérifient leur état par une relecture.
 */
export type MutateFn = (query: string, params: unknown[]) => Promise<unknown>;

/** Ligne brute de la table technique `gite_coverage`. */
interface GiteCoverageRow {
  day: string;
  gite: string;
  scanned: number;
  skipped: number;
  reason: string | null;
}

/**
 * La table `gite_coverage` : mesure fine, par élément, cumulée sur la
 * journée. Un gîte inconnu reste tel quel : il est déclaré, pas deviné.
 */
export function createGiteCoverageRepo(
  select: SelectFn,
  mutate: MutateFn,
): ForgeStore['giteCoverage'] {
  const toGite = (gite: string): Gite => gite as Gite;
  return {
    async get(day: string, gite: string) {
      const rows = await select<GiteCoverageRow>('SELECT * FROM gite_coverage WHERE day = ? AND gite = ? LIMIT 1', [day, gite]);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        gite: toGite(row.gite),
        scanned: Number(row.scanned),
        skipped: Number(row.skipped),
        ...(row.reason === null ? {} : { reason: row.reason }),
      };
    },
    async put(line: GiteCoverageLine, day: string) {
      await mutate('DELETE FROM gite_coverage WHERE day = ? AND gite = ?', [day, line.gite]);
      await mutate(
        'INSERT INTO gite_coverage (day, gite, scanned, skipped, reason) VALUES (?,?,?,?,?)',
        [day, line.gite, line.scanned, line.skipped, line.reason ?? null],
      );
    },
    async list(day: string) {
      const rows = await select<GiteCoverageRow>('SELECT * FROM gite_coverage WHERE day = ? ORDER BY gite ASC', [day]);
      return rows.map((row) => ({
        gite: toGite(row.gite),
        scanned: Number(row.scanned),
        skipped: Number(row.skipped),
        ...(row.reason === null ? {} : { reason: row.reason }),
      }));
    },
  };
}

/** La table `gite_scan` : mesure par page de la dernière passe (§6, §14). */
export function createGiteScansRepo(
  select: SelectFn,
  mutate: MutateFn,
): ForgeStore['giteScans'] {
  return {
    async put(record: GiteScanRecord) {
      const row = giteScanToRow(record);
      await mutate('DELETE FROM gite_scan WHERE gite = ?', [row.gite]);
      await mutate(
        'INSERT INTO gite_scan (gite, pages_read, pages_unread, pages_inaccessible, reason, pass_at) VALUES (?,?,?,?,?,?)',
        [row.gite, row.pages_read, row.pages_unread, row.pages_inaccessible, row.reason, row.pass_at],
      );
    },
    async list() {
      const rows = await select<GiteScanRow>('SELECT * FROM gite_scan', []);
      return rows.map(giteScanFromRow);
    },
  };
}
