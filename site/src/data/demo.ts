// Données de démonstration 100 % synthétiques (§15, §27) : un faux secret de
// chaque famille, planté dans chaque gîte, marqué « SYNTHÉTIQUE — démo ».
// Aucune valeur brute : uniquement des aperçus masqués (`AKIA…(20)`), jamais
// la valeur réelle, jamais un appel réseau, jamais un stockage.

import {
  BASE_SCORE_BY_FAMILY,
  SCORE_TERM_BY_ID,
  REMEDIATION_COST_HOURS,
  computeDanger,
  giteOf,
} from '@placard-wiki/domain';
import type {
  AppliedScoreTerm,
  ContainerType,
  ContentField,
  Foyer,
  FoyerLocation,
  FoyerState,
  OwnerResolution,
  PageExposure,
  PurgeRequest,
  RitualStepState,
  ScoreTermId,
  SharingState,
  WikiFamily,
} from '@placard-wiki/domain';

/** Un terme du score appliqué à un foyer, avec sa preuve concrète. */
interface TermSeed {
  id: ScoreTermId;
  points: number;
  evidence?: string;
}

/** Bâtit un terme appliqué : libellé et méthode repris du domaine (§8). */
function applied(seed: TermSeed): AppliedScoreTerm {
  const spec = SCORE_TERM_BY_ID.get(seed.id);
  if (!spec) throw new Error(`Terme inconnu : ${String(seed.id)}`);
  return {
    id: seed.id,
    points: seed.points,
    label: spec.fr,
    method: spec.methodFr,
    evidence: seed.evidence,
  };
}

/** Construit un emplacement de foyer à partir de son conteneur et de son champ. */
function loc(
  id: string,
  foyerId: string,
  containerType: ContainerType,
  field: ContentField,
  pageId: string,
  maskedPreview: string,
  status: FoyerLocation['status'],
  versionNumber?: number,
): FoyerLocation {
  return {
    id,
    foyerId,
    containerType,
    containerAri: `ari:cloud:confluence::demo/${pageId}`,
    pageId,
    versionNumber,
    field,
    maskedPreview,
    detectedAt: '2026-11-10T08:12:00Z',
    status,
    gite: giteOf(containerType, field),
  };
}

/** Terme de base par famille, transformé en base applicative du score. */
function baseTerm(family: WikiFamily): AppliedScoreTerm {
  const points = BASE_SCORE_BY_FAMILY[family];
  return { id: 'base-family', points, label: 'Base par famille', method: '20 – 55 selon la famille (BASE_SCORE_BY_FAMILY).', evidence: `${points} pts` };
}

/** Assemble un foyer : base + termes, score borné par le domaine. */
function buildFoyer(
  f: Omit<Foyer, 'baseScore' | 'score' | 'scoreTerms'>,
  terms: AppliedScoreTerm[],
): Foyer {
  const base = BASE_SCORE_BY_FAMILY[f.family];
  return { ...f, baseScore: base, score: computeDanger(terms), scoreTerms: terms };
}

// ---------------------------------------------------------------------------
// Espaces (ailes du bâtiment)
// ---------------------------------------------------------------------------

export const SPACES: ReadonlyArray<{ key: string; fr: string; en: string }> = [
  { key: 'DEMO', fr: 'Démo', en: 'Demo' },
  { key: 'OPS', fr: 'Opérations', en: 'Operations' },
  { key: 'ARCH', fr: 'Archives', en: 'Archives' },
];

// ---------------------------------------------------------------------------
// Foyers — une empreinte, N emplacements (modèle traité en premier, §11)
// ---------------------------------------------------------------------------

/** Page d'exposition par défaut : héritage de l'espace, méthode affichée. */
const expo = (
  pageId: string,
  spaceKey: string,
  low: number,
  high: number,
  sharing: SharingState,
  restrictions: PageExposure['restrictions'],
  presumedIndexed: boolean,
): PageExposure => ({
  pageId,
  spaceKey,
  readers: {
    low,
    high,
    method: 'Fourchette : permissions de l’espace + restrictions de la page + état du partage. Les groupes imbriqués ne sont pas toujours résolus → fourchette, jamais un nombre exact.',
    caveats: ['groupes imbriqués non résolus', 'pas de décompte des comptes inactifs'],
  },
  sharing,
  restrictions,
  aiSurface: {
    presumedIndexed,
    hypothesis: true,
    method: 'Présumée indexée si la page est lisible par Rovo — hypothèse conservatrice tant que l’index ne peut pas être interrogé (§13).',
  },
  computedAt: '2026-11-10T08:12:00Z',
});

