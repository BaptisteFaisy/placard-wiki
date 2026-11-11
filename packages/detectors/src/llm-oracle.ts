/**
 * Port `LlmOracle` (cahier §7, §14) : le LLM ne tranche que les candidats
 * **ambigus** — prose personnelle (famille 9) et tableaux d'identifiants
 * (famille 11), plus les cas où le contexte décide (exemple de documentation
 * ou vraie valeur).
 *
 * Trois disciplines non négociables :
 *  - **injectable** : aucun appel réel ici ; le transport (LLM hébergé Forge)
 *    est branché par le lot `forge-app`. Les tests n'appellent jamais de LLM ;
 *  - **cache par empreinte de contenu** : la même question ne coûte qu'une
 *    fois (§14 : ~1 % de candidats ambigus sur 50 000 pages) ;
 *  - **invite sans valeur brute** : le contexte est masqué par intervalles
 *    (`[REDACTED:famille]`), la valeur n'apparaît jamais dans l'invite.
 */

import { computeFingerprint } from '@placard/core';

import type { DetectionCandidate } from './types.js';

/** La question posée à l'oracle — uniquement du contenu masqué. */
export interface LlmOracleQuestion {
  /** Empreinte du contenu de la question : clé de cache, sans valeur brute. */
  contentFingerprint: string;
  ruleId: string;
  family: string;
  maskedPreview: string;
  /** Contexte masqué : le texte autour, la valeur remplacée par un marqueur. */
  maskedContext: string;
}

/** Le verdict de l'oracle : une décision et sa raison, jamais une valeur. */
export interface LlmOracleVerdict {
  /** Le contexte indique-t-il un secret réel (plutôt qu'un exemple) ? */
  isSecret: boolean;
  /** Raison affichable (le score montre ses termes, §8). */
  reasonFr: string;
  /** Confiance du verdict entre 0 et 1. */
  confidence: number;
}

/** Le port : une fonction, aucun transport imposé, aucun appel réel ici. */
export type LlmOracle = (question: LlmOracleQuestion) => Promise<LlmOracleVerdict>;

/** Verdict enrichi de son origine (cache ou appel), pour l'écran de budget. */
export interface OracleAnswer extends LlmOracleVerdict {
  fromCache: boolean;
}

/** Statistiques du cache, affichées dans le budget de balayage (§14). */
export interface OracleStats {
  calls: number;
  cacheHits: number;
  entries: number;
}

/** Masque un texte par intervalles : la valeur ne reste nulle part. */
export function maskSpans(
  text: string,
  spans: ReadonlyArray<{ charStart: number; charEnd: number; family: string }>,
): string {
  const sorted = [...spans]
    .filter((span) => span.charEnd > span.charStart)
    .sort((a, b) => a.charStart - b.charStart);
  let out = '';
  let cursor = 0;
  for (const span of sorted) {
    if (span.charStart < cursor) continue; // intervalles chevauchants : le premier gagne
    out += text.slice(cursor, Math.min(span.charStart, text.length));
    out += `[REDACTED:${span.family}]`;
    cursor = Math.min(span.charEnd, text.length);
  }
  return out + text.slice(cursor);
}

/** Construit la question : empreinte de contenu + contexte masqué, jamais la valeur. */
export function buildQuestion(
  candidate: DetectionCandidate,
  maskedContext: string,
  hmacKey: string,
): LlmOracleQuestion {
  const contentFingerprint = computeFingerprint(
    `${candidate.ruleId}\n${candidate.maskedPreview}\n${maskedContext}`,
    hmacKey,
  );
  return {
    contentFingerprint,
    ruleId: candidate.ruleId,
    family: candidate.family,
    maskedPreview: candidate.maskedPreview,
    maskedContext,
  };
}

