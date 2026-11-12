/**
 * Support de test des services — construit un `ServiceContext` entièrement en
 * mémoire (store mémoire + client Confluence à fixtures + ports factices).
 *
 * Règle PLA-N-09 : aucune valeur au format réel d'un secret n'est écrite dans
 * le dépôt. Les valeurs à forme de secret sont fabriquées à l'exécution (voir
 * `fakeCloudKeyValue`). Les tests n'instancient JAMAIS `@forge/sql`.
 */

import { createHash } from 'node:crypto';
import { createFixtureClient } from '@placard-wiki/wiki-source';
import type { ConfluenceClient } from '@placard-wiki/wiki-source';
import { createCachedOracle } from '@placard-wiki/detectors';
import type { CachedOracle, LlmOracle } from '@placard-wiki/detectors';
import { fixedClock, sequenceIds } from '@placard-wiki/ritual';
import type { ClockPort, IdPort, StoragePort } from '@placard-wiki/ritual';

import { createMemoryStore } from '../store/memory-store';
import type { ForgeStore } from '../store/ports';
import type { Foyer } from '@placard-wiki/domain';
import { runSweep } from './sweep';
import type {
  AccessPort, ActorContext, JiraPort, OwnerSourcePort, RealtimePort,
  ServiceContext, TeamworkGraphPort,
} from './ports';
import { GRAPH_MISSING_RIGHT_CAVEAT } from './owner';

/**
 * Valeur à forme de clé cloud, fabriquée à l'exécution (PLA-N-09 : aucune
 * valeur au format réel d'un secret n'est écrite dans le dépôt). Préfixe +
 * 16 caractères majuscules/chiffres, déterministe depuis une graine.
 */
