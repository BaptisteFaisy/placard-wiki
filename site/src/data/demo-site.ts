// Partie « site » des données de démonstration : registre, bâtiment, budget,
// certificat. Tout est synthétique — aucune valeur brute, aucun réseau.

import type { BuildingModel, Certificate, Foyer, RegistryRow, ScanBudget } from '@placard-wiki/domain';
import { EXPOSURES, FOYERS, OWNERS } from './demo.js';

/** Titres synthétiques des pages, pour le registre et le bâtiment. */
export const TITLES: Record<string, string> = {
  'P-100': 'Runbook — déploiement staging',
  'P-110': 'Comptes de démo de l’application',
  'P-120': 'Accès à la base staging',
  'P-140': 'Accès au compte de démo (partage externe)',
  'P-150': 'RIB des fournisseurs (restreint)',
  'P-130': 'Onboarding équipe produit',
  'P-200': 'Intégration Slack du bot interne',
  'P-210': 'Journal des incidents — mars',
  'P-300': 'Procédure legacy FTP (archivée)',
  'T-1': 'Modèle : runbook service',
};

/** Bâtit une ligne du registre à partir d'un foyer (§10). */
function rowFor(f: Foyer): RegistryRow {
  const primary = f.locations.find((l) => l.pageId === f.primaryPageId) ?? f.locations[0];
  const pageId = primary?.pageId ?? '';
  const exposure = EXPOSURES[pageId];
  const owner = OWNERS[pageId];
  const inCur = f.locations.some((l) => l.status === 'present' && l.containerType !== 'version');
  const inHist = f.locations.some((l) => l.containerType === 'version' && l.status !== 'redacted');
  return {
    foyerId: f.id,
    family: f.family,
    maskedPreview: primary?.maskedPreview ?? '',
    score: f.score,
    state: f.state,
    spaceKey: f.spaceKey ?? '',
    pageTitle: primary ? (primary.field === 'title' ? 'Titre — ' + primary.maskedPreview : TITLES[pageId] ?? pageId) : pageId,
    pageId,
    locationCount: f.locations.length,
    inCurrentVersion: inCur,
    inHistory: inHist,
    readersLow: exposure?.readers.low ?? 0,
    readersHigh: exposure?.readers.high ?? 0,
    sharing: exposure?.sharing ?? 'space-default',
    aiSurface: exposure?.aiSurface.presumedIndexed ?? false,
    ownerRef: owner?.ownerRef,
    ownerMethod: owner?.method,
    lastSeenAt: f.lastSeenAt,
  };
}

/** Le registre : exactement la même information que le bâtiment. */
export const REGISTRY_ROWS: RegistryRow[] = Object.values(FOYERS).map(rowFor);

