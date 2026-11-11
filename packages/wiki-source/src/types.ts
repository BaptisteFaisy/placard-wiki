/**
 * Types du paquet wiki-source — ce que les lecteurs ramènent (§6, §21).
 *
 * Le vocabulaire des conteneurs et des champs vient du domaine partagé
 * (`@placard-wiki/domain`) : jamais redéfini ici.
 *
 * Règle d'or : **jamais d'ignoré silencieux**. Un élément non lu porte
 * toujours une `skippedReason` ; un élément lu porte son `text`.
 */

import type { ContainerType, ContentField, Gite } from '@placard-wiki/domain';
import { giteOf } from '@placard-wiki/domain';

/** Un emplacement de contenu ramené par un lecteur, avant toute détection. */
export interface ScannedItem {
  containerType: ContainerType;
  field: ContentField;
  /** ARI Confluence du conteneur (page, version, commentaire, pièce jointe). */
  containerAri: string;
  pageId: string;
  versionNumber?: number;
  /** Contenu textuel lu — présent si et seulement si l'élément a été lu. */
  text?: string;
  /** Nom de fichier (pièces jointes). */
  filename?: string;
  /** Taille en octets du conteneur lu (ou déclaré non lu). */
  sizeBytes: number;
  /** Pourquoi l'élément n'a pas été lu — jamais vide quand `text` est absent. */
  skippedReason?: string;
}

/** Limite de lecture d'une pièce jointe (§14 : payload Forge 5 Mo). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Raison normalisée : fichier trop volumineux pour être lu (§14, §22). */
export const REASON_TOO_LARGE = 'fichier trop volumineux (> 5 Mo) : non lu, déclaré angle mort';

/** Raison normalisée : contenu binaire non textuel. */
export const REASON_NOT_TEXT = 'contenu binaire non textuel : non lu, extraction hors périmètre';

/** Raison normalisée : droits manquants (§19 — distingué de « pas de données »). */
export const REASON_FORBIDDEN = 'droits insuffisants pour lire ce contenu : déclaré, pas masqué';

/** Déduit le gîte d'un élément (§6) — la règle vit dans le domaine. */
export function giteOfItem(item: ScannedItem): Gite {
  return giteOf(item.containerType, item.field);
}

/** Un élément est « non lu » s'il n'a pas de texte — la raison est obligatoire. */
export function isSkipped(item: ScannedItem): boolean {
  return item.text === undefined;
}

/** Taille en octets d'un texte UTF-8 (la taille compte, pas le nombre de signes). */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Fabrique un ARI Confluence de page (`ari:cloud:confluence::page/<id>`). */
export function pageAri(pageId: string): string {
  return `ari:cloud:confluence::page/${pageId}`;
}

/** Fabrique l'ARI d'un conteneur enfant (version, commentaire, pièce jointe). */
export function childAri(kind: 'version' | 'comment' | 'attachment', id: string): string {
  return `ari:cloud:confluence::${kind}/${id}`;
}
