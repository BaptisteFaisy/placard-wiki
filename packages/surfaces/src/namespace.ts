/**
 * Le namespace d'empreinte (PW-31) — le partage, **opt-in**.
 *
 * Par défaut, l'empreinte d'un secret est propre à l'installation : la clé
 * HMAC est celle de l'app (variable Forge, table `app_secret`, ou repli sur
 * l'identifiant d'installation). Deux installations sur le même site ont donc
 * des empreintes **non comparables** — c'est voulu, et c'est le cahier
 * (§4) qui le dit.
 *
 * Pour la vision multi-surfaces (« ce secret a fui là, là et là »), il faut un
 * **namespace partagé explicite** : l'administrateur pose, des deux côtés,
 *
 *  - `PW_FINGERPRINT_NAMESPACE_KEY` : la clé partagée (un secret) ;
 *  - `PW_FINGERPRINT_NAMESPACE` : l'identifiant du namespace (ex. le site
 *    Atlassian ou l'organisation — une donnée publique, pas un secret).
 *
 * La clé HMAC **effective** n'est pas la clé partagée : c'est
 * `HMAC-SHA-256(clé partagée, identifiant du namespace)`. Deux installations
 * qui partagent la clé **et** l'identifiant produisent donc la même clé, donc
 * la même empreinte pour le même secret ; deux namespaces différents ne se
 * comparent pas, même quand la clé partagée est la même — et le produit le
 * dit au lieu de laisser croire à une absence.
 *
 * Sans clé partagée, le comportement est **inchangé** : clé propre à
 * l'installation, empreintes non comparables.
 */

import { createHmac } from 'node:crypto';

/** Variable de configuration qui porte la clé partagée (un secret). */
export const NAMESPACE_KEY_VARIABLE = 'PW_FINGERPRINT_NAMESPACE_KEY';

/** Variable de configuration qui porte l'identifiant du namespace (public). */
export const NAMESPACE_ID_VARIABLE = 'PW_FINGERPRINT_NAMESPACE';

/** D'où vient la configuration du namespace — journalisée, jamais la valeur. */
export type NamespaceSource = 'forge-variable' | 'process-env' | 'absent';

/** L'état du namespace d'empreinte de l'installation. */
export interface FingerprintNamespace {
  /**
   * L'identifiant du namespace. Hors partage, c'est
   * `installation:<identifiant>` — propre à l'installation, donc jamais
   * comparable avec une autre installation.
   */
  id: string;
  /** Le namespace est-il partagé entre installations et surfaces ? */
  shared: boolean;
  /** Source de la configuration (jamais la valeur). */
  source: NamespaceSource;
  /** Raison écrite quand un partage demandé n'a pas pu être établi. */
  warning?: string;
}

/** Configuration brute lue dans la configuration d'installation. */
export interface NamespaceConfig {
  /** La clé partagée — absente → pas de partage. */
  sharedKey?: string;
  /** L'identifiant du namespace. */
  namespaceId?: string;
  /** L'identifiant d'installation (pour le namespace hors partage). */
  installationId: string;
  /** Source de la lecture. */
  source: NamespaceSource;
}

/** Préfixe du namespace propre à une installation. */
export const INSTALLATION_NAMESPACE_PREFIX = 'installation:';

/**
 * Dérive la clé HMAC d'un namespace : `HMAC-SHA-256(clé partagée, namespace)`.
 *
 * C'est **la** fonction que doit utiliser un outil Git pour produire la même
 * empreinte que le wiki (voir `README.md`) : il lui faut la clé partagée et
 * l'identifiant du namespace, rien de plus.
 */
export function deriveNamespaceKey(sharedKey: string, namespaceId: string): string {
  return createHmac('sha256', sharedKey).update(namespaceId, 'utf8').digest('hex');
}

/**
 * Construit l'état du namespace à partir de la configuration brute.
 *
 * - pas de clé → namespace propre à l'installation (comportement inchangé) ;
 * - clé sans identifiant → partage **désactivé**, avec une raison écrite :
 *   on ne devine pas à la place de l'administrateur ;
 * - clé et identifiant → namespace partagé.
 */
export function resolveNamespace(config: NamespaceConfig): FingerprintNamespace {
  const sharedKey = config.sharedKey?.trim() ?? '';
  const namespaceId = config.namespaceId?.trim() ?? '';
  if (sharedKey === '') {
    return {
      id: `${INSTALLATION_NAMESPACE_PREFIX}${config.installationId}`,
      shared: false,
      source: config.source,
    };
  }
  if (namespaceId === '') {
    return {
      id: `${INSTALLATION_NAMESPACE_PREFIX}${config.installationId}`,
      shared: false,
      source: config.source,
      warning:
        'clé partagée posée sans identifiant de namespace — le partage reste désactivé (PW-31).',
    };
  }
  return { id: namespaceId, shared: true, source: config.source };
}

/**
 * La clé HMAC effective de l'installation.
 *
 * - namespace partagé → clé dérivée : les empreintes sont comparables avec
 *   les autres surfaces qui partagent la même clé et le même namespace ;
 * - sinon → la clé propre à l'installation (le comportement d'aujourd'hui).
 */
export function effectiveHmacKey(
  namespace: FingerprintNamespace,
  sharedKey: string | undefined,
  installationKey: string,
): string {
  if (!namespace.shared || sharedKey === undefined || sharedKey.trim() === '') {
    return installationKey;
  }
  return deriveNamespaceKey(sharedKey.trim(), namespace.id);
}

/** Deux namespaces sont-ils le même (donc comparables) ? */
export function sameNamespace(left: string, right: string): boolean {
  return left === right;
}
