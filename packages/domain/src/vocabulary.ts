/**
 * Vocabulaire du produit (cahier des charges §4) — la discipline tient dans
 * ces quelques types : on ne confond jamais « présent », « exposé », « vivant »
 * et « révélé ».
 */

import type { FindingFamily } from '@placard/core';

/** Les douze familles de détection (§7) : les neuf de `placard` + trois wiki. */
export type WikiFamily =
  | FindingFamily
  | 'connection-string'
  | 'credential-table';

/** Numéro de famille dans le cahier des charges, pour l'affichage et les tests. */
export type FamilyNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Libellés français/anglais des familles. Onze identifiants de famille pour
 * les douze numéros du cahier : `bank-data` (hérité de placard) couvre à la
 * fois l'IBAN (mod-97, n° 6) et la carte bancaire (Luhn, n° 7).
 */
export const FAMILY_LABELS: Record<WikiFamily, { fr: string; en: string; numbers: FamilyNumber[] }> = {
  'cloud-key': { fr: 'Clés cloud (AWS, GCP, Azure)', en: 'Cloud keys (AWS, GCP, Azure)', numbers: [1] },
  'platform-token': { fr: 'Tokens de plateforme', en: 'Platform tokens', numbers: [2] },
  'private-key': { fr: 'Clés privées (PEM, SSH, PGP)', en: 'Private keys (PEM, SSH, PGP)', numbers: [3] },
  'signed-token': { fr: 'JWT signés', en: 'Signed JWTs', numbers: [4] },
  'plaintext-password': { fr: 'Mots de passe en clair', en: 'Plaintext passwords', numbers: [5] },
  'bank-data': { fr: 'Données bancaires (IBAN, carte)', en: 'Bank data (IBAN, card)', numbers: [6, 7] },
  identity: { fr: "Numéros d'identité", en: 'Identity numbers', numbers: [8] },
  'suspicious-string': { fr: 'Données personnelles en prose', en: 'Personal data in prose', numbers: [9] },
  'risky-file': { fr: 'Pièces jointes sensibles', en: 'Sensitive attachments', numbers: [12] },
  'connection-string': { fr: 'Chaînes de connexion', en: 'Connection strings', numbers: [10] },
  'credential-table': { fr: "Tableaux d'identifiants", en: 'Credential tables', numbers: [11] },
};

/** Le type de conteneur où un secret peut dormir (§6, §20). */
export type ContainerType =
  | 'page'
  | 'version'
  | 'comment'
  | 'attachment'
  | 'template'
  | 'space-desc';

/** Le champ précis du conteneur (le corps, le titre, les étiquettes…). */
export type ContentField =
  | 'body'
  | 'title'
  | 'labels'
  | 'description'
  | 'filename'
  | 'text';

/**
 * Les sept gîtes (cahier §6) : la nature de l'emplacement, vue par le lecteur.
 */
export type Gite =
  | 'corps-de-page'
  | 'commentaires'
  | 'pieces-jointes'
  | 'historique-de-versions'
  | 'modeles-de-page'
  | 'titres-et-etiquettes'
  | 'description-espace';

/** Les sept gîtes, avec la raison d'être et l'impact (§6). */
export const GITES: ReadonlyArray<{
  gite: Gite;
  fr: string;
  en: string;
  why: string;
  impact: string;
}> = [
  {
    gite: 'corps-de-page',
    fr: 'Corps de page',
    en: 'Page body',
    why: 'Runbooks, procédures d’accès, comptes de démo',
    impact: 'Le cas classique, y compris dans les blocs de code et les macros',
  },
  {
    gite: 'commentaires',
    fr: 'Commentaires',
    en: 'Comments',
    why: '« le mot de passe est X » répondu en deux secondes',
    impact: 'Jamais relus, jamais cherchés, souvent hors des sauvegardes de texte',
  },
  {
    gite: 'pieces-jointes',
    fr: 'Pièces jointes',
    en: 'Attachments',
    why: '.env, .pem, .p12, .kdbx, .ovpn, exports CSV/XLSX, captures de terminal',
    impact: 'Un fichier joint survit à la réécriture de la page',
  },
  {
    gite: 'historique-de-versions',
    fr: 'Historique de versions',
    en: 'Version history',
    why: 'La page a été corrigée un jour',
    impact: 'Le secret reste lisible dans la version 3 — le point aveugle de tous les scanners',
  },
  {
    gite: 'modeles-de-page',
    fr: 'Modèles de page',
    en: 'Page templates',
    why: 'Un runbook modèle avec ses identifiants',
    impact: 'Amplification : chaque nouvelle page recopie le secret',
  },
  {
    gite: 'titres-et-etiquettes',
    fr: 'Titres et étiquettes',
    en: 'Titles and labels',
    why: '« accès staging (mdp: …) »',
    impact: 'Visible dans les résultats de recherche et les fils',
  },
  {
    gite: 'description-espace',
    fr: 'Description d’espace, page d’accueil',
    en: 'Space description, home page',
    why: 'L’endroit le plus lu de l’espace',
    impact: 'Exposition maximale, rarement audité',
  },
];

