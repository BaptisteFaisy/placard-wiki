/**
 * Les surfaces d'une empreinte (PW-31) — où le même secret a été observé.
 *
 * Une **surface** est un endroit où une empreinte peut être vue : le wiki
 * Confluence lui-même, un dépôt Git, un ticket Jira, un ticket de l'outil de
 * suivi, ou « autre » quand le dépôt ne sait pas nommer la surface.
 *
 * Une **observation** (`SurfaceSeen`) dit : « cette empreinte a été vue sur
 * cette surface, à cet emplacement, sous ce namespace ». Elle ne porte
 * **jamais** de valeur brute : ni le secret, ni un extrait capable de le
 * reconstruire — une étiquette lisible (un chemin, une clé de ticket) et
 * l'empreinte HMAC seulement (§23).
 *
 * Le `namespaceId` est ce qui rend la comparaison possible : deux
 * observations ne sont comparables que si elles ont été calculées sous le
 * même namespace (même clé partagée, même identifiant). Voir `namespace.ts`.
 */

/** Les surfaces connues : Confluence, Git, Jira, ticket de suivi, autre. */
export type SurfaceKind = 'confluence' | 'git' | 'jira' | 'ticket' | 'autre';

/** L'état d'une observation sur une surface. */
export type SurfaceState = 'detecte' | 'confirme' | 'traite' | 'ignore';

/** Une observation : l'empreinte a été vue à cet endroit. */
export interface SurfaceSeen {
  /** L'empreinte HMAC de la valeur — jamais la valeur elle-même. */
  fingerprint: string;
  /** La surface observée. */
  surface: SurfaceKind;
  /**
   * L'identifiant de l'emplacement **chez la surface** : `repo:fichier`
   * pour Git, `SEC-1` pour un ticket, l'identifiant de page pour Confluence.
   * C'est ce couple (surface, externalId) qui dit « le même endroit ».
   */
  externalId: string;
  /** Étiquette lisible (un chemin, un titre) — jamais une valeur. */
  label: string;
  /** Le namespace sous lequel l'empreinte a été calculée. */
  namespaceId: string;
  /** Le foyer wiki correspondant, quand il existe. */
  foyerId?: string;
  /** L'état de l'observation. */
  state: SurfaceState;
  /** La méthode : comment l'observation a été obtenue (jamais la valeur). */
  method: string;
  /** La source : d'où viennent les données (`git-cli`, `jira-api`…). */
  source: string;
  /** Première observation. */
  firstSeenAt: string;
  /** Dernière observation. */
  lastSeenAt: string;
}

/** Étiquettes lisibles des surfaces (pour l'affichage). */
export const SURFACE_LABELS: Readonly<Record<SurfaceKind, string>> = {
  confluence: 'Confluence',
  git: 'Git',
  jira: 'Jira',
  ticket: 'Ticket',
  autre: 'Autre',
};

/** Les valeurs d'état possibles (triées pour l'affichage). */
export const SURFACE_STATES: readonly SurfaceState[] = [
  'detecte',
  'confirme',
  'traite',
  'ignore',
];
