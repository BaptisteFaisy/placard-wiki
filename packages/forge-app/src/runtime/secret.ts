/**
 * La clé HMAC de l'installation (§4, §23).
 *
 * Elle doit être **stable entre les invocations** : une clé régénérée à chaque
 * exécution ferait dériver toutes les empreintes (le même secret aurait une
 * empreinte différente selon la passe) et le suivi des foyers deviendrait
 * faux. Elle est donc générée UNE fois, puis persistée.
 *
 * Ordre de résolution (documenté dans `docs/VALIDATION-22.md`) :
 *  1. **variable statique Forge** (`forge variables set PW_HMAC_KEY …`) : lue
 *     dans `process.env.FORGE_VARIABLES`, injectée par la plateforme ;
 *  2. **table technique `app_secret`** du store Forge SQL : la clé y est
 *     générée au premier passage puis relue à chaque invocation ;
 *  3. **repli** : une clé dérivée de l'identifiant d'installation — stable
 *     mais devinable ; le journal signale alors la source (`repli`).
 *
 * La valeur n'est jamais journalisée, ni renvoyée par un webtrigger, ni
 * écrite dans le dépôt.
 */

/** Nom de la variable statique Forge qui porte la clé (le nom est public). */
export const HMAC_VARIABLE = 'PW_HMAC_KEY';

/** Nom de la ligne technique dans la table `app_secret`. */
export const HMAC_SECRET_NAME = 'pw-hmac-key';

/** Taille de la clé : 32 octets (256 bits), en hexadécimal. */
const KEY_BYTES = 32;

/** Génère une clé aléatoire de 256 bits (Web Crypto du runtime Node 22). */
export function generateHmacKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lit une variable statique Forge (JSON des variables de l'environnement). */
export function staticVariable(name: string): string | undefined {
  const raw = process.env['FORGE_VARIABLES'];
  if (raw === undefined || raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Source de la clé — journalisée pour la traçabilité, jamais la valeur. */
export type HmacSource = 'variable-forge' | 'sql-app_secret' | 'repli-installation';
