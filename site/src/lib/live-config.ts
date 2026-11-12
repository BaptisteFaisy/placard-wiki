// Configuration du flux « live » : l'URL du webtrigger Forge qui sert le
// JSON scanné. Tant que l'URL est vide, le site reste en mode SNAPSHOT
// (données embarquées) — le build statique ne dépend JAMAIS du réseau.
//
// L'URL réelle est collée par une PR d'intégration dans `LIVE_API_URL` ; un
// override de build `VITE_LIVE_API` permet de tester sans toucher au code.

/** URL de l'API live (webtrigger Forge). Vide = mode snapshot. */
export const LIVE_API_URL =
  'https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI';

/** Timeout d'une requête live (ms) — au-delà, on bascule sur le snapshot.
 * Mesuré le 12/11 : un balayage réel de l'espace répond en ~8 s (55 s au
 * pire côté plateforme) ; 8 s faisait basculer la démo en snapshot une fois
 * sur deux. 30 s laisse la place à une passe complète, puis 60 s de
 * rafraîchissement gardent la donnée « en temps réel ».
 */
export const LIVE_TIMEOUT_MS = 30_000;

/** Nombre de nouvel essai après un échec réseau (1 = deux tentatives). */
export const LIVE_RETRIES = 1;

/** Période d'auto-refresh en mode live (ms) — 1 minute (temps réel).
 * La plateforme plafonne le webtrigger public à 300 requêtes par fenêtre :
 * 1 par minute et par visiteur reste très en deçà.
 */
export const LIVE_REFRESH_MS = 60_000;

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