/** AWS fictive : runbook + 2 commentaires + version 3 + modèle (propagation). */
const F1: Foyer = buildFoyer(
  {
    id: 'F-1',
    fingerprint: '7f1a9c3e2b4d5f6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    family: 'cloud-key',
    state: 'open',
    firstSeenAt: '2026-06-18T10:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [
      loc('L-101', 'F-1', 'page', 'body', 'P-100', 'AKIA…(20)', 'present'),
      loc('L-102', 'F-1', 'comment', 'body', 'P-100', 'AKIA…(20)', 'present'),
      loc('L-103', 'F-1', 'version', 'body', 'P-100', 'AKIA…(20)', 'present', 3),
      loc('L-104', 'F-1', 'template', 'body', 'T-1', 'AKIA…(20)', 'present'),
    ],
    primaryPageId: 'P-100',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('cloud-key'),
    applied({ id: 'current-version', points: 20, evidence: 'emplacements `present` dans la version actuelle (3).' }),
    applied({ id: 'history-present', points: 15, evidence: 'version 3 encore lisible.' }),
    applied({ id: 'readers-100', points: 10, evidence: 'fourchette haute 900 lecteurs.' }),
    applied({ id: 'ai-surface', points: 10, evidence: 'page lisible par Rovo (hypothèse).' }),
    applied({ id: 'rotation-unknown-90d', points: 10, evidence: 'première observation le 2026-06-18, aucune attestation.' }),
    applied({ id: 'propagation-3', points: 10, evidence: '4 emplacements : page, 2 commentaires, modèle.' }),
  ],
);

/** Tableau d'identifiants (motif Confluence par excellence). */
const F2: Foyer = buildFoyer(
  {
    id: 'F-2',
    fingerprint: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    family: 'credential-table',
    state: 'rotation-attested',
    firstSeenAt: '2026-08-30T09:00:00Z',
    lastSeenAt: '2026-11-09T16:40:00Z',
    rotatedAt: '2026-11-09T17:02:00Z',
    rotationEvidenceRef: 'JIRA SEC-411 (fournisseur: base interne)',
    locations: [loc('L-201', 'F-2', 'page', 'body', 'P-110', 'appli=demo / mdp=…(18)', 'present')],
    primaryPageId: 'P-110',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('credential-table'),
    applied({ id: 'current-version', points: 20 }),
    applied({ id: 'readers-10', points: 5, evidence: 'fourchette haute 180 lecteurs.' }),
    applied({ id: 'ai-surface', points: 10 }),
  ],
);

/** Chaîne de connexion, page caviardée mais historique encore lisible. */
const F3: Foyer = buildFoyer(
  {
    id: 'F-3',
    fingerprint: '11aa22bb33cc44dd55ee66ff77889900aabbccddeeff00112233445566778899',
    family: 'connection-string',
    state: 'purge-requested',
    firstSeenAt: '2026-09-02T08:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [
      loc('L-301', 'F-3', 'page', 'body', 'P-120', 'postgres://svc…(26)', 'redacted'),
      loc('L-302', 'F-3', 'version', 'body', 'P-120', 'postgres://svc…(26)', 'present', 2),
    ],
    primaryPageId: 'P-120',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('connection-string'),
    applied({ id: 'history-present', points: 15, evidence: 'version 2 encore lisible.' }),
    applied({ id: 'readers-10', points: 5, evidence: 'fourchette haute 90 lecteurs.' }),
    applied({ id: 'ai-surface', points: 10 }),
  ],
);

/** IBAN factice dans une page restreinte. */
const F4: Foyer = buildFoyer(
  {
    id: 'F-4',
    fingerprint: 'abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca',
    family: 'bank-data',
    state: 'open',
    firstSeenAt: '2026-07-11T11:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [loc('L-401', 'F-4', 'page', 'body', 'P-150', 'FR76 3000…(27)', 'present')],
    primaryPageId: 'P-150',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('bank-data'),
    applied({ id: 'current-version', points: 20 }),
    applied({ id: 'readers-10', points: 5, evidence: 'fourchette haute 12 lecteurs.' }),
    applied({ id: 'archived-restricted', points: -15, evidence: 'page restreinte à 2 personnes.' }),
  ],
);

/** Faux positif écarté (ruban) : valeur factice documentée par AWS. */
const F5: Foyer = buildFoyer(
  {
    id: 'F-5',
    fingerprint: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    family: 'cloud-key',
    state: 'dismissed',
    dismissedReason: 'Valeur factice documentée par AWS (`AKIAIOSFODNN7EXAMPLE`) : exemple de documentation, jamais une vraie clé.',
    dismissedReviewAt: '2026-11-02T09:00:00Z',
    firstSeenAt: '2026-03-14T14:00:00Z',
    lastSeenAt: '2026-11-02T09:00:00Z',
    locations: [loc('L-501', 'F-5', 'page', 'body', 'P-210', 'AKIAIOSFODNN7EXAMPLE', 'present')],
    primaryPageId: 'P-210',
    spaceKey: 'OPS',
  },
  [
    baseTerm('cloud-key'),
    applied({ id: 'current-version', points: 20 }),
    applied({ id: 'known-fake', points: -20, evidence: 'empreinte = AKIAIOSFODNN7EXAMPLE (fausse valeur connue).' }),
    applied({ id: 'test-content', points: -30, evidence: 'journal d’incident : exemple repris de la documentation AWS.' }),
  ],
);

