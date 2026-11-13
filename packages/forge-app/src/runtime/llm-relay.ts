/**
 * La jambe modèle de l'app : le **relais InferHub** (§19, PW-24).
 *
 * Pourquoi un relais et pas un appel direct : Forge n'accepte, pour
 * l'authentification externe, que des providers `oauth2` — or la clé
 * InferHub est une clé statique `sk-…`, sans place dans ce schéma. Le
 * relais (r630) garde la clé **hors d'Atlassian** : l'app Forge lui parle
 * en HTTPS avec un jeton de service, le relais appelle InferHub avec la
 * clé, et rend la réponse telle quelle (format compatible OpenAI).
 *
 * Règles tenues par ce module :
 *   - l'invite envoyée est **masquée** (le masque est fait en amont, dans
 *     `@placard-wiki/detectors`) : aucune valeur brute ne sort de la
 *     machine qui porte la clé ;
 *   - le jeton n'est **jamais journalisé** ;
 *   - un échec du relais n'est jamais un échec silencieux : il est
 *     journalisé, et l'appelant retombe sur le LLM hébergé de Forge.
 *
 * Configuration (variables statiques Forge, hors du dépôt) :
 *   PLACARD_RELAY_URL    l'URL du relais (schéma HTTPS obligatoire) ;
 *   PLACARD_RELAY_TOKEN  le jeton de service présenté au relais.
 */

import { fetch } from '@forge/api';

import { configVariable } from './secret';

/** Variable Forge qui porte l'URL du relais. */
export const RELAY_URL_VARIABLE = 'PLACARD_RELAY_URL';

/** Variable Forge qui porte le jeton de service du relais. */
export const RELAY_TOKEN_VARIABLE = 'PLACARD_RELAY_TOKEN';

/** Délai maximal d'un appel au relais (ms) — le relais en impose un lui aussi. */
const RELAY_TIMEOUT_MS = 20_000;

/** Ce que le relais a répondu : le texte, et les jetons s'il les annonce. */
export interface RelayAnswer {
  readonly text: string;
  readonly tokens: number | null;
}

/** Le relais est-il configuré ? (variables présentes ET URL utilisable) */
export function relayConfigured(): boolean {
  const url = configVariable(RELAY_URL_VARIABLE);
  const token = configVariable(RELAY_TOKEN_VARIABLE);
  if (url === undefined || token === undefined) return false;
  return /^https:\/\/[^\s]+$/.test(url.value);
}

/** L'URL de l'endpoint de chat du relais, ou null si mal configurée. */
function endpointUrl(): string | null {
  const url = configVariable(RELAY_URL_VARIABLE);
  if (url === undefined) return null;
  const base = url.value.replace(/\/+$/, '');
  return /^https:\/\/[^\s]+$/.test(base) ? `${base}/v1/chat/completions` : null;
}

/** Le texte d'une réponse compatible OpenAI (une seule forme ici). */
function texteDe(reponse: unknown): string {
  const choix = (reponse as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? [];
  const contenu = choix[0]?.message?.content;
  return typeof contenu === 'string' ? contenu : '';
}

/** Les jetons annoncés par le relais, s'il en annonce. */
function jetonsDe(reponse: unknown): number | null {
  const usage = (reponse as { usage?: { total_tokens?: unknown } }).usage;
  return typeof usage?.total_tokens === 'number' ? usage.total_tokens : null;
}

/**
 * Pose une question au relais.
 *
 * Renvoie `null` si le relais n'est pas configuré, s'il refuse (401), s'il
 * ne répond pas dans le délai, ou si sa réponse est illisible. **Jamais
 * d'exception** : l'appelant décide du repli.
 */
export async function askRelay(system: string, user: string): Promise<RelayAnswer | null> {
  const url = endpointUrl();
  const token = configVariable(RELAY_TOKEN_VARIABLE);
  if (url === null || token === undefined) return null;

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), RELAY_TIMEOUT_MS);
  try {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
      }),
      signal: controleur.signal,
    });
    if (!reponse.ok) {
      console.warn(`[placard] relais LLM : refus ${String(reponse.status)} — repli sur le LLM hébergé`);
      return null;
    }
    const corps: unknown = await reponse.json();
    const text = texteDe(corps);
    if (text === '') {
      console.warn('[placard] relais LLM : réponse vide — repli sur le LLM hébergé');
      return null;
    }
    const tokens = jetonsDe(corps);
    console.info(`[placard] relais LLM : réponse reçue (${String(text.length)} caractères, ${String(tokens ?? '?')} jetons)`);
    return { text, tokens };
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : 'erreur';
    console.warn(`[placard] relais LLM : appel en échec (${nom}) — repli sur le LLM hébergé`);
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}
