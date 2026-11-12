/**
 * Runtime Forge — assemble le `ServiceContext` à partir des SDK Forge
 * (`@forge/api`, `@forge/llm`, `@forge/events`, `@forge/sql`).
 *
 * C'est le SEUL endroit (avec `store/forge-store.ts`) où les SDK Forge sont
 * importés. Les services et leurs tests n'en dépendent jamais.
 *
 * ⚠ Plusieurs API utilisées ici sont **à valider semaine 1** (§22) : chemins
 * REST Confluence v1/v2, ciblage Realtime d'un utilisateur, appel au Teamwork
 * Graph, écriture `asUser()`. Chaque adaptateur porte son commentaire.
 */

import { asApp, asUser, assumeTrustedRoute, __getRuntime } from '@forge/api';
import type { ResponseLike } from '@placard-wiki/wiki-source';
import { createConfluenceClient } from '@placard-wiki/wiki-source';
import type { ConfluenceClient } from '@placard-wiki/wiki-source';
import { createCachedOracle, ORACLE_SYSTEM_PROMPT_FR } from '@placard-wiki/detectors';
import type { CachedOracle, LlmOracle, LlmOracleQuestion, LlmOracleVerdict } from '@placard-wiki/detectors';
import { chat } from '@forge/llm';
import { appEvents } from '@forge/events';
import type { ClockPort, IdPort, StoragePort } from '@placard-wiki/ritual';

import { createForgeStore } from '../store/forge-store';
import type { ForgeStore } from '../store/ports';
import type {
  AccessPort, ActorContext, JiraPort, OwnerSourcePort, RealtimePort,
  ServiceContext, TeamworkGraphPort,
} from '../services/ports';
import { GRAPH_MISSING_RIGHT_CAVEAT } from '../services/owner';

/** Modèle hébergé (§19) — nom exact à valider avec `forge lint`. */
const LLM_MODEL = 'claude-3-haiku';

/** Horloge du conteneur. */
const clock: ClockPort = { now: () => new Date().toISOString() };

/** Fabrique d'identifiants (UUID natif Node 22). */
const ids: IdPort = {
  next(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  },
};

/** Clé HMAC propre à l'installation (§4) — dérivée de l'identifiant d'installation. */
function installationKey(): string {
  try {
    return `pw:${__getRuntime().appContext.installationId}`;
  } catch {
    return 'pw:installation-inconnue';
  }
}

/** Adaptateur `fetch` pour le client Confluence (via `asApp().requestConfluence`). */
function confluenceFetch(): (url: string, init?: { method?: string }) => Promise<ResponseLike> {
  return async (url, init) => {
    const response = await asApp().requestConfluence(assumeTrustedRoute(url), { method: init?.method ?? 'GET' });
    return {
      status: response.status,
      ok: response.ok,
      json: () => response.json(),
      text: () => response.text(),
    };
  };
}

/** Client Confluence de production (chemins v1/v2 à valider, §22). */
function createConfluence(): ConfluenceClient {
  return createConfluenceClient(confluenceFetch() as never, '', '');
}

/** Oracle LLM hébergé : invite masquée, verdict JSON (§7, §14). */
function createLlmOracle(): LlmOracle {
  return async (question: LlmOracleQuestion): Promise<LlmOracleVerdict> => {
    const response = await chat({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: ORACLE_SYSTEM_PROMPT_FR },
        { role: 'user', content: `Contexte masqué :\n${question.maskedContext}\n\nAperçu : ${question.maskedPreview}` },
      ],
    });
    const text = String(response.choices[0]?.message.content ?? '');
    try {
      const parsed = JSON.parse(text) as Partial<LlmOracleVerdict>;
      return {
        isSecret: parsed.isSecret !== false,
        reasonFr: parsed.reasonFr ?? 'verdict de l’oracle',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return { isSecret: true, reasonFr: 'réponse de l’oracle non exploitable — candidat maintenu', confidence: 0 };
    }
  };
}

