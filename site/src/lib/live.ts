// Client du flux « live » : requête du webtrigger Forge, timeout, un nouvel
// essai, validation du contrat public, cache mémoire.
//
// Règle d'honnêteté du dépôt : une réponse qui ne respecte pas le contrat
// n'est JAMAIS interprétée comme des données — on bascule sur le snapshot et
// on dit pourquoi. Le contrat est versionné (`docs/api-live.schema.json`) :
// c'est le MÊME schéma que celui qui fait foi côté app.

import type { LiveContractPayload } from '@placard-wiki/domain';
import type { GiteCoverageRow, GiteCoverageState } from '@placard-wiki/domain';
import type { CoverageReportAffichee } from '../data/coverage.js';
import { LIVE_CACHE_TTL_MS, LIVE_RETRIES, LIVE_TIMEOUT_MS, liveApiUrl } from './live-config.js';
import { checkContract, CONTRACT_HEADER_NAME } from './contract.js';

/** État du flux : ce que l'indicateur d'honnêteté affiche. */
export type LiveStatus = 'live' | 'snapshot' | 'loading' | 'error';

/**
 * Raison d'un échec, affichée telle quelle dans l'indicateur.
 *
 * `contract-mismatch` : la réponse est arrivée, mais elle ne respecte plus le
 * contrat publié — c'est la raison pour laquelle le site ne l'affiche pas.
 */
export type LiveReason =
  | 'not-configured'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-shape'
  | 'contract-mismatch';

/**
 * La charge utile du webtrigger, vue par le site : le contrat, avec la
 * couverture normalisée pour l'affichage. La validation du contrat garantit
 * la forme ; la normalisation comble les champs facultatifs (couverture
 * sans pourcentage → indéterminée, jamais 0 %).
 */
export type LivePayload = Omit<LiveContractPayload, 'coverage'> & {
  readonly coverage: CoverageReportAffichee;
};

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
let cache: { payload: LivePayload; at: number } | null = null;

/**
 * État exporté du flux — mis à jour à chaque étape (chargement, live,
 * erreur). Une liaison de module : les consommateurs voient la valeur
 * courante sans avoir à s'abonner.
 */
export let liveState: LiveState = initialState();

/** État initial : pas d'URL configurée = snapshot assumé, sinon chargement. */
function initialState(): LiveState {
  return liveApiUrl() === ''
    ? { status: 'snapshot', data: null, reason: 'not-configured' }
    : { status: 'loading', data: null };
}

