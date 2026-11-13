/**
 * La passe simulée, jouable **hors réseau** (`pnpm demo`).
 *
 * Le point de la démo : rejouer la chaîne complète du produit — détection,
 * regroupement en foyers, exposition et score, rituel, certificat — **sans
 * Atlassian, sans clé, sans réseau**. Pour cela elle réutilise les vrais
 * services (`runSweep`, le service de rituel, le store en mémoire) et le
 * client de fixtures de `@placard-wiki/wiki-source` : ce qui est démontré
 * ici est le même code que celui qui tourne dans l'app Forge.
 *
 * Règle absolue : aucune valeur brute ne sort de ce fichier. Les foyers
 * portent une empreinte HMAC et un aperçu masqué ; les fixtures plantent des
 * valeurs **factices**, construites à l'exécution par `@placard/core`.
 */

import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { Foyer, WikiFamily } from '@placard-wiki/domain';
import { createCachedOracle } from '../../detectors/src/index';
import type { LlmOracle } from '../../detectors/src/index';
import { createFixtureClient } from '../../wiki-source/src/index';
import type { FixtureData } from '../../wiki-source/src/index';
import { adminPurgeBrief, fixedClock, sequenceIds } from '../../ritual/src/index';
import { runSweep } from '../../forge-app/src/services/sweep';
import {
  applyRedactionService,
  attestRotation,
  generateCertificate,
  redactionPreview,
  requestPurge,
} from '../../forge-app/src/services/ritual-service';
import type { ServiceContext } from '../../forge-app/src/services/ports';
import { createMemoryStore } from '../../forge-app/src/store/memory-store';
import { createMemorySurfaceRegistry, resolveNamespace } from '../../surfaces/src/index';

import { SECRET_FIXTURES, fixturesDuGite } from './fixtures/index';
import {
  attachementDe,
  commentaireXml,
  corpsDePageXml,
  espaceDescriptionTexte,
  historiqueV1Xml,
  historiqueV2Xml,
  modelePageXml,
  pagePartageeXml,
  titreSecret,
} from './fixtures/content';
import type { DemoFoyer, DemoLocation, DemoReport, DemoRitual, DemoScores, DemoStep, DemoSweep } from './demo-types';
import { masquerDiff, valeurBruteDans } from './demo-masquage';

/** Espace de démonstration : la même clé que l'app Forge. */
export const SPACE = 'PLACARDDEMO';
/** Clé d'installation de la démo : elle n'ouvre aucun droit, elle hashe. */
const HMAC_KEY = 'cle-hmac-de-demo-locale';
/** Horloge figée : la démo doit être reproductible d'une run à l'autre. */
const HORLOGE = '2026-11-12T10:00:00.000Z';
/** La personne qui joue le rituel dans la démo. */
const ACTEUR = 'ari:identity::alice';
/** Preuve de rotation référencée par l'attestation (un ticket, pas un secret). */
const PREUVE = 'SEC-417 (rotation AWS, capturé dans la démo)';

/** Angles morts que la passe déclare — jamais masqués (§19). */
const ANGLES_MORTS: readonly string[] = [
  'Modèles de page et description d’espace (gîtes 5 et 7) : hors de la passe de pages (§6) — angle mort déclaré.',
  'Whiteboards et bases Confluence : non balayés (PW-29) — angle mort déclaré.',
  'Captures d’écran : aucun OCR, les secrets d’une image échappent au balayage texte (§24) — angle mort déclaré.',
];

