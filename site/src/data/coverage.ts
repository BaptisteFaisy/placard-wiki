// Couverture & angles morts (§14, §18 écran 6) — données SYNTHÉTIQUES typées
// `CoverageReport` du domaine. Règle d'honnêteté : une couverture partielle
// est déclarée, jamais masquée ; les DROITS MANQUANTS sont distingués de
// « pas de données ».

import type { CoverageReport } from '@placard-wiki/domain';

/** Rapport de couverture de la dernière passe (synthétique). */
export const COVERAGE: CoverageReport = {
  perGite: [
    { gite: 'corps-de-page', scanned: 4820, skipped: 0 },
    { gite: 'commentaires', scanned: 1533, skipped: 0 },
    { gite: 'pieces-jointes', scanned: 117, skipped: 9, reason: 'Binaire sans texte, taille dépassée ou conteneur chiffré — détail dans l’onglet Budget.' },
    { gite: 'historique-de-versions', scanned: 2140, skipped: 310, reason: 'Droits administrateur manquants sur l’espace ARCH — les versions existent, elles ne sont pas lisibles par l’app.' },
    { gite: 'modeles-de-page', scanned: 38, skipped: 0 },
    { gite: 'titres-et-etiquettes', scanned: 4820, skipped: 0 },
    { gite: 'description-espace', scanned: 3, skipped: 0 },
  ],
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