/** Invite système : le cadre posé au modèle, sans aucune donnée de valeur. */
export const ORACLE_SYSTEM_PROMPT_FR = [
  'Tu aides un outil de sécurité à trancher un candidat ambigu trouvé dans un wiki.',
  'Le contexte est masqué : les valeurs détectées y sont remplacées par [REDACTED:famille].',
  'Réponds uniquement en JSON : {"isSecret": boolean, "reasonFr": string, "confidence": number}.',
  'isSecret=false si le contexte indique un exemple, une documentation, un test ou un gabarit ;',
  'isSecret=true si le contexte indique une vraie valeur opérationnelle (runbook, accès réel).',
  'Ne demande jamais la valeur brute, ne la devine pas, ne la reformule pas.',
].join('\n');

/** Options du cache : clé HMAC (empreintes) et borne d'entrées. */
export interface OracleCacheOptions {
  hmacKey: string;
  maxEntries?: number;
}

/** Oracle mis en cache par empreinte de contenu (§14). */
export interface CachedOracle {
  ask(question: LlmOracleQuestion): Promise<OracleAnswer>;
  stats(): OracleStats;
}

/**
 * Enveloppe un oracle injectable d'un cache par empreinte de contenu.
 * Les entrées en vol sont partagées : deux candidats identiques dans la même
 * passe ne déclenchent qu'un appel.
 */
/** Verdict de repli quand l'oracle échoue : prudence, confiance nulle. */
function fallbackVerdict(): OracleAnswer {
  return {
    isSecret: true,
    reasonFr: 'oracle LLM indisponible — candidat maintenu par prudence',
    confidence: 0,
    fromCache: false,
  };
}

/** État mutable du cache : empreinte de contenu → verdict. */
interface OracleCacheState {
  maxEntries: number;
  cache: Map<string, LlmOracleVerdict>;
  inflight: Map<string, Promise<LlmOracleVerdict>>;
  calls: number;
  cacheHits: number;
}

/** Range un verdict, en évinçant la plus ancienne empreinte si le cache est plein. */
function storeVerdict(state: OracleCacheState, key: string, verdict: LlmOracleVerdict): void {
  if (state.cache.size >= state.maxEntries) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== undefined) state.cache.delete(oldest);
  }
  state.cache.set(key, verdict);
}

/** Attente d'un appel en vol partagé : même empreinte, même réponse. */
async function awaitPending(state: OracleCacheState, pending: Promise<LlmOracleVerdict>): Promise<OracleAnswer> {
  state.cacheHits += 1;
  try {
    return { ...(await pending), fromCache: true };
  } catch {
    return fallbackVerdict();
  }
}

/**
 * Pose la question à l'oracle, cache compris. En cas d'échec, rien n'est mis
 * en cache : un prochain balayage réessaiera (§23 : le candidat reste ambigu,
 * jamais deviné).
 */
async function askWithState(
  state: OracleCacheState,
  oracle: LlmOracle,
  question: LlmOracleQuestion,
): Promise<OracleAnswer> {
  const key = question.contentFingerprint;
  const cached = state.cache.get(key);
  if (cached !== undefined) {
    state.cacheHits += 1;
    return { ...cached, fromCache: true };
  }
  const pending = state.inflight.get(key);
  if (pending !== undefined) return awaitPending(state, pending);
  state.calls += 1;
  const promise = (async () => {
    const verdict = await oracle(question);
    storeVerdict(state, key, verdict);
    return verdict;
  })();
  state.inflight.set(key, promise);
  try {
    return { ...(await promise), fromCache: false };
  } catch {
    return fallbackVerdict();
  } finally {
    state.inflight.delete(key);
  }
}

export function createCachedOracle(oracle: LlmOracle, options: OracleCacheOptions): CachedOracle {
  const state: OracleCacheState = {
    maxEntries: options.maxEntries ?? 1000,
    cache: new Map(),
    inflight: new Map(),
    calls: 0,
    cacheHits: 0,
  };
  return {
    ask: (question) => askWithState(state, oracle, question),
    stats: () => ({ calls: state.calls, cacheHits: state.cacheHits, entries: state.cache.size }),
  };
}