/** Les pages de l’espace de démo : un corps partagé, une page amplified, une page titre. */
function pagesDeDemo(): FixtureData['pages'] {
  const corps = fixturesDuGite('corps-de-page');
  const titres = fixturesDuGite('titres-et-etiquettes');
  const horodatage = '2026-11-09T08:00:00.000Z';
  return [
    {
      id: '1001',
      title: 'Tableau d’identifiants — staging (SYNTHÉTIQUE)',
      spaceKey: SPACE,
      versionNumber: 2,
      bodyStorage: corpsDePageXml(corps),
      labels: ['demo'],
      lastModifiedAt: horodatage,
    },
    {
      id: '1002',
      title: 'Historique — accès corrigé (SYNTHÉTIQUE)',
      spaceKey: SPACE,
      versionNumber: 2,
      bodyStorage: historiqueV2Xml(),
      labels: [],
      lastModifiedAt: horodatage,
    },
    {
      id: '1003',
      title: 'Page partagée — anyone with the link (SYNTHÉTIQUE)',
      spaceKey: SPACE,
      versionNumber: 1,
      bodyStorage: pagePartageeXml(corps),
      labels: [],
      lastModifiedAt: horodatage,
    },
    ...titres.map((fixture, index) => ({
      id: `11${String(index + 1).padStart(2, '0')}`,
      title: titreSecret(fixture),
      spaceKey: SPACE,
      versionNumber: 1,
      bodyStorage: `<p>Voir l’espace de démonstration (${fixture.family}).</p>`,
      labels: [],
      lastModifiedAt: horodatage,
    })),
  ];
}

/** Les commentaires de la page 1001 — un commentaire par valeur factice. */
function commentairesDeDemo(): FixtureData['comments'] {
  const commentaires = fixturesDuGite('commentaires');
  return {
    '1001': commentaires.map((fixture, index) => ({
      id: `c-${String(index + 1).padStart(2, '0')}`,
      bodyStorage: commentaireXml(fixture),
      versionNumber: 1,
    })),
  };
}

/** Les pièces jointes de la page 1001 : métadonnées + contenu textuel. */
function piecesDeDemo(): {
  attachments: NonNullable<FixtureData['attachments']>;
  attachmentContent: NonNullable<FixtureData['attachmentContent']>;
} {
  const pieces = fixturesDuGite('pieces-jointes');
  const metas = pieces.map((fixture, index) => {
    const att = attachementDe(fixture);
    return {
      id: `a-${String(index + 1).padStart(2, '0')}`,
      filename: att.filename,
      mediaType: att.mimeType,
      sizeBytes: att.content.length,
    };
  });
  const contenu: Record<string, { text: string }> = {};
  pieces.forEach((fixture, index) => {
    const att = attachementDe(fixture);
    contenu[`a-${String(index + 1).padStart(2, '0')}`] = { text: att.content };
  });
  return { attachments: { '1001': metas }, attachmentContent: contenu };
}

/** Le jeu de fixtures de la passe : pages, commentaires, pièces, versions, gîtes 5 et 7. */
export function buildFixtureData(): FixtureData {
  return {
    spaces: [
      {
        key: SPACE,
        name: 'PLACARD-DEMO',
        descriptionStorage: espaceDescriptionTexte(fixturesDuGite('description-espace')),
      },
    ],
    pages: pagesDeDemo(),
    versions: {
      '1002': [
        {
          number: 1,
          title: 'v1',
          bodyStorage: historiqueV1Xml(fixturesDuGite('historique-de-versions')),
        },
      ],
    },
    comments: commentairesDeDemo(),
    ...piecesDeDemo(),
    templates: [
      {
        id: 'tpl-demo-1',
        title: 'Runbook modèle (SYNTHÉTIQUE)',
        spaceKey: SPACE,
        bodyStorage: modelePageXml(fixturesDuGite('modeles-de-page')),
      },
    ],
  };
}

/** Oracle factice : un verdict local, jamais un appel à un modèle. */
function oracleFactice(): LlmOracle {
  return async () => ({
    isSecret: true,
    reasonFr: 'oracle factice de la démo locale (aucun appel réseau)',
    confidence: 1,
  });
}

/** Les ports factices de la démo : aucun appel réseau, aucun effet de bord. */
function portsFactices(): Pick<
  ServiceContext,
  'storage' | 'ownerSource' | 'graph' | 'realtime' | 'jira' | 'access' | 'actor'
> {
  return {
    storage: {
      async writeVersion() {
        return 3;
      },
    },
    ownerSource: {
      async declaredOwner() {
        return ACTEUR;
      },
      async lastEditors() {
        return [];
      },
      async spaceLead() {
        return undefined;
      },
    },
    graph: {
      async teamOwner() {
        return { confidence: 'none' as const, caveat: 'graphe non interrogé en démo' };
      },
    },
    realtime: {
      async publish() {
        // la bannière temps réel n'a pas d'effet de bord hors ligne
      },
    },
    jira: {
      async createIssue() {
        return { key: 'SEC-417', url: '/browse/SEC-417' };
      },
    },
    access: {
      async canReadPage() {
        return true;
      },
    },
    actor: () => ({ kind: 'human', accountId: ACTEUR }),
  };
}

