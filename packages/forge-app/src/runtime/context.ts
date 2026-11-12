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
import type { ConfluenceClient } from '@placard-wiki/wiki-source';
import { createCachedOracle, ORACLE_SYSTEM_PROMPT_FR } from '@placard-wiki/detectors';
import type { CachedOracle, LlmOracle, LlmOracleQuestion, LlmOracleVerdict } from '@placard-wiki/detectors';
import { chat } from '@forge/llm';
import { appEvents } from '@forge/events';
import type { ClockPort, IdPort, StoragePort } from '@placard-wiki/ritual';

import { createForgeConfluence } from './confluence';
import { createForgeStore, readOrCreateAppSecret } from '../store/forge-store';
import type { ForgeStore } from '../store/ports';
import {
  HMAC_SECRET_NAME, HMAC_VARIABLE, generateHmacKey, staticVariable,
} from './secret';
import type { HmacSource } from './secret';
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

/**
 * Résout la clé HMAC de l'installation : variable statique Forge, puis table
 * technique `app_secret`, puis repli dérivé de l'installation (voir
 * `runtime/secret.ts`). La valeur n'est jamais journalisée — seule la source.
 */
async function resolveHmacKey(): Promise<{ key: string; source: HmacSource }> {
  const fromVariable = staticVariable(HMAC_VARIABLE);
  if (fromVariable !== undefined) return { key: fromVariable, source: 'variable-forge' };
  try {
    const persisted = await readOrCreateAppSecret(HMAC_SECRET_NAME, generateHmacKey);
    if (persisted !== '') return { key: persisted, source: 'sql-app_secret' };
  } catch {
    // Le store est indisponible : on retombe sur la clé d'installation.
  }
  return { key: installationKey(), source: 'repli-installation' };
}

/**
 * Client Confluence de production. Les chemins qui répondent 200 pour
 * l'identité de l'app sont choisis dans `runtime/confluence.ts` (mesuré le
 * 12 novembre 2026) ; le reste du paquet `wiki-source` reste inchangé.
 */
function createConfluence(): ConfluenceClient {
  return createForgeConfluence();
}

/**
 * Texte d'une réponse `@forge/llm`. Mesuré le 12 novembre 2026 : le contenu
 * arrive en **blocs** (`content: [{ type: 'text', text }]`), pas en chaîne —
 * `String(...)` sur un tableau donnait `[object Object]` et tout verdict
 * devenait « non exploitable ». Les deux formes sont acceptées.
 */
function llmText(response: unknown): string {
  const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? [];
  const content = choices[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part !== 'object' || part === null) return '';
        const block = part as { type?: string; text?: string };
        return block.type === 'text' ? (block.text ?? '') : '';
      })
      .join('');
  }
  return '';
}

/** Extrait l'objet JSON d'une réponse d'oracle (bloc ```json``` ou texte libre). */
function parseVerdict(text: string): Partial<LlmOracleVerdict> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Partial<LlmOracleVerdict>;
  } catch {
    return null;
  }
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
    const parsed = parseVerdict(llmText(response));
    if (parsed === null) {
      return { isSecret: true, reasonFr: 'réponse de l’oracle non exploitable — candidat maintenu', confidence: 0 };
    }
    return {
      isSecret: parsed.isSecret !== false,
      reasonFr: parsed.reasonFr ?? 'verdict de l’oracle',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
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

/**
 * Sonde les points d'accès Confluence depuis l'identité de l'app et renvoie
 * le statut HTTP de chacun. Diagnostic mesuré (12 novembre 2026) : la
 * recherche CQL répond 200 alors que la lecture d'une page répond 401 — il
 * faut donc savoir quel chemin fonctionne avant de balayer.
 */
export async function probeConfluence(
  paths: readonly string[],
): Promise<Array<{ path: string; status: number; error?: string }>> {
  const out: Array<{ path: string; status: number; error?: string }> = [];
  for (const path of paths) {
    try {
      const response = await asApp().requestConfluence(assumeTrustedRoute(path));
      out.push({ path, status: response.status });
    } catch (error) {
      out.push({ path, status: -1, error: String(error) });
    }
  }
  return out;
}

let cachedContext: ServiceContext | null = null;
let pendingContext: Promise<ServiceContext> | null = null;

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

/** Assemble le contexte : la clé HMAC est résolue AVANT (elle conditionne les empreintes). */
async function buildContext(): Promise<ServiceContext> {
  const hmac = await resolveHmacKey();
  console.info(`[placard] clé HMAC : source=${hmac.source} (valeur jamais journalisée).`);
  const store: ForgeStore = createForgeStore();
  const confluence = createConfluence();
  const oracle: CachedOracle = createCachedOracle(createLlmOracle(), { hmacKey: hmac.key });
  return {
    store,
    confluence,
    hmacKey: hmac.key,
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
}

/**
 * Construit (et met en cache) le contexte de service Forge. Asynchrone : la
 * clé HMAC est lue depuis la variable statique ou persistée en base avant la
 * première empreinte — une clé regenerated à chaque invocation ferait dériver
 * toutes les empreintes.
 */
export function getServiceContext(): Promise<ServiceContext> {
  if (cachedContext !== null) return Promise.resolve(cachedContext);
  if (pendingContext === null) {
    pendingContext = buildContext().then(
      (ctx) => {
        cachedContext = ctx;
        return ctx;
      },
      (error: unknown) => {
        pendingContext = null; // l'appel suivant retente
        throw error;
      },
    );
  }
  return pendingContext;
}