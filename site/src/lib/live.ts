// Client du flux « live » : requête du webtrigger Forge, timeout, un nouvel
// essai, validation minimale de forme, cache mémoire.
//
// Règle d'honnêteté du dépôt : une réponse invalide n'est JAMAIS interpretée
// comme des données — on bascule sur le snapshot et on dit pourquoi.

import type { BuildingModel, Certificate, CoverageReport, Foyer, RegistryRow, ScanBudget } from '@placard-wiki/domain';
import { LIVE_CACHE_TTL_MS, LIVE_RETRIES, LIVE_TIMEOUT_MS, liveApiUrl } from './live-config.js';

/** État du flux : ce que l'indicateur d'honnêteté affiche. */
export type LiveStatus = 'live' | 'snapshot' | 'loading' | 'error';

/** Raison d'un échec, affichée telle quelle dans l'indicateur. */
export type LiveReason = 'not-configured' | 'timeout' | 'network' | 'http' | 'invalid-shape';

/** Métadonnées du site balayé — forme volontairement tolérante. */
export interface LiveSite {
  readonly name?: string;
  readonly url?: string;
  readonly spaceKeys?: readonly string[];
}

/** Charge utile du webtrigger : les structures du domaine, telles quelles. */
export interface LivePayload {
  readonly generatedAt: string;
  readonly mode: 'live';
  readonly site: LiveSite;
  readonly registry: readonly RegistryRow[];
  readonly building: BuildingModel;
  readonly foyers: Record<string, Foyer>;
  readonly budget: ScanBudget;
  readonly coverage: CoverageReport;
  readonly certificate: Certificate;
}

/** État exporté : source des données, raison d'un échec, horodatage du scan. */
export interface LiveState {
  readonly status: LiveStatus;
  readonly data: LivePayload | null;
  readonly reason?: LiveReason;
  readonly generatedAt?: string;
}

/** Résultat d'une tentative : succès (payload) ou échec (raison). */
export interface LiveFetchResult {
  readonly ok: boolean;
  readonly payload: LivePayload | null;
  readonly reason: LiveReason | null;
}

/** Options de fetch — injectables pour les tests (fetch mocké). */
export interface FetchLiveOptions {
  readonly url?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly force?: boolean;
  readonly now?: () => number;
}

const listeners = new Set<() => void>();
let state: LiveState = initialState();
let cache: { payload: LivePayload; at: number } | null = null;

/** État initial : pas d'URL configurée = snapshot assumé, sinon chargement. */
function initialState(): LiveState {
  return liveApiUrl() === ''
    ? { status: 'snapshot', data: null, reason: 'not-configured' }
    : { status: 'loading', data: null };
}

/** État courant du flux (subscription React via `subscribeLive`). */
export function getLiveState(): LiveState {
  return state;
}

/** Abonnement aux changements d'état — renvoie la fonction de désabonnement. */
export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Remplace l'état et prévient les abonnés. */
function setState(next: LiveState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Vide le cache mémoire (tests, ou retour forcé au snapshot). */
export function resetLiveCache(): void {
  cache = null;
}

/** Un objet simple est-il un objet (ni null, ni tableau) ? */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lit un tableau de chaînes, sinon une liste vide. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Extrait les métadonnées du site, sans faire confiance à la forme exacte. */
function parseSite(raw: unknown): LiveSite {
  if (!isObject(raw)) return {};
  const name = typeof raw['name'] === 'string' ? raw['name'] : typeof raw['siteName'] === 'string' ? raw['siteName'] : undefined;
  const url = typeof raw['url'] === 'string' ? raw['url'] : typeof raw['baseUrl'] === 'string' ? raw['baseUrl'] : undefined;
  const spaceKeys = stringList(raw['spaceKeys']);
  const spaces = Array.isArray(raw['spaces']) ? raw['spaces'] : [];
  const fromSpaces = spaces
    .map((space) => (typeof space === 'string' ? space : isObject(space) && typeof space['key'] === 'string' ? space['key'] : undefined))
    .filter((key): key is string => key !== undefined);
  const keys = spaceKeys.length > 0 ? spaceKeys : fromSpaces;
  return { ...(name !== undefined ? { name } : {}), ...(url !== undefined ? { url } : {}), ...(keys.length > 0 ? { spaceKeys: keys } : {}) };
}

/**
 * Validation MINIMALE de la forme : les clés attendues par le contrat, avec le
 * bon type de premier niveau. Une réponse qui ne respecte pas le contrat est
 * rejetée — jamais reinterpretée.
 */
export function parseLivePayload(raw: unknown): LivePayload | null {
  if (!isObject(raw)) return null;
  if (typeof raw['generatedAt'] !== 'string') return null;
  if (raw['mode'] !== 'live') return null;
  if (!isObject(raw['site'])) return null;
  if (!Array.isArray(raw['registry'])) return null;
  if (!isObject(raw['building'])) return null;
  if (!isObject(raw['foyers'])) return null;
  if (!isObject(raw['budget'])) return null;
  if (!isObject(raw['coverage'])) return null;
  if (!isObject(raw['certificate'])) return null;
  return {
    generatedAt: raw['generatedAt'],
    mode: 'live',
    site: parseSite(raw['site']),
    registry: raw['registry'] as unknown as RegistryRow[],
    building: raw['building'] as unknown as BuildingModel,
    foyers: raw['foyers'] as unknown as Record<string, Foyer>,
    budget: raw['budget'] as unknown as ScanBudget,
    coverage: raw['coverage'] as unknown as CoverageReport,
    certificate: raw['certificate'] as unknown as Certificate,
  };
}

/** Une tentative réseau : charge utile brute, ou raison d'échec. */
type Attempt = { ok: true; payload: LivePayload } | { ok: false; reason: LiveReason };

/** Une seule requête, avec annulation au bout du timeout. */
async function attemptFetch(url: string, options: FetchLiveOptions): Promise<Attempt> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? LIVE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { ok: false, reason: 'http' };
    const payload = parseLivePayload(await response.json());
    if (!payload) return { ok: false, reason: 'invalid-shape' };
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requête le flux live : cache mémoire d'abord, puis tentatives avec timeout
 * et un nouvel essai. L'état exporté est mis à jour à chaque étape.
 */
export async function fetchLive(options: FetchLiveOptions = {}): Promise<LiveFetchResult> {
  const url = options.url ?? liveApiUrl();
  const now = options.now ?? (() => Date.now());
  if (url === '') {
    setState({ status: 'snapshot', data: null, reason: 'not-configured' });
    return { ok: false, payload: null, reason: 'not-configured' };
  }
  if (!options.force && cache !== null && now() - cache.at < LIVE_CACHE_TTL_MS) {
    setState({ status: 'live', data: cache.payload, generatedAt: cache.payload.generatedAt });
    return { ok: true, payload: cache.payload, reason: null };
  }
  const attempts = Math.max(0, options.retries ?? LIVE_RETRIES) + 1;
  let reason: LiveReason = 'network';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const outcome = await attemptFetch(url, options);
    if (outcome.ok) {
      cache = { payload: outcome.payload, at: now() };
      setState({ status: 'live', data: outcome.payload, generatedAt: outcome.payload.generatedAt });
      return { ok: true, payload: outcome.payload, reason: null };
    }
    reason = outcome.reason;
    if (reason === 'invalid-shape') break;
  }
  setState({ status: 'error', data: null, reason });
  return { ok: false, payload: null, reason };
}
