/**
 * Ports injectables du rituel (logique pure, effets de bord derrière des
 * interfaces). Le résolveur Forge fournit les implémentations réelles
 * (`asUser()`, SQL, horloge du conteneur) ; les tests fournissent des
 * fakes déterministes.
 */

/** Horloge injectable : toute date produite par le rituel passe par là. */
export interface ClockPort {
  /** Date courante au format ISO 8601. */
  now(): string;
}

/**
 * Écriture dans Confluence. Une seule méthode : créer une version de page
 * au nom de la personne qui approuve (§5 : la modification est faite au nom
 * de cette personne — `asUser()` côté résolveur).
 */
export interface StoragePort {
  /**
   * Écrit `text` comme nouvelle version de la page, avec son commentaire de
   * version, au nom de `asUser`. Renvoie le numéro de la nouvelle version.
   */
  writeVersion(pageId: string, text: string, versionComment: string, asUser: string): Promise<number>;
}

/** Fabrique d'identifiants injectable (UUID en production, séquence en test). */
export interface IdPort {
  next(prefix: string): string;
}

/** Horloge figée, pour les tests. */
export function fixedClock(iso: string): ClockPort {
  return { now: () => iso };
}

/** Fabrique d'identifiants déterministe, pour les tests. */
export function sequenceIds(): IdPort {
  let n = 0;
  return {
    next(prefix: string): string {
      n += 1;
      return `${prefix}-${String(n)}`;
    },
  };
}