/** Jeton platform scellé : rotation attestée, caviardé, purge vérifiée. */
const F6: Foyer = buildFoyer(
  {
    id: 'F-6',
    fingerprint: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    family: 'platform-token',
    state: 'sealed',
    firstSeenAt: '2026-05-02T09:00:00Z',
    lastSeenAt: '2026-11-08T10:00:00Z',
    rotatedAt: '2026-11-06T12:15:00Z',
    rotationEvidenceRef: 'JIRA SEC-390 + écran de révocation Slack',
    locations: [
      loc('L-601', 'F-6', 'page', 'body', 'P-200', 'xoxb-…(60)', 'redacted', undefined),
      loc('L-602', 'F-6', 'version', 'body', 'P-200', 'xoxb-…(60)', 'redacted', 4),
    ],
    primaryPageId: 'P-200',
    spaceKey: 'OPS',
  },
  [baseTerm('platform-token'), applied({ id: 'readers-10', points: 5, evidence: 'fourchette haute 60 lecteurs.' })],
);

/** Mot de passe en clair dans le titre d'une page partagée publiquement. */
const F7: Foyer = buildFoyer(
  {
    id: 'F-7',
    fingerprint: 'f0e0d0c0b0a0908070605040302010f0e0d0c0b0a09080706050403020100000',
    family: 'plaintext-password',
    state: 'open',
    firstSeenAt: '2026-10-05T15:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [loc('L-701', 'F-7', 'page', 'title', 'P-140', 'mdp: …(12)', 'present')],
    primaryPageId: 'P-140',
    spaceKey: 'DEMO',
  },
  [
    baseTerm('plaintext-password'),
    applied({ id: 'current-version', points: 20 }),
    applied({ id: 'public-share', points: 10, evidence: 'partage « anyone with the link ». ' }),
    applied({ id: 'readers-1000', points: 15, evidence: 'fourchette haute 4 800 lecteurs.' }),
  ],
);

/** Pièce jointe sensible (.env de 40 Mo) non lue — angle mort déclaré. */
const F8: Foyer = buildFoyer(
  {
    id: 'F-8',
    fingerprint: 'aaaaaaaaaaaaaaaa1111222233334444555566667777888899990000aaaabbbb',
    family: 'risky-file',
    state: 'open',
    firstSeenAt: '2026-04-20T09:00:00Z',
    lastSeenAt: '2026-11-10T08:12:00Z',
    locations: [loc('L-801', 'F-8', 'attachment', 'filename', 'P-300', 'legacy/.env (40 Mo)', 'present')],
    primaryPageId: 'P-300',
    spaceKey: 'ARCH',
  },
  [
    baseTerm('risky-file'),
    applied({ id: 'current-version', points: 20 }),
    applied({ id: 'archived-restricted', points: -15, evidence: 'page archivée, 2 lecteurs.' }),
  ],
);

/** Tous les foyers, par identifiant. */
export const FOYERS: Record<string, Foyer> = Object.fromEntries(
  [F1, F2, F3, F4, F5, F6, F7, F8].map((f) => [f.id, f]),
);

/** Expositions par page de démonstration. */
export const EXPOSURES: Record<string, PageExposure> = {
  'P-100': expo('P-100', 'DEMO', 340, 900, 'space-default', [], true),
  'P-110': expo('P-110', 'DEMO', 60, 180, 'space-default', [], true),
  'P-120': expo('P-120', 'DEMO', 25, 90, 'space-default', [], true),
  'P-140': expo('P-140', 'DEMO', 340, 4800, 'anyone-with-link', [], false),
  'P-150': expo('P-150', 'DEMO', 2, 12, 'restricted', [{ type: 'group', name: 'finances' }], false),
  'T-1': expo('T-1', 'DEMO', 40, 300, 'space-default', [], true),
  'P-130': expo('P-130', 'DEMO', 5, 140, 'space-default', [], true),
  'P-200': expo('P-200', 'OPS', 15, 60, 'space-default', [], false),
  'P-210': expo('P-210', 'OPS', 4, 40, 'space-default', [], false),
  'P-300': expo('P-300', 'ARCH', 2, 2, 'restricted', [{ type: 'user', name: 'archiviste' }], false),
};

