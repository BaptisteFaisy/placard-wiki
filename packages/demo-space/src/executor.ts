/**
 * Exécuteur du plan de semis (§15). Deux modes :
 *  - `renderPlan` : impression `--dry-run`, aucun réseau ;
 *  - `executePlan` : application réelle via un `fetch` injectable, idempotent
 *    (lookup GET avant chaque création ; les étapes impossibles sont signalées
 *    sans faire échouer le semis).
 *
 * Les références `{{ID}}` entre étapes sont résolues à l'exécution à partir du
 * registre des entités créées ; en `--dry-run`, elles restent lisibles `‹ID›`.
 */

import type { SeedPlan, SeedStep } from './plan';

/** Signature minimale de `fetch`, injectable pour les tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Options d'exécution (base URL + identifiants + préfixe REST). */
export interface SeedOptions {
  readonly baseUrl: string;
  readonly email: string;
  readonly token: string;
  readonly apiPrefix: string;
}

/** Résultat d'une étape. */
export type StepStatus = 'created' | 'skipped' | 'failed';

export interface StepResult {
  readonly id: string;
  readonly status: StepStatus;
  readonly httpStatus?: number;
  readonly confluenceId?: string;
  readonly detail?: string;
}

export interface SeedReport {
  readonly spaceKey: string;
  readonly results: readonly StepResult[];
}

/** Journal injectable (défaut : console). */
export type Logger = (message: string) => void;

type JsonObj = Record<string, unknown>;

/** Autorisation Basic email:token (jamais journalisée). */
function basicAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

/** En-têtes JSON (sans Content-Type pour laisser `fetch` poser la frontière multipart). */
function authHeaders(opts: SeedOptions): JsonObj {
  return { Authorization: basicAuth(opts.email, opts.token), Accept: 'application/json' };
}

/** Remplace `{{ID}}` par l'identifiant Confluence connu, sinon laisse tel quel. */
function resolveRefs(text: string, registry: ReadonlyMap<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, id: string) => registry.get(id) ?? `{{${id}}}`);
}

/** Variante lisible pour le `--dry-run` : `{{ID}}` → `‹ID›`. */
function renderRefs(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, '‹$1›');
}

/** Résout les références imbriquées d'un corps JSON. */
function resolveBodyRefs(body: unknown, registry: ReadonlyMap<string, string>): unknown {
  return JSON.parse(resolveRefs(JSON.stringify(body), registry));
}

/** URL complète d'un chemin relatif, préfixe REST inclus. */
function fullUrl(opts: SeedOptions, path: string): string {
  return `${opts.baseUrl.replace(/\/+$/, '')}${opts.apiPrefix}${path}`;
}

/** Extrait l'identifiant Confluence d'une réponse de lookup, selon la nature. */
function matchEntity(step: SeedStep, json: unknown): string | undefined {
  if (json === null || typeof json !== 'object') return undefined;
  const obj = json as JsonObj;
  if (step.kind === 'space') return (obj.id as string | undefined) ?? (obj.key as string | undefined);
  const results = obj.results as JsonObj[] | undefined;
  if (!Array.isArray(results) || results.length === 0) return undefined;
  if (step.kind === 'comment') {
    const wanted = ((step.body as JsonObj)?.body as JsonObj)?.storage as JsonObj | undefined;
    const found = results.find((r) => ((r.body as JsonObj)?.storage as JsonObj)?.value === wanted?.value);
    return found?.id as string | undefined;
  }
  if (step.kind === 'attachment') {
    const filename = (step.body as JsonObj)?.filename;
    const found = results.find((r) => r.title === filename);
    return found?.id as string | undefined;
  }
  const first = results[0] as JsonObj;
  return (first.templateId as string | undefined) ?? (first.id as string | undefined);
}

