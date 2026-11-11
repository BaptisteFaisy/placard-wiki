/**
 * Détection wiki — l'entrée du lot « propagation ».
 *
 * Règle absolue (§5, §20) : une détection ne porte **jamais** de valeur brute.
 * Le seul lien avec le secret est l'empreinte HMAC (calculée en amont par la
 * chaîne de détection) et l'aperçu masqué `AKIA…(20)`.
 *
 * Choix assumé : aucun champ « auteur » n'existe ici. La timeline de
 * propagation (§11) parle des habitudes de l'équipe, jamais des personnes —
 * l'information sur l'acteur n'entre même pas dans le paquet.
 */

import type {
  ContainerType,
  ContentField,
  MaskedPreview,
  WikiFamily,
} from '@placard-wiki/domain';

/** Métadonnées de la page qui porte (ou portait) un emplacement. */
export interface WikiPageMeta {
  pageId: string;
  title: string;
  /** Modèle de page à l'origine de la création, si connu. */
  templateId?: string;
  /** Date de création de la page — sert aux heuristiques de propagation. */
  createdAt: string;
  /** Duplication explicite de page (fonction « dupliquer » de Confluence). */
  duplicatedFromPageId?: string;
  /** La page a été supprimée après détection (§24) → emplacement « disparu ». */
  deleted?: boolean;
}

/** Une détection ancrée : une empreinte vue à un endroit précis, à une date. */
export interface WikiDetection {
  /** HMAC-SHA-256 calculé en amont — la valeur brute ne circule jamais. */
  fingerprint: string;
  family: WikiFamily;
  containerType: ContainerType;
  /** ARI Confluence du conteneur (page, version, commentaire, pièce jointe). */
  containerAri: string;
  pageId: string;
  /** Renseigné quand le conteneur est une version d'historique. */
  versionNumber?: number;
  field: ContentField;
  charStart?: number;
  charEnd?: number;
  maskedPreview: MaskedPreview;
  detectedAt: string;
  /** Date de caviardage appliqué, si l'emplacement a déjà été traité. */
  redactedAt?: string;
}

/** Aperçu masqué construit depuis la valeur — **tests et démo uniquement**. */
export function maskedPreviewOf(value: string): MaskedPreview {
  const tete = value.slice(0, 4);
  return `${tete}…(${value.length})`;
}