/** Le contexte de services, branché sur la mémoire : rien ne sort de la machine. */
export function buildDemoContext(data: FixtureData): ServiceContext {
  return {
    store: createMemoryStore(),
    confluence: createFixtureClient(data),
    hmacKey: HMAC_KEY,
    // Le namespace d'empreinte de la démo : propre à l'installation, jamais
    // partagé (PW-31) — la démo ne prétend pas comparer des empreintes.
    namespace: resolveNamespace({ installationId: 'demo-space', source: 'absent' }),
    // Le registre multi-surfaces : en mémoire, comme le store (PW-31).
    surfaces: createMemorySurfaceRegistry(),
    clock: fixedClock(HORLOGE),
    ids: sequenceIds(),
    oracle: createCachedOracle(oracleFactice(), { hmacKey: HMAC_KEY }),
    ...portsFactices(),
  };
}

/** Les emplacements d'un foyer, réduits à ce qu'on peut montrer (aperçu masqué). */
function locationsDe(foyer: Foyer): DemoLocation[] {
  return foyer.locations.map((location) => ({
    gite: location.gite,
    pageId: location.pageId,
    containerType: location.containerType,
    maskedPreview: location.maskedPreview,
    status: location.status,
  }));
}

/** Les nombres de la passe : foyers, emplacements, danger maximal, par gîte. */
function computeScores(foyers: Foyer[]): DemoScores {
  const parGite: Record<string, number> = {};
  let emplacements = 0;
  for (const foyer of foyers) {
    emplacements += foyer.locations.length;
    for (const location of foyer.locations) {
      parGite[location.gite] = (parGite[location.gite] ?? 0) + 1;
    }
  }
  const pire = foyers.reduce((max, foyer) => (foyer.score > max.score ? foyer : max), foyers[0] as Foyer);
  return {
    foyers: foyers.length,
    emplacements,
    dangerMax: pire.score,
    dangerMaxFamily: pire.family,
    parGite,
    plantes: SECRET_FIXTURES.length,
  };
}

/** Les refus du rituel, collected avant toute attestation : le verrou se montre. */
async function verrousDuRituel(
  ctx: ServiceContext,
  foyerId: string,
): Promise<{ refusAgent: string; refusCaviardage: string }> {
  const agent = await attestRotation(ctx, {
    foyerId,
    provider: 'AWS',
    evidenceRef: PREUVE,
    actorRef: 'agent-rovo',
    actorKind: 'agent',
  });
  const caviardage = await redactionPreview(ctx, foyerId);
  return {
    refusAgent: agent.ok ? 'refus inattendu' : agent.reason,
    refusCaviardage: 'diffs' in caviardage ? 'verrou inattendu' : caviardage.reason,
  };
}

/** Les versions d'historique du foyer — la cible exacte de la demande de purge. */
function versionsCiblees(foyer: Foyer): Array<{ pageId: string; versionNumbers: number[] }> {
  return foyer.locations
    .filter((location) => location.containerType === 'version' && location.versionNumber !== undefined)
    .map((location) => ({ pageId: location.pageId, versionNumbers: [location.versionNumber as number] }));
}