/** Déduit le gîte d'un emplacement (§6). */
export function giteOf(containerType: ContainerType, field: ContentField): Gite {
  if (containerType === 'version') return 'historique-de-versions';
  if (containerType === 'comment') return 'commentaires';
  if (containerType === 'attachment') return 'pieces-jointes';
  if (containerType === 'template') return 'modeles-de-page';
  if (containerType === 'space-desc') return 'description-espace';
  return field === 'title' || field === 'labels' ? 'titres-et-etiquettes' : 'corps-de-page';
}

/**
 * Les quatre états épistémiques du produit. Ils ne sont jamais mélangés :
 * « présent » ne veut pas dire « exposé », « exposé » ne veut pas dire « actif ».
 */
export type EpistemicState = 'present' | 'expose' | 'vivant' | 'revele';

/**
 * Ce que l'app ne dit jamais (§4, §5). Une promesse que l'app ne peut pas
 * tenir est un défaut, pas une promesse.
 */
export const FORBIDDEN_ASSERTIONS: ReadonlyArray<{ fr: string; en: string; instead: string }> = [
  {
    fr: '« cette clé est active »',
    en: '“this key is active”',
    instead: '« rotation inconnue depuis 412 jours »',
  },
  {
    fr: '« le secret a été effacé » (quand l’historique reste lisible)',
    en: '“the secret was erased” (when history stays readable)',
    instead: '« l’emplacement actuel est caviardé ; la version 3 reste lisible »',
  },
  {
    fr: '« quelqu’un a lu ce secret »',
    en: '“someone read this secret”',
    instead: '« exposition potentielle : entre 340 et 1 200 lecteurs »',
  },
];

/** Les cinq étapes du rituel, dans l’ordre (§9). */
export const RITUAL_STEPS = ['rotate', 'redact', 'purge', 'prevent', 'verify'] as const;
export type RitualStep = (typeof RITUAL_STEPS)[number];

/** Libellés des étapes du rituel. */
export const RITUAL_STEP_LABELS: Record<RitualStep, { fr: string; en: string }> = {
  rotate: { fr: 'Tourner', en: 'Rotate' },
  redact: { fr: 'Caviarder', en: 'Redact' },
  purge: { fr: 'Purger l’historique', en: 'Purge history' },
  prevent: { fr: 'Empêcher', en: 'Prevent' },
  verify: { fr: 'Vérifier', en: 'Verify' },
};

/**
 * État d'un foyer (l'empreinte et sa réparation). `sealed` = sceau de cire :
 * rotation attestée **et** caviardage fait **et** purge vérifiée ou
 * impossible documentée.
 */
export type FoyerState =
  | 'open'
  | 'rotation-attested'
  | 'redacted'
  | 'purge-requested'
  | 'purged'
  | 'purge-impossible'
  | 'sealed'
  | 'dismissed';

/** Méthode de résolution du propriétaire, en cascade (§12). */
export type OwnerMethod =
  | 'declared-owner'
  | 'last-editors'
  | 'space-lead'
  | 'teamwork-graph'
  | 'adoption-queue';

/** Libellés des méthodes de résolution, avec leur honnêteté. */
export const OWNER_METHOD_LABELS: Record<OwnerMethod, { fr: string; en: string }> = {
  'declared-owner': { fr: 'Propriétaire déclaré de la page', en: 'Declared page owner' },
  'last-editors': { fr: 'Trois derniers éditeurs (sans classement)', en: 'Last three editors (no ranking)' },
  'space-lead': { fr: 'Responsable de l’espace', en: 'Space lead' },
  'teamwork-graph': { fr: 'Teamwork Graph (lecture seule)', en: 'Teamwork Graph (read-only)' },
  'adoption-queue': { fr: 'File d’adoption', en: 'Adoption queue' },
};

/** État du partage d’une page (§8). */
export type SharingState =
  | 'restricted'
  | 'space-default'
  | 'anyone-with-link'
  | 'public';

/** Libellés des états de partage. */
export const SHARING_LABELS: Record<SharingState, { fr: string; en: string }> = {
  restricted: { fr: 'Restreinte', en: 'Restricted' },
  'space-default': { fr: 'Héritage de l’espace', en: 'Space default' },
  'anyone-with-link': { fr: '« Toute personne ayant le lien »', en: 'Anyone with the link' },
  public: { fr: 'Publiée publiquement', en: 'Public' },
};