function fakeCloudKeyValue(seed: string): string {
  const digest = createHash('sha256').update(seed).digest();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = 'AKIA';
  for (let i = 0; i < 16; i += 1) {
    const byte = digest[i % digest.length] ?? 0;
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

/** Clé cloud factice, fabriquée à l'exécution (jamais écrite dans le dépôt). */
export const FAKE_CLOUD_KEY = fakeCloudKeyValue('forge-app-test');

/** Identifiants de la fixture. */
export const PAGE_ID = '1001';
export const SPACE_KEY = 'DEMO';

/** Charge utile d'une page de fixture (corps contenant la clé factice). */
function fixturePages(): Array<{
  id: string; title: string; spaceKey: string; versionNumber: number;
  bodyStorage: string; labels: string[]; lastModifiedAt: string;
}> {
  return [{
    id: PAGE_ID,
    title: 'Runbook de démonstration',
    spaceKey: SPACE_KEY,
    versionNumber: 3,
    bodyStorage: `<p>export AWS_ACCESS_KEY_ID=${FAKE_CLOUD_KEY}</p>`,
    labels: ['runbook'],
    lastModifiedAt: '2026-11-09T08:00:00.000Z',
  }];
}

/** Client Confluence mémoire (aucun réseau). */
export function testConfluenceClient(): ConfluenceClient {
  return createFixtureClient({ pages: fixturePages() });
}

/** Oracle factice : tranche toujours « secret réel », sans appel LLM. */
export function testOracle(hmacKey: string): CachedOracle {
  const fake: LlmOracle = async () => ({ isSecret: true, reasonFr: 'oracle de test', confidence: 1 });
  return createCachedOracle(fake, { hmacKey });
}

/** Écriture de page factice : enregistre les versions écrites. */
export interface FakeStorage extends StoragePort {
  written: Array<{ pageId: string; text: string; comment: string; asUser: string }>;
}

function testStorage(): FakeStorage {
  const written: FakeStorage['written'] = [];
  return {
    written,
    async writeVersion(pageId, text, versionComment, asUser) {
      written.push({ pageId, text, comment: versionComment, asUser });
      return 4;
    },
  };
}

/** Ports factices (propriétaire, graphe, Realtime, Jira, accès). */
function testOwnerSource(): OwnerSourcePort {
  return {
    async declaredOwner() { return 'ari:identity::alice'; },
    async lastEditors() { return ['ari:identity::bob']; },
    async spaceLead() { return undefined; },
  };
}

function testGraph(): TeamworkGraphPort {
  return { async teamOwner() { return { confidence: 'none' as const, caveat: 'graphe de test' }; } };
}

/** Source de propriété vide : aucune cascade locale ne résout (§12). */
export function emptyOwnerSource(): OwnerSourcePort {
  return {
    async declaredOwner() { return undefined; },
    async lastEditors() { return []; },
    async spaceLead() { return undefined; },
  };
}

/** Graphe sans droit : la résolution échoue en déclarant « pas de droit » (§19). */
export function deniedGraph(): TeamworkGraphPort {
  return { async teamOwner() { return { confidence: 'none' as const, caveat: GRAPH_MISSING_RIGHT_CAVEAT }; } };
}

export interface FakeRealtime extends RealtimePort {
  published: Array<{ channel: string; payload: Record<string, unknown> }>;
}

function testRealtime(): FakeRealtime {
  const published: FakeRealtime['published'] = [];
  return {
    published,
    async publish(channel, payload) { published.push({ channel, payload }); },
  };
}

export interface FakeJira extends JiraPort {
  issues: Array<{ projectKey: string; summary: string }>;
}

function testJira(): FakeJira {
  const issues: FakeJira['issues'] = [];
  return {
    issues,
    async createIssue(payload) {
      issues.push({ projectKey: payload.projectKey, summary: payload.summary });
      return { key: 'SEC-1', url: '/browse/SEC-1' };
    },
  };
}

function testAccess(): AccessPort {
  return { async canReadPage() { return true; } };
}

/** Options de construction du contexte de test. */
export interface TestContextOptions {
  hmacKey?: string;
  clock?: ClockPort;
  ids?: IdPort;
  store?: ForgeStore;
  confluence?: ConfluenceClient;
  actor?: ActorContext;
  /** Source de propriété injectée (défaut : propriétaire déclaré `alice`). */
  ownerSource?: OwnerSourcePort;
  /** Graphe injecté (défaut : aucun propriétaire, caveat de test). */
  graph?: TeamworkGraphPort;
}

/** Contexte de service entièrement factice, pour les tests. */
export function makeTestContext(options: TestContextOptions = {}): ServiceContext & {
  storage: FakeStorage; realtime: FakeRealtime; jira: FakeJira;
} {
  const hmacKey = options.hmacKey ?? 'cle-hmac-de-test';
  const store = options.store ?? createMemoryStore();
  const confluence = options.confluence ?? testConfluenceClient();
  const clock = options.clock ?? fixedClock('2026-11-11T10:00:00.000Z');
  const ids = options.ids ?? sequenceIds();
  const storage = testStorage();
  const realtime = testRealtime();
  const jira = testJira();
  const ownerSource = options.ownerSource ?? testOwnerSource();
  const graph = options.graph ?? testGraph();
  const actor = options.actor ?? { kind: 'human' as const, accountId: 'ari:identity::alice' };
  return {
    store,
    confluence,
    hmacKey,
    clock,
    ids,
    storage,
    oracle: testOracle(hmacKey),
    ownerSource,
    graph,
    realtime,
    jira,
    access: testAccess(),
    actor: () => actor,
  };
}

/** Identifiant de la page « multi-gîtes » de la fixture de propagation. */
export const MULTI_PAGE_ID = '2001';

/** Identifiant du modèle de page (gîte 5) de la fixture de propagation. */
export const TEMPLATE_ID = 'tpl-demo-1';

/**
 * Client Confluence factice : la **même** clé factice vit dans cinq gîtes
 * (corps de page, version historique, commentaire, pièce jointe, modèle) —
 * un seul foyer, cinq emplacements (§11). Aucune valeur n'est écrite dans le
 * dépôt : la clé est fabriquée à l'exécution (PLA-N-09).
 */
export function multiGiteFixtureClient(): ConfluenceClient {
  return createFixtureClient({
    pages: [{
      id: MULTI_PAGE_ID,
      title: 'Runbook multi-gîtes',
      spaceKey: SPACE_KEY,
      versionNumber: 3,
      bodyStorage: `<p>export AWS_ACCESS_KEY_ID=${FAKE_CLOUD_KEY}</p>`,
      labels: [],
      lastModifiedAt: '2026-11-09T08:00:00.000Z',
    }],
    versions: {
      [MULTI_PAGE_ID]: [{ number: 2, title: 'Version 2', bodyStorage: `<p>clé d'hier ${FAKE_CLOUD_KEY}</p>` }],
    },
    comments: {
      [MULTI_PAGE_ID]: [{ id: 'c-1', bodyStorage: `la clé de staging : ${FAKE_CLOUD_KEY}`, versionNumber: 1 }],
    },
    attachments: {
      [MULTI_PAGE_ID]: [{ id: 'a-1', filename: 'notes.env', mediaType: 'text/plain', sizeBytes: 64 }],
    },
    attachmentContent: { 'a-1': { text: `AWS_ACCESS_KEY_ID=${FAKE_CLOUD_KEY}` } },
    templates: [{ id: TEMPLATE_ID, title: 'Modèle runbook', spaceKey: SPACE_KEY, bodyStorage: `<p>${FAKE_CLOUD_KEY}</p>` }],
  });
}

/** Balaye une page et renvoie le foyer ouvert — helper partagé des tests. */
export async function seedFoyerBySweep(
  ctx: ServiceContext,
  pageId: string = PAGE_ID,
): Promise<Foyer> {
  await runSweep(ctx, { mode: 'on-demand', scope: pageId, maxPages: 1 });
  const foyers = await ctx.store.listFoyers({ limit: 10 });
  const foyer = foyers[0];
  if (foyer === undefined) throw new Error('test : aucun foyer produit');
  return foyer;
}