/** Écriture de page `asUser()` (§5) — nouvelle version au nom de la personne. */
function createStorage(): StoragePort {
  return {
    async writeVersion(pageId: string, text: string, versionComment: string, asUserRef: string): Promise<number> {
      // §22 : chemin v1 de mise à jour de page à valider semaine 1.
      const current = await asUser(asUserRef).requestConfluence(
        assumeTrustedRoute(`/wiki/rest/api/content/${pageId}?expand=version`),
      );
      const body = (await current.json()) as { version?: { number?: number } };
      const next = (body.version?.number ?? 0) + 1;
      await asUser(asUserRef).requestConfluence(assumeTrustedRoute(`/wiki/rest/api/content/${pageId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pageId,
          type: 'page',
          version: { number: next, message: versionComment },
          body: { storage: { value: text, representation: 'storage' } },
        }),
      });
      return next;
    },
  };
}

/** Bannière Realtime (§9, PW-12) — via `@forge/events` (API à valider semaine 1). */
function createRealtime(): RealtimePort {
  return {
    async publish(channel: string, payload: Record<string, unknown>): Promise<void> {
      // §22 : le ciblage Realtime d'un utilisateur précis sur une page donnée
      // est à valider. On publie un événement applicatif que le front écoute.
      await appEvents.publish({ key: channel });
      void payload;
    },
  };
}

/** Ticket Jira (§9, PW-13) — création via `asApp().requestJira`. */
function createJira(): JiraPort {
  return {
    async createIssue(payload) {
      const response = await asApp().requestJira(assumeTrustedRoute('/rest/api/3/issue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: payload.projectKey },
            summary: payload.summary,
            description: payload.description,
            issuetype: { name: payload.issueType },
            priority: { name: payload.priority },
            labels: payload.labels,
            ...(payload.assignee !== undefined ? { assignee: { id: payload.assignee } } : {}),
          },
        }),
      });
      const body = (await response.json()) as { key?: string; id?: string };
      const key = body.key ?? '';
      return { key, url: `/browse/${key}` };
    },
  };
}

/** Source de propriété (§12) — derniers éditeurs via l'historique de versions. */
function createOwnerSource(client: ConfluenceClient): OwnerSourcePort {
  return {
    async declaredOwner() {
      // Pas d'API « propriétaire déclaré » fiable à ce jour (§22) — cascade 2.
      return undefined;
    },
    async lastEditors(pageId: string) {
      const versions = await client.listVersions(pageId).catch(() => []);
      const editors = versions
        .map((v) => v.byAccountId)
        .filter((e): e is string => e !== undefined)
        .slice(-3);
      return [...new Set(editors)];
    },
    async spaceLead() {
      // Responsable d'espace non exposé par une API stable (§22) — cascade 4.
      return undefined;
    },
  };
}

/** Teamwork Graph en lecture seule (§12) — droits à valider, jamais d'écriture. */
function createGraph(): TeamworkGraphPort {
  return {
    async teamOwner(pageId: string) {
      try {
        const response = await asUser().requestTeamworkGraph(
          `query { document(id: "${pageId}") { project { owner { id } } } }`,
        );
        const body = (await response.json()) as Record<string, unknown>;
        const owner = (((body as never)['data'] as never) as Record<string, unknown>)?.['document'];
        void owner;
        return { confidence: 'none' as const, caveat: 'Graphe interrogé mais propriétaire non résolu (droits à valider, §22).' };
      } catch {
        return { confidence: 'none' as const, caveat: GRAPH_MISSING_RIGHT_CAVEAT };
      }
    },
  };
}

/** Vérification du droit de lecture (PW-23) — restrictions de la page. */
function createAccess(client: ConfluenceClient, actor: () => ActorContext): AccessPort {
  return {
    async canReadPage(pageId: string) {
      const restrictions = await client
        .getRestrictions(pageId)
        .catch((): { read: string[]; update: string[] } => ({ read: [], update: [] }));
      if (restrictions.read.length === 0) return true;
      const me = actor().accountId;
      return me !== undefined && restrictions.read.includes(me);
    },
  };
}

let cachedContext: ServiceContext | null = null;

/** Acteur courant, lu depuis le runtime Forge (`aaid` = Atlassian Account ID). */
function currentActor(): ActorContext {
  try {
    const runtime = __getRuntime();
    const accountId = runtime.aaid;
    return accountId === undefined ? { kind: 'human' } : { kind: 'human', accountId };
  } catch {
    return { kind: 'human' };
  }
}

/** Construit (et met en cache) le contexte de service Forge. */
export function getServiceContext(): ServiceContext {
  if (cachedContext !== null) return cachedContext;
  const store: ForgeStore = createForgeStore();
  const confluence = createConfluence();
  const oracle: CachedOracle = createCachedOracle(createLlmOracle(), { hmacKey: installationKey() });
  cachedContext = {
    store,
    confluence,
    hmacKey: installationKey(),
    clock,
    ids,
    storage: createStorage(),
    oracle,
    ownerSource: createOwnerSource(confluence),
    graph: createGraph(),
    realtime: createRealtime(),
    jira: createJira(),
    access: createAccess(confluence, currentActor),
    actor: currentActor,
  };
  return cachedContext;
}