/** Lookup GET : renvoie l'identifiant existant, ou `undefined` s'il faut créer. */
async function lookupEntity(
  step: SeedStep,
  registry: ReadonlyMap<string, string>,
  opts: SeedOptions,
  fetchImpl: FetchLike,
): Promise<string | undefined> {
  if (step.lookup === undefined) return undefined;
  const url = fullUrl(opts, resolveRefs(step.lookup, registry));
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: authHeaders(opts) as HeadersInit });
    if (!res.ok) return undefined;
    return matchEntity(step, (await res.json().catch(() => undefined)) as unknown);
  } catch {
    return undefined;
  }
}

/** Construit l'`init` de la requête (multipart pour une pièce jointe). */
function buildInit(step: SeedStep, registry: ReadonlyMap<string, string>, opts: SeedOptions): RequestInit {
  const headers = authHeaders(opts) as JsonObj;
  if (step.kind === 'attachment') {
    const att = step.body as JsonObj;
    const form = new FormData();
    form.append('file', new Blob([String(att.content)], { type: String(att.mimeType) }), String(att.filename));
    form.append('comment', 'SYNTHÉTIQUE — démo Placard');
    return { method: step.method, headers: headers as HeadersInit, body: form };
  }
  headers['Content-Type'] = 'application/json';
  const body = step.body === undefined ? undefined : JSON.stringify(resolveBodyRefs(step.body, registry));
  return { method: step.method, headers: headers as HeadersInit, ...(body === undefined ? {} : { body }) };
}

/** Exécute une étape : idempotence puis requête ; ne lève jamais. */
async function executeStep(
  step: SeedStep,
  registry: Map<string, string>,
  opts: SeedOptions,
  fetchImpl: FetchLike,
  log: Logger,
): Promise<StepResult> {
  const existing = await lookupEntity(step, registry, opts, fetchImpl);
  if (existing !== undefined) {
    registry.set(step.id, existing);
    log(`skip  ${step.id} (déjà présent)`);
    return { id: step.id, status: 'skipped', confluenceId: existing };
  }
  const url = fullUrl(opts, resolveRefs(step.path, registry));
  try {
    const res = await fetchImpl(url, buildInit(step, registry, opts));
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      log(`échec ${step.id} (HTTP ${res.status})${step.note ? ` — ${step.note}` : ''}`);
      return { id: step.id, status: 'failed', httpStatus: res.status, detail };
    }
    const json = (await res.json().catch(() => undefined)) as JsonObj | undefined;
    const id = json === undefined ? undefined : String((json.id as string | number) ?? (json.key as string) ?? '');
    if (id !== undefined && id.length > 0) registry.set(step.id, id);
    log(`ok    ${step.id}`);
    return { id: step.id, status: 'created', ...(id ? { confluenceId: id } : {}) };
  } catch (err) {
    log(`erreur ${step.id}: ${String(err)}`);
    return { id: step.id, status: 'failed', detail: String(err) };
  }
}

/** Applique tout le plan, dans l'ordre ; renvoie un rapport par étape. */
export async function executePlan(
  plan: SeedPlan,
  opts: SeedOptions,
  fetchImpl: FetchLike,
  log: Logger = console.log,
): Promise<SeedReport> {
  const registry = new Map<string, string>();
  const results: StepResult[] = [];
  for (const step of plan.steps) {
    results.push(await executeStep(step, registry, opts, fetchImpl, log));
  }
  return { spaceKey: plan.spaceKey, results: Object.freeze(results) };
}

/** Rendu `--dry-run` : une ligne par requête, aucun réseau. */
export function renderPlan(plan: SeedPlan, opts: SeedOptions): readonly string[] {
  const base = `${opts.baseUrl.replace(/\/+$/, '')}${opts.apiPrefix}`;
  return plan.steps.map((step) => {
    const url = `${base}${renderRefs(step.path)}`;
    const ligne = `${step.method.padEnd(4)} ${url}  [${step.id}] (${step.kind})`;
    return step.note === undefined ? ligne : `${ligne} — ${step.note}`;
  });
}