/** Le bâtiment (§10) : ailes = espaces, étages = profondeur, pièces = pages. */
export const BUILDING: BuildingModel = {
  wings: [
    {
      spaceKey: 'DEMO',
      floors: [
        {
          depth: 0,
          rooms: [{ pageId: 'P-HOME', title: 'Démo — accueil', audience: 500, locked: false, openWindow: false, maxDanger: 0, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 0 }],
        },
        {
          depth: 1,
          rooms: [
            { pageId: 'T-1', title: 'Modèle : runbook service', audience: 300, locked: false, openWindow: false, maxDanger: 100, cellarOpen: false, poster: true, walled: false, sealCount: 0, ribbonCount: 0 },
            { pageId: 'P-100', title: 'Runbook — déploiement staging', audience: 900, locked: false, openWindow: false, maxDanger: 100, cellarOpen: true, poster: false, walled: false, sealCount: 0, ribbonCount: 0 },
            { pageId: 'P-130', title: 'Onboarding équipe produit', audience: 140, locked: false, openWindow: false, maxDanger: 0, cellarOpen: false, poster: false, walled: true, sealCount: 0, ribbonCount: 0 },
          ],
        },
        {
          depth: 2,
          rooms: [
            { pageId: 'P-110', title: 'Comptes de démo', audience: 180, locked: false, openWindow: false, maxDanger: 85, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 0 },
            { pageId: 'P-120', title: 'Accès base staging', audience: 90, locked: false, openWindow: false, maxDanger: 80, cellarOpen: true, poster: false, walled: false, sealCount: 0, ribbonCount: 0 },
            { pageId: 'P-140', title: 'Accès démo (partage externe)', audience: 1200, locked: false, openWindow: true, maxDanger: 95, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 0 },
            { pageId: 'P-150', title: 'RIB fournisseurs', audience: 12, locked: true, openWindow: false, maxDanger: 55, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 0 },
          ],
        },
      ],
      drafts: [{ fromPageId: 'T-1', toPageId: 'P-100', fingerprint: FOYERS['F-1']?.fingerprint ?? '' }],
    },
    {
      spaceKey: 'OPS',
      floors: [
        {
          depth: 1,
          rooms: [
            { pageId: 'P-200', title: 'Intégration Slack du bot', audience: 60, locked: false, openWindow: false, maxDanger: 55, cellarOpen: false, poster: false, walled: false, sealCount: 1, ribbonCount: 0 },
            { pageId: 'P-210', title: 'Journal des incidents — mars', audience: 40, locked: false, openWindow: false, maxDanger: 25, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 1 },
          ],
        },
      ],
      drafts: [],
    },
    {
      spaceKey: 'ARCH',
      floors: [
        {
          depth: 1,
          rooms: [{ pageId: 'P-300', title: 'Procédure legacy FTP (archivée)', audience: 2, locked: true, openWindow: false, maxDanger: 45, cellarOpen: false, poster: false, walled: false, sealCount: 0, ribbonCount: 0 }],
        },
      ],
      drafts: [],
    },
  ],
};

/** Budget de balayage affiché (§14) : couverture partielle déclarée. */
export const BUDGET: ScanBudget = {
  day: '2026-11-10',
  pagesScanned: 4820,
  attachmentsRead: 117,
  attachmentsSkipped: 9,
  llmCalls: 63,
  tokens: 214500,
  costEstimate: 1.87,
  lastPassMs: 268000,
  skipped: [
    { kind: 'Captures d’écran (.png, .jpg)', reason: 'Binaire sans texte extractible — secret possible, non détecté → angle mort déclaré', count: 4 },
    { kind: 'Archive .zip (> 40 Mo)', reason: 'Taille dépassée — non lue, comptée dans la couverture', count: 1 },
    { kind: 'Coffre .kdbx', reason: 'Conteneur chiffré — texte non extractible sans mot de passe', count: 2 },
    { kind: 'Exports .xlsx', reason: 'Lu partiellement (chaînes partagées seulement)', count: 2 },
  ],
  coverageNote: 'Couverture partielle : 9 pièces jointes non lues sur 126. Les whiteboards et bases Confluence ne sont pas accessibles depuis Forge → déclarés angles morts.',
};

/** Angles morts déclarés (§24), jamais ignorés en silence. */
export const COVERAGE_BLIND_SPOTS: string[] = [
  'Whiteboards : inaccessibles depuis Forge — non balayés.',
  'Secrets dans les captures d’écran : non détectés (binaire sans texte).',
  'Bases Confluence externes : non balayées (hors périmètre de l’installation).',
  'Pièce jointe de 40 Mo : non lue (taille).',
];

/** Certificat de la démo (§9, §18 écran 8) : jamais de valeur brute. */
export const CERTIFICATE: Certificate = {
  id: 'CERT-DEMO-1',
  scope: 'Espaces DEMO, OPS, ARCH (démo)',
  issuedAt: '2026-11-10T09:45:00Z',
  open: 5,
  rotated: 2,
  redacted: 7,
  purged: 2,
  residualExposure: '2 foyers encore lisibles dans l’historique (P-100 v3 ; P-120 v2) — fourchettes 340–900 et 25–90 lecteurs.',
  blindSpots: COVERAGE_BLIND_SPOTS,
  contentHash: 'sha256:9f2c4b7a1e5d8f03a6c9e2b4d6f0a8c3e5a1b7d9f2c4e6a8b0d1f3e5a7c9b2d4f',
};