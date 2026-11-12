/**
 * Enregistreurs — ce que la preuve **observe** pendant un balayage.
 *
 * Trois observations, trois questions :
 *  - l'oracle : quelles questions ont été posées ? (aucune valeur ne doit y
 *    figurer — le contexte est masqué) ;
 *  - la console : qu'a dit le balayage ? (aucune valeur ne doit y figurer) ;
 *  - le réseau : une sortie HTTP a-t-elle été tentée ? (jamais, pendant une
 *    passe : le balayage ne parle qu'au wiki).
 *
 * Aucun de ces enregistreurs ne conserve la valeur qu'il a vue : il ne garde
 * que des textes **déjà masqués** ou des métadonnées d'appel.
 */

import { createCachedOracle } from '@placard-wiki/detectors';
import type { CachedOracle, LlmOracle, LlmOracleQuestion } from '@placard-wiki/detectors';

/** L'oracle de test : il note les questions, il n'appelle aucun modèle. */
export interface RecordingOracle {
  oracle: CachedOracle;
  questions: LlmOracleQuestion[];
}

/** Oracle factice qui conserve les questions posées (jamais les valeurs). */
export function recordingOracle(hmacKey: string): RecordingOracle {
  const questions: LlmOracleQuestion[] = [];
  const fake: LlmOracle = async (question: LlmOracleQuestion) => {
    questions.push(question);
    return { isSecret: true, reasonFr: 'oracle de test — contexte masqué', confidence: 1 };
  };
  return { oracle: createCachedOracle(fake, { hmacKey }), questions };
}

/** Ce que la console a dit pendant la passe. */
export interface ConsoleCapture {
  logs: string[];
}

/** Capture la console pendant l'exécution d'une fonction, puis la rend. */
export async function captureConsole<T>(
  run: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const saved = methods.map((method) => [method, console[method]] as const);
  for (const method of methods) {
    console[method] = (...args: unknown[]): void => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };
  }
  try {
    const result = await run();
    return { result, logs };
  } finally {
    for (const [method, original] of saved) console[method] = original;
  }
}

/** Le blockade du réseau global : toute sortie HTTP devient une erreur visible. */
export interface NetworkBlocker {
  /** Les URL tentées (doit rester vide). */
  calls: string[];
  /** Remet le `fetch` d'origine. */
  restore(): void;
}

/** Bloque `fetch` : le balayage ne doit jamais sortir par là. */
export function blockNetwork(): NetworkBlocker {
  const calls: string[] = [];
  const original = globalThis.fetch;
  const bloque = ((input: unknown): Promise<Response> => {
    calls.push(String(input));
    return Promise.reject(new Error('réseau bloqué pendant la preuve de non-fuite'));
  }) as typeof globalThis.fetch;
  globalThis.fetch = bloque;
  return {
    calls,
    restore(): void {
      globalThis.fetch = original;
    },
  };
}
