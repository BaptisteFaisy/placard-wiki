// La charge utile de démonstration — conforme au contrat public publié
// (`docs/api-live.schema.json`).
//
// Elle sert aux tests du site : le flux live doit être accepté tel quel, et
// toute mutation de cette charge utile doit faire basculer le site sur le
// jeu embarqué (snapshot). Les valeurs sont synthétiques : empreintes
// factices, aperçus masqués, aucune valeur brute.

/** Une empreinte factice (HMAC-SHA-256 tronqué, 32 caractères hexadécimaux). */
export const FAKE_FINGERPRINT = 'hmac256:0123456789abcdef0123456789abcdef';

/** L'empreinte d'un certificat (HMAC-SHA-256 complet, 64 caractères). */
export const FAKE_CONTENT_HASH = 'hmac256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** La charge utile de démonstration, conforme au contrat. */
export const DEMO_LIVE_PAYLOAD = {
  generatedAt: '2026-11-12T09:00:00Z',
  mode: 'live',
  site: {
    name: 'one-atlas-cndz.atlassian.net',
    url: 'https://one-atlas-cndz.atlassian.net/wiki',
    spaces: [{ key: 'PLACARDDEMO', fr: 'PLACARDDEMO', en: 'PLACARDDEMO' }],
    titles: { '3932169': 'accès staging (mdp: sk-p…(48)) [SYNTHÉTIQUE — démo Placard]' },
  },
  registry: [
    {
      foyerId: 'foyer-hmac256:01234567',
      family: 'cloud-key',
      maskedPreview: 'AKIA…(20)',
      score: 95,
      state: 'open',
      spaceKey: 'PLACARDDEMO',
      pageTitle: 'Runbook de démonstration',
      pageId: '3932169',
      locationCount: 2,
      inCurrentVersion: true,
      inHistory: false,
      readersLow: 10,
      readersHigh: 90,
      sharing: 'space-default',
      aiSurface: true,
      lastSeenAt: '2026-11-12T08:00:00Z',
    },
  ],
  building: { wings: [] },
  foyers: {
    'foyer-hmac256:01234567': {
      id: 'foyer-hmac256:01234567',
      fingerprint: FAKE_FINGERPRINT,
      family: 'cloud-key',
      baseScore: 40,
      score: 95,
      scoreTerms: [],
      state: 'open',
      firstSeenAt: '2026-06-18T10:00:00Z',
      lastSeenAt: '2026-11-12T08:00:00Z',
      locations: [],
    },
  },
  budget: {
    day: '2026-11-12',
    pagesScanned: 12,
    attachmentsRead: 1,
    attachmentsSkipped: 0,
    llmCalls: 2,
    tokens: 100,
    costEstimate: 0.1,
    skipped: [],
  },
  coverage: { perGite: [], blindSpots: [], missingRights: [] },
  certificate: {
    id: 'cert:0123456789abcdef',
    scope: 'PLACARDDEMO',
    issuedAt: '2026-11-12T09:00:00Z',
    open: 1,
    rotated: 0,
    redacted: 0,
    purged: 0,
    residualExposure: '—',
    blindSpots: [],
    contentHash: FAKE_CONTENT_HASH,
  },
} as const;

/** Une copie modifiable de la charge utile de démonstration. */
export function demoLivePayload(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEMO_LIVE_PAYLOAD)) as Record<string, unknown>;
}