/** État courant du flux (subscription React via `subscribeLive`). */
export function getLiveState(): LiveState {
  return liveState;
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
  liveState = next;
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

/**
 * La réponse respecte-t-elle le contrat publié ?
 *
 * Le contrôle est fait par le schéma (`docs/api-live.schema.json`), pas par
 * une relecture à la main : c'est le MÊME schéma que celui qui fait foi
 * côté app. Une réponse qui ne le respecte pas est refusée — jamais
 * réinterprétée.
 */
export function parseLivePayload(raw: unknown, headerVersion?: string | null): LivePayload | null {
  if (!isObject(raw)) return null;
  const verdict = checkContract(raw, headerVersion);
  if (!verdict.ok) {
    console.warn(`[placard] contrat live non respecté : ${verdict.detail}`);
    return null;
  }
  const payload = raw as unknown as LiveContractPayload;
  return { ...payload, coverage: normalizeCoverage(payload.coverage) };
}

/** Une ligne de couverture, lue avec prudence (le flux peut être incomplet). */
function normalizeGiteRow(raw: unknown): GiteCoverageRow | null {
  if (!isObject(raw)) return null;
  const gite = knownGite(raw['gite']);
  if (gite === undefined) return null;
  const scanned = typeof raw['scanned'] === 'number' ? raw['scanned'] : 0;
  const skipped = typeof raw['skipped'] === 'number' ? raw['skipped'] : 0;
  const pagesRead = typeof raw['pagesRead'] === 'number' ? raw['pagesRead'] : scanned;
  const pagesUnread = typeof raw['pagesUnread'] === 'number' ? raw['pagesUnread'] : skipped;
  const pagesInaccessible = typeof raw['pagesInaccessible'] === 'number' ? raw['pagesInaccessible'] : 0;
  const state: GiteCoverageState = raw['state'] === 'read' || raw['state'] === 'unread' || raw['state'] === 'inaccessible' || raw['state'] === 'not-attempted'
    ? raw['state']
    : stateOfCounts(pagesRead, pagesUnread, pagesInaccessible);
  const reason = typeof raw['reason'] === 'string' ? raw['reason'] : undefined;
  return { gite, scanned, skipped, ...(reason !== undefined ? { reason } : {}), pagesRead, pagesUnread, pagesInaccessible, state };
}

/** Le gîte est-il l'un des sept connus ? */
function knownGite(value: unknown): GiteCoverageRow['gite'] | undefined {
  if (typeof value !== 'string') return undefined;
  return (['corps-de-page', 'commentaires', 'pieces-jointes', 'historique-de-versions', 'modeles-de-page', 'titres-et-etiquettes', 'description-espace'] as const)
    .includes(value as GiteCoverageRow['gite'])
    ? (value as GiteCoverageRow['gite'])
    : undefined;
}

/** L'état déduit des compteurs, quand le flux ne transporte pas `state`. */
function stateOfCounts(read: number, unread: number, inaccessible: number): GiteCoverageState {
  if (inaccessible > 0) return 'inaccessible';
  if (unread > 0) return 'unread';
  if (read > 0) return 'read';
  return 'not-attempted';
}

/**
 * Normalise la couverture du flux live : les champs du pourcentage et de la
 * méthode sont lus s'ils existent ; sinon la couverture est INDÉTERMINÉE
 * (`coveragePercent` null — jamais 0 %). Les lignes de gîte inconnues sont
 * écartées : elles ne sont pas un gîte du §6.
 */
function normalizeCoverage(raw: unknown): CoverageReportAffichee {
  if (!isObject(raw)) return emptyCoverage();
  const perGite = (Array.isArray(raw['perGite']) ? raw['perGite'] : [])
    .map(normalizeGiteRow)
    .filter((row): row is GiteCoverageRow => row !== null);
  const coveragePercent = typeof raw['coveragePercent'] === 'number' ? raw['coveragePercent'] : null;
  const gitesCovered = typeof raw['gitesCovered'] === 'number'
    ? raw['gitesCovered']
    : perGite.filter((row) => row.pagesRead > 0).length;
  const gitesTotal = typeof raw['gitesTotal'] === 'number' ? raw['gitesTotal'] : perGite.length;
  const pagesRead = typeof raw['pagesRead'] === 'number'
    ? raw['pagesRead']
    : perGite.reduce((total, row) => total + row.pagesRead, 0);
  const pagesTargeted = typeof raw['pagesTargeted'] === 'number'
    ? raw['pagesTargeted']
    : Math.max(0, ...perGite.map((row) => row.pagesRead + row.pagesUnread + row.pagesInaccessible));
  const method = typeof raw['method'] === 'string' ? raw['method']
    : '(flux live sans méthode de couverture — la couverture par gîte n’est pas encore mesurée)';
  return {
    perGite,
    blindSpots: stringList(raw['blindSpots']),
    missingRights: stringList(raw['missingRights']),
    coveragePercent,
    gitesCovered,
    gitesTotal,
    method,
    pagesRead,
    pagesTargeted,
    ...(typeof raw['lastPassAt'] === 'string' ? { lastPassAt: raw['lastPassAt'] } : {}),
  };
}

/** Couverture vide : aucun champ porté — indéterminée, déclarée. */
function emptyCoverage(): CoverageReportAffichee {
  return {
    perGite: [],
    blindSpots: [],
    missingRights: [],
    coveragePercent: null,
    gitesCovered: 0,
    gitesTotal: 0,
    method: '',
    pagesRead: 0,
    pagesTargeted: 0,
  };
}

/** Une liste de chaînes, lue avec prudence. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Une tentative réseau : charge utile brute, ou raison d'échec. */
type Attempt = { ok: true; payload: LivePayload } | { ok: false; reason: LiveReason };

/** L'en-tête qui porte la version du contrat, lu sans faire confiance. */
function headerVersionOf(response: Response): string | null {
  const value = response.headers?.get?.(CONTRACT_HEADER_NAME);
  return typeof value === 'string' ? value : null;
}

/** Une seule requête, avec annulation au bout du timeout. */
async function attemptFetch(url: string, options: FetchLiveOptions): Promise<Attempt> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? LIVE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { ok: false, reason: 'http' };
    const body: unknown = await response.json();
    if (!isObject(body)) return { ok: false, reason: 'invalid-shape' };
    const payload = parseLivePayload(body, headerVersionOf(response));
    if (!payload) return { ok: false, reason: 'contract-mismatch' };
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
    // Un contrat non respecté ne se rejouera pas : inutile de réessayer.
    if (reason === 'contract-mismatch' || reason === 'invalid-shape') break;
  }
  setState({ status: 'error', data: null, reason });
  return { ok: false, payload: null, reason };
}
