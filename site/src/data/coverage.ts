// Couverture & angles morts (§14, §18 écran 6) — données SYNTHÉTIQUES typées
// `CoverageReport` du domaine. Règle d'honnêteté : une couverture partielle
// est déclarée, jamais masquée ; les DROITS MANQUANTS sont distingués de
// « pas de données ».

import type { CoverageReport } from '@placard-wiki/domain';

/** L'état d'un gîte, tel que la passe l'a mesuré — jamais déduit. */
export type GiteCoverageState = 'read' | 'unread' | 'inaccessible' | 'not-attempted';

/** Le détail mesuré d'un gîte : lu, non lu, inaccessible. */
export interface GiteCoverageDetail {
  readonly pagesRead: number;
  readonly pagesUnread: number;
  readonly pagesInaccessible: number;
  readonly state: GiteCoverageState;
}

/** Une ligne de couverture : la forme du domaine + la mesure. */
export type GiteCoverageRow = CoverageReport['perGite'][number] & GiteCoverageDetail;

/**
 * Le rapport de couverture affiché : la forme du domaine, plus le pourcentage
 * et SA MÉTHODE. `coveragePercent` est `null` quand la couverture est
 * INDÉTERMINÉE (aucune passe) — jamais 0 %, qui dirait « rien trouvé » alors
 * que rien n'a été regardé.
 */
export interface CoverageReportAffichee extends CoverageReport {
  readonly perGite: readonly GiteCoverageRow[];
  readonly coveragePercent: number | null;
  readonly gitesCovered: number;
  readonly gitesTotal: number;
  readonly method: string;
  readonly pagesTargeted?: number;
  readonly pagesRead?: number;
}

/** Le rapport de couverture de la dernière passe (synthétique, mode snapshot). */
export const COVERAGE: CoverageReportAffichee = {
  perGite: [
    { gite: 'corps-de-page', scanned: 4820, skipped: 0, pagesRead: 4820, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
    { gite: 'commentaires', scanned: 1533, skipped: 0, pagesRead: 1533, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
    { gite: 'pieces-jointes', scanned: 117, skipped: 9, pagesRead: 117, pagesUnread: 9, pagesInaccessible: 0, state: 'unread', reason: 'Binaire sans texte, taille dépassée ou conteneur chiffré — détail dans l’onglet Budget.' },
    { gite: 'historique-de-versions', scanned: 2140, skipped: 310, pagesRead: 2140, pagesUnread: 310, pagesInaccessible: 0, state: 'unread', reason: 'Droits administrateur manquants sur l’espace ARCH — les versions existent, elles ne sont pas lisibles par l’app.' },
    { gite: 'modeles-de-page', scanned: 38, skipped: 0, pagesRead: 38, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
    { gite: 'titres-et-etiquettes', scanned: 4820, skipped: 0, pagesRead: 4820, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
    { gite: 'description-espace', scanned: 3, skipped: 0, pagesRead: 3, pagesUnread: 0, pagesInaccessible: 0, state: 'read' },
  ],
  coveragePercent: 39.9,
  gitesCovered: 7,
  gitesTotal: 7,
  pagesTargeted: 4820,
  pagesRead: 13471,
  method:
    'Couverture = (pages lues, tous gîtes) ÷ (gîtes visés × pages visées) = 13 471 ÷ (7 × 4 820) = 39,9 %. '
    + '7 gîte(s) couvert(s) sur 7 : Corps de page (4820/4820 pages lues), Commentaires (1533/1533 pages lues), '
    + 'Pièces jointes (117/126 pages lues), Historique de versions (2140/2450 pages lues), '
    + 'Modèles de page (38/38 pages lues), Titres et étiquettes (4820/4820 pages lues), '
    + 'Description d’espace, page d’accueil (3/3 pages lues).',
  blindSpots: [
    'Whiteboards Confluence (22 dans la démo) : inaccessibles depuis Forge — non balayés, déclarés angles morts (§29 PW-29).',
    'Bases Confluence (4 tables) : non balayées — hors périmètre de l’installation, déclaré.',
    'Secrets dans les captures d’écran : non détectés par un balayage texte (§24) — OCR prévu après le hackathon (PW-30).',
    'Surface IA : hypothèse conservatrice uniquement (§13) — l’index Rovo réel ne peut pas encore être interrogé.',
  ],
  missingRights: [
    'Espace ARCH — historique de versions : droit « purger/lire les versions » manquant → 310 versions non balayées. Ce n’est pas « pas de données » : les données existent, l’app ne peut pas les lire.',
    'Espace OPS — partage externe : droit « voir les liens de partage » manquant → l’état de partage de 3 pages est présumé par défaut, la fourchette de lecteurs est élargie en conséquence (§8).',
  ],
  lastPassAt: '2026-11-10T06:00:00Z',
};

/** « Pas de données » ≠ « droits manquants » — la distinction, affichée. */
export const NO_DATA_VS_NO_RIGHT = {
  fr: '« Pas de données » signifie : balayé, rien trouvé. « Droits manquants » signifie : jamais lu — le doute reste, et il est déclaré. Les deux colonnes ne se ressemblent pas et ne se confondent pas.',
  en: '“No data” means: scanned, nothing found. “Missing rights” means: never read — the doubt remains, and it is declared. The two never look alike and are never merged.',
};

/** Traductions EN des deux angles morts de base du paquet exposure (§13, §24). */
export const BASE_BLIND_SPOT_EN: Record<string, string> = {
  'Secrets dans des captures d’écran : non détectés par un balayage texte (§24) — angle mort déclaré, pas ignoré en silence.':
    'Secrets in screenshots: not detected by a text scan (§24) — a declared blind spot, never silently ignored.',
  'Surface IA : hypothèse conservatrice uniquement (§13), l’index Rovo réel ne peut pas encore être interrogé.':
    'AI surface: conservative hypothesis only (§13), the real Rovo index cannot be queried yet.',
};

/** Traductions EN des angles morts déclarés pour les espaces de la démo. */
export const SPACE_BLIND_SPOT_EN: readonly string[] = [
  'Confluence whiteboards (22 in the demo): unreachable from Forge — not scanned, declared blind spots (PW-29).',
  'Confluence databases (4 tables): not scanned — out of the installation scope, declared.',
  'Secrets in screenshots: not detected by a text scan (§24) — OCR planned after the hackathon (PW-30).',
  'AI surface: conservative hypothesis only (§13) — the real Rovo index cannot be queried yet.',
];

/** Traductions EN des droits manquants déclarés (aligné sur missingRights). */
export const MISSING_RIGHTS_EN: readonly string[] = [
  'ARCH space — version history: missing “read/purge versions” right → 310 versions not scanned. This is NOT “no data”: the data exists, the app cannot read it.',
  'OPS space — external sharing: missing “view sharing links” right → the sharing state of 3 pages is presumed default, and the reader range is widened accordingly (§8).',
];
