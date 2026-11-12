/**
 * La clé HMAC de l'installation (§4, §23) et le namespace d'empreinte (PW-31).
 *
 * Elle doit être **stable entre les invocations** : une clé régénérée à chaque
 * exécution ferait dériver toutes les empreintes (le même secret aurait une
 * empreinte différente selon la passe) et le suivi des foyers deviendrait
 * faux. Elle est donc générée UNE fois, puis persistée.
 *
 * Ordre de résolution (documenté dans `docs/VALIDATION-22.md`) :
 *  1. **namespace partagé** (opt-in, PW-31) : la clé partagée posée par
 *     l'administrateur, dérivée avec l'identifiant du namespace — c'est la
 *     seule façon, pour le wiki, de produire une empreinte comparable à celle
 *     d'une autre surface (Git, Jira) ;
 *  2. **variable statique Forge** (`forge variables set PW_HMAC_KEY …`) : lue
 *     dans `process.env.FORGE_VARIABLES`, injectée par la plateforme ;
 *  3. **table technique `app_secret`** du store Forge SQL : la clé y est
 *     générée au premier passage puis relue à chaque invocation ;
 *  4. **repli** : une clé dérivée de l'identifiant d'installation — stable
 *     mais devinable ; le journal signale alors la source (`repli`).
 *
 * La valeur n'est jamais journalisée, ni renvoyée par un webtrigger, ni
 * écrite dans le dépôt — pas plus la clé partagée du namespace.
 */

import {
  NAMESPACE_ID_VARIABLE,
  NAMESPACE_KEY_VARIABLE,
  resolveNamespace,
} from '@placard-wiki/surfaces';
import type { FingerprintNamespace, NamespaceSource } from '@placard-wiki/surfaces';

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
export type HmacSource = 'namespace-partage' | 'variable-forge' | 'sql-app_secret' | 'repli-installation';

/**
 * Lit une variable de configuration : d'abord la variable statique Forge,
 * puis `process.env` (déploiement hors Forge, outillage, tests).
 *
 * La **source** est renvoyée avec la valeur pour qu'elle puisse être
 * journalisée ; la valeur, elle, ne l'est jamais.
 */
export function configVariable(
  name: string,
): { value: string; source: 'forge-variable' | 'process-env' } | undefined {
  const fromForge = staticVariable(name);
  if (fromForge !== undefined) return { value: fromForge, source: 'forge-variable' };
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== '') return { value: fromEnv, source: 'process-env' };
  return undefined;
}

/** La configuration du namespace d'empreinte, lue sans jamais la journaliser. */
export interface NamespaceSetup {
  /** L'état du namespace (partagé ou non). */
  namespace: FingerprintNamespace;
  /** La clé partagée — à ne jamais journaliser ni exposer. */
  sharedKey?: string;
}

/**
 * Lit la configuration du namespace d'empreinte partagé (PW-31).
 *
 * Deux variables, des deux côtés (wiki **et** dépôt Git) :
 * `PW_FINGERPRINT_NAMESPACE_KEY` (le secret partagé) et
 * `PW_FINGERPRINT_NAMESPACE` (l'identifiant du namespace, ex. le site
 * Atlassian ou l'organisation).
 *
 * Sans clé partagée → le namespace reste propre à l'installation : les
 * empreintes ne sont pas comparables, et c'est le comportement voulu.
 * Clé sans identifiant → le partage reste désactivé, avec une raison écrite
 * (`namespace.warning`) : on ne devine pas à la place de l'administrateur.
 */
export function readNamespaceSetup(installationId: string): NamespaceSetup {
  const key = configVariable(NAMESPACE_KEY_VARIABLE);
  const id = configVariable(NAMESPACE_ID_VARIABLE);
  const source: NamespaceSource = key?.source ?? id?.source ?? 'absent';
  const namespace = resolveNamespace({
    installationId,
    source,
    ...(key !== undefined ? { sharedKey: key.value } : {}),
    ...(id !== undefined ? { namespaceId: id.value } : {}),
  });
  return { namespace, ...(key !== undefined ? { sharedKey: key.value } : {}) };
}