/** Le rituel joué sur le foyer le plus dangereux : attesté, caviardé, purge documentée. */
async function runRitual(ctx: ServiceContext, foyer: Foyer): Promise<DemoRitual> {
  const verrou = await verrousDuRituel(ctx, foyer.id);
  const attestation = await attestRotation(ctx, {
    foyerId: foyer.id,
    provider: 'AWS',
    evidenceRef: PREUVE,
    actorRef: ACTEUR,
    actorKind: 'human',
  });
  if (!attestation.ok) throw new Error(`Attestation refusée : ${attestation.reason}`);
  const preview = await redactionPreview(ctx, foyer.id);
  if (!('diffs' in preview)) throw new Error(`Aperçu refusé : ${preview.reason}`);
  const applique = await applyRedactionService(ctx, foyer.id, 'alice', 'Caviardage de démonstration');
  if (!('applied' in applique)) throw new Error(`Caviardage refusé : ${applique.reason}`);
  const purge = await requestPurge(ctx, foyer.id);
  const etapes = await ctx.store.ritualSteps.listByFinding(foyer.id);
  const cibles = versionsCiblees(foyer);
  const raison = purge.request?.blockedReason ?? 'raison non renseignée';
  return {
    foyerId: foyer.id,
    family: foyer.family,
    score: foyer.score,
    verrou,
    attestation: {
      provider: 'AWS',
      attestedAt: attestation.attestedAt,
      actorRef: ACTEUR,
      state: 'rotation-attested',
    },
    redaction: {
      // Les lignes du diff sont masquées intégralement : la démo ne montre
      // jamais une valeur, même celle d'un voisin de la ligne (§23).
      diffs: preview.diffs.map((diff) => masquerDiff(diff, ctx.hmacKey)),
      templateFirst: preview.templateFirst,
      applied: applique.applied,
      asUser: applique.asUser,
      versionComment: applique.versionComment,
      state: 'redacted',
    },
    purge: {
      apiCanPurge: purge.apiCanPurge,
      blockedReason: raison,
      adminBrief: adminPurgeBrief(foyer, cibles, raison),
      state: 'purge-impossible',
    },
    steps: etapes.map((step) => ({ step: step.step, state: step.state, ...(step.note !== undefined ? { note: step.note } : {}) })) as DemoStep[],
  };
}

/**
 * Garde-fou : le rapport ne doit contenir aucune valeur brute. Si jamais un
 * chemin en laissait passer une, la démo **le dit et s'arrête** — elle ne
 * sort pas un rapport douteux. Le message ne porte que la longueur.
 */
function verifierAucuneValeurBrute(report: DemoReport): void {
  const fautive = valeurBruteDans(JSON.stringify(report));
  if (fautive !== undefined) {
    throw new Error(
      `Démo : une valeur brute (${String(fautive.length)} caractères) a été trouvée dans le rapport — la démo s'arrête.`,
    );
  }
}

/**
 * La démo complète : passe, regroupement, score, rituel, certificat.
 * Le rapport ne porte que des empreintes, des aperçus masqués et des
 * compteurs — jamais une valeur brute.
 */
export async function runDemoScenario(): Promise<DemoReport> {
  const ctx = buildDemoContext(buildFixtureData());
  const passe = await runSweep(ctx, { mode: 'full', scope: 'site', maxPages: 50 });
  const foyers = await ctx.store.listFoyers({ limit: 1000 });
  const scores = computeScores(foyers);
  const pire = foyers.reduce((max, foyer) => (foyer.score > max.score ? foyer : max), foyers[0] as Foyer);
  const ritual = await runRitual(ctx, pire);
  const certificate = await generateCertificate(ctx, 'site');
  const sweep: DemoSweep = {
    mode: passe.mode,
    scope: passe.scope,
    pagesScanned: passe.pagesScanned,
    attachmentsRead: passe.attachmentsRead,
    attachmentsSkipped: passe.attachmentsSkipped,
    llmCalls: passe.llmCalls,
    foyersTouched: passe.foyersTouched,
    durationMs: passe.durationMs,
    blindSpots: passe.blindSpots,
  };
  const foyer: DemoFoyer = {
    id: pire.id,
    family: pire.family,
    familyLabel: FAMILY_LABELS[pire.family as WikiFamily]?.fr ?? pire.family,
    score: pire.score,
    scoreTerms: pire.scoreTerms,
    locations: locationsDe(pire),
  };
  const report: DemoReport = {
    scenario: 'Placard du wiki — passe complète hors réseau (fixtures de @placard-wiki/demo-space)',
    offline: true,
    sweep,
    scores,
    foyer,
    ritual,
    certificate,
    avertissements: [...ANGLES_MORTS],
  };
  verifierAucuneValeurBrute(report);
  return report;
}
