// Configuration du flux « live » : l'URL du webtrigger Forge qui sert le
// JSON scanné. Tant que l'URL est vide, le site reste en mode SNAPSHOT
// (données embarquées) — le build statique ne dépend JAMAIS du réseau.
//
// L'URL réelle est collée par une PR d'intégration dans `LIVE_API_URL` ; un
// override de build `VITE_LIVE_API` permet de tester sans toucher au code.

/** URL de l'API live (webtrigger Forge). Vide = mode snapshot. */
export const LIVE_API_URL = '';

/** Timeout d'une requête live (ms) — au-delà, on bascule sur le snapshot. */
export const LIVE_TIMEOUT_MS = 8000;

/** Nombre de nouvel essai après un échec réseau (1 = deux tentatives). */
export const LIVE_RETRIES = 1;

/** Période d'auto-refresh en mode live (ms) — 2 minutes. */
export const LIVE_REFRESH_MS = 120_000;

/** Durée de vie du cache mémoire d'une réponse live réussie (ms). */
export const LIVE_CACHE_TTL_MS = 30_000;

/** Nom du site de démonstration Atlassian balayé (affiché dans l'indicateur). */
export const DEMO_SITE_NAME = 'one-atlas-cndz';

/** Espace de démonstration qui contient les FAUX secrets. */
export const DEMO_SPACE_KEY = 'PLACARDDEMO';

/** Lit une variable d'environnement de build sans jamais typer `any`. */
function envOverride(): string {
  const env = import.meta.env as unknown as Record<string, unknown> | undefined;
  const value = env?.['VITE_LIVE_API'];
  return typeof value === 'string' ? value.trim() : '';
}

/** URL effective du flux live : override de build, sinon constante du dépôt. */
export function liveApiUrl(): string {
  const override = envOverride();
  return override !== '' ? override : LIVE_API_URL.trim();
}