/** Résolution des propriétaires (§12), méthode affichée incluante. */
export const OWNERS: Record<string, OwnerResolution> = {
  'P-100': { pageId: 'P-100', ownerRef: '5f2a…dile', method: 'declared-owner', confidence: 'high', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-110': { pageId: 'P-110', ownerRef: '5f2a…dile', method: 'last-editors', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-120': { pageId: 'P-120', ownerRef: '5f2a…dile', method: 'space-lead', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-140': { pageId: 'P-140', ownerRef: '5f2a…dile', method: 'declared-owner', confidence: 'high', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-150': { pageId: 'P-150', ownerRef: '5f2a…dile', method: 'space-lead', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'T-1': { pageId: 'T-1', ownerRef: '5f2a…dile', method: 'space-lead', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-200': { pageId: 'P-200', ownerRef: '5f2a…dile', method: 'declared-owner', confidence: 'high', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-210': { pageId: 'P-210', ownerRef: '5f2a…dile', method: 'last-editors', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-300': { pageId: 'P-300', ownerRef: '5f2a…dile', method: 'teamwork-graph', confidence: 'medium', resolvedAt: '2026-11-10T08:00:00Z' },
  'P-130': { pageId: 'P-130', method: 'adoption-queue', confidence: 'none', resolvedAt: '2026-11-10T08:00:00Z', caveat: 'Aucun propriétaire déclaré, aucun éditeur récent, aucun lien dans le graphe.' },
};

/** Pages orphelines (file d'adoption) : P-130. */
export const ORPHAN_PAGES = [{ pageId: 'P-130', title: 'Onboarding équipe produit', spaceKey: 'DEMO', lastEditors: ['nick…lotti', 'nick…reira'] }];

/** Historique du rituel, par foyer (étapes verrouillées ou menées). */
export const RITUALS: Record<string, RitualStepState[]> = {
  'F-1': [
    { foyerId: 'F-1', step: 'rotate', state: 'pending' },
    { foyerId: 'F-1', step: 'redact', state: 'locked', note: 'Verrouillé tant que la rotation n’est pas attestée par une personne.' },
    { foyerId: 'F-1', step: 'purge', state: 'locked' },
    { foyerId: 'F-1', step: 'prevent', state: 'locked' },
    { foyerId: 'F-1', step: 'verify', state: 'locked' },
  ],
  'F-6': [
    { foyerId: 'F-6', step: 'rotate', state: 'done', actorRef: '5f2a…dile', at: '2026-11-06T12:15:00Z' },
    { foyerId: 'F-6', step: 'redact', state: 'done', actorRef: '5f2a…dile', at: '2026-11-07T09:30:00Z' },
    { foyerId: 'F-6', step: 'purge', state: 'done', actorRef: '5f2a…dile', at: '2026-11-07T10:00:00Z' },
    { foyerId: 'F-6', step: 'prevent', state: 'done', at: '2026-11-07T10:05:00Z' },
    { foyerId: 'F-6', step: 'verify', state: 'done', at: '2026-11-08T10:00:00Z' },
  ],
};

/** Demande de purge groupée : F-3 (l'API permet de purger — demande soumise). */
export const PURGE_REQUESTS: Record<string, PurgeRequest[]> = {
  'F-3': [
    {
      id: 'PRQ-1',
      foyerId: 'F-3',
      pageId: 'P-120',
      versionNumbers: [2],
      requestedAt: '2026-11-10T09:20:00Z',
      requestedByRef: '5f2a…dile',
      state: 'requested',
    },
  ],
  'F-1': [
    {
      id: 'PRQ-2',
      foyerId: 'F-1',
      pageId: 'P-100',
      versionNumbers: [3, 4, 5],
      requestedAt: '2026-11-10T09:22:00Z',
      requestedByRef: '5f2a…dile',
      state: 'requested',
      blockedReason: 'L’API ne permet pas de purger l’historique de versions (droits admin requis) — demande groupée à l’administrateur.',
    },
  ],
};

/** Coût de remise en état pour une famille, en heures (fourchette, §8). */
export function remediationHours(family: WikiFamily): { low: number; high: number } {
  return REMEDIATION_COST_HOURS[family];
}

/** Libellé humain d'un état de foyer (utilisé aussi par le registre). */
export const STATE_KEYS: Record<FoyerState, string> = {
  open: 'stateOpen',
  'rotation-attested': 'stateRotationAttested',
  redacted: 'stateRedacted',
  'purge-requested': 'statePurgeRequested',
  purged: 'statePurged',
  'purge-impossible': 'statePurgeImpossible',
  sealed: 'stateSealed',
  dismissed: 'stateDismissed',
};
