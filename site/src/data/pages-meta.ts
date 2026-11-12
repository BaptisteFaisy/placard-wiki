// Métadonnées de pages pour la propagation (§11) — données SYNTHÉTIQUES.
// `propagationTimeline` et `redactionOrder` (paquet `@placard-wiki/propagation`,
// importable navigateur : aucune dépendance node:crypto) tournent sur ces
// données : le VRAI calcul, jamais une réimplémentation.

import type { Foyer } from '@placard-wiki/domain';
import type { WikiPageMeta } from '@placard-wiki/propagation';
import { FOYERS, applied, baseTerm, buildFoyer, loc } from './demo.js';

/** Métadonnées des pages de la démo — créées entre février et octobre. */
export const PAGES_META: readonly WikiPageMeta[] = [
  { pageId: 'T-1', title: 'Modèle : runbook service', createdAt: '2026-02-20T09:00:00Z' },
  { pageId: 'P-100', title: 'Runbook — déploiement staging', createdAt: '2026-03-05T10:00:00Z', templateId: 'T-1' },
  { pageId: 'P-110', title: 'Comptes de démo de l’application', createdAt: '2026-08-30T09:00:00Z' },
  { pageId: 'P-120', title: 'Accès à la base staging', createdAt: '2026-09-02T08:00:00Z' },
  { pageId: 'P-130', title: 'Onboarding équipe produit', createdAt: '2026-04-12T08:00:00Z' },
  { pageId: 'P-140', title: 'Accès au compte de démo (partage externe)', createdAt: '2026-10-05T15:00:00Z' },
  { pageId: 'P-150', title: 'RIB des fournisseurs (restreint)', createdAt: '2026-07-11T11:00:00Z' },
  { pageId: 'P-200', title: 'Intégration Slack du bot interne', createdAt: '2026-05-02T09:00:00Z' },
  { pageId: 'P-210', title: 'Journal des incidents — mars', createdAt: '2026-03-14T14:00:00Z' },
  { pageId: 'P-300', title: 'Procédure legacy FTP (archivée)', createdAt: '2026-04-20T09:00:00Z' },
  // Étude de cas PROP-1 (§11) : « la même empreinte peut vivre dans six
  // pages, deux commentaires, une pièce jointe et un modèle ».
  { pageId: 'P-400', title: 'Runbook réseau — salle baie 2', createdAt: '2026-03-02T09:00:00Z' },
  { pageId: 'P-401', title: 'Runbook réseau (copie interne)', createdAt: '2026-04-11T09:00:00Z', duplicatedFromPageId: 'P-400' },
  { pageId: 'T-2', title: 'Modèle : runbook réseau', createdAt: '2026-05-20T09:00:00Z' },
  { pageId: 'P-402', title: 'Copie de Runbook réseau — site Lyon', createdAt: '2026-06-18T09:00:00Z' },
  { pageId: 'P-403', title: 'Runbook réseau — site Nantes', createdAt: '2026-08-14T09:00:00Z', templateId: 'T-2' },
  { pageId: 'P-404', title: 'Runbook réseau — site Lille', createdAt: '2026-08-18T09:00:00Z', templateId: 'T-2' },
  { pageId: 'P-405', title: 'Notes d’astreinte réseau', createdAt: '2026-10-01T09:00:00Z' },
];

/** Titres des pages de l'étude de cas PROP-1 (registre hors périmètre). */
export const PROP_TITLES: Record<string, string> = Object.fromEntries(
  PAGES_META.filter((p) => p.pageId.startsWith('P-4') || p.pageId === 'T-2').map((p) => [p.pageId, p.title]),
);

/**
 * Foyer synthétique PROP-1 : une empreinte, dix emplacements (modèle, six
 * pages, commentaire, pièce jointe, historique) — l'exemple du §11. Marqué
 * SYNTHÉTIQUE comme tout le site ; hors registre pour ne pas décaler
 * l'équivalence bâtiment/registre existante.
 */
export const PROP_FOYER: Foyer = buildFoyer(
  {
    id: 'PROP-1',
    fingerprint: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
    family: 'platform-token',
    state: 'open',
    firstSeenAt: '2026-03-02T09:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [
      loc('LP-01', 'PROP-1', 'template', 'body', 'T-2', 'xoxb-…(60)', 'present'),
      loc('LP-02', 'PROP-1', 'page', 'body', 'P-400', 'xoxb-…(60)', 'present'),
      loc('LP-03', 'PROP-1', 'comment', 'body', 'P-400', 'xoxb-…(60)', 'present'),
      loc('LP-04', 'PROP-1', 'page', 'body', 'P-401', 'xoxb-…(60)', 'present'),
      loc('LP-05', 'PROP-1', 'attachment', 'filename', 'P-401', 'bot/.env (2 Ko)', 'present'),
      loc('LP-06', 'PROP-1', 'page', 'body', 'P-402', 'xoxb-…(60)', 'present'),
      loc('LP-07', 'PROP-1', 'page', 'body', 'P-403', 'xoxb-…(60)', 'present'),
      loc('LP-08', 'PROP-1', 'page', 'body', 'P-404', 'xoxb-…(60)', 'present'),
      loc('LP-09', 'PROP-1', 'page', 'body', 'P-405', 'xoxb-…(60)', 'present'),
      loc('LP-10', 'PROP-1', 'version', 'body', 'P-400', 'xoxb-…(60)', 'present', 2),
    ],
    primaryPageId: 'P-400',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('platform-token'),
    applied({ id: 'current-version', points: 20, evidence: '8 emplacements présents dans la version courante.' }),
    applied({ id: 'history-present', points: 15, evidence: 'version 2 de P-400 encore lisible.' }),
    applied({ id: 'readers-100', points: 10, evidence: 'fourchette haute 420 lecteurs.' }),
    applied({ id: 'propagation-3', points: 10, evidence: '10 emplacements sur 8 conteneurs distincts.' }),
    applied({ id: 'rotation-unknown-90d', points: 10, evidence: 'première observation le 2026-03-02, aucune attestation.' }),
  ],
);

/** Exposition de démonstration par page, pour l'ordre du lot (§11). */
export const PROP_EXPOSURE: ReadonlyMap<string, number> = new Map([
  ['P-400', 62],
  ['P-401', 40],
  ['T-2', 55],
  ['P-402', 48],
  ['P-403', 30],
  ['P-404', 28],
  ['P-405', 12],
]);

/** Foyers accessibles à l'écran propagation : le registre F-1 + l'étude de cas. */
export const PROPAGATION_FOYERS: ReadonlyArray<{ id: string; foyer: Foyer }> = [
  { id: 'F-1', foyer: FOYERS['F-1']! },
  { id: 'PROP-1', foyer: PROP_FOYER },
];
