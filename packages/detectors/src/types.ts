/**
 * Types du pipeline de détection wiki (cahier des charges §7, familles 10-12).
 *
 * Règle absolue héritée de `placard` : aucun type de sortie ne porte de valeur
 * brute de secret. Le lien avec la valeur trouvée est l'empreinte HMAC (clé
 * injectable, propre à l'installation) et l'aperçu masqué de `@placard/core`.
 */

import type { ContainerType, ContentField, MaskedPreview, WikiFamily } from '@placard-wiki/domain';

/**
 * L'unité de balayage : un champ d'un conteneur Confluence (corps de page,
 * commentaire, titre, texte extrait d'une pièce jointe…).
 */
export interface ScanItem {
  containerType: ContainerType;
  field: ContentField;
  /** Contenu texte (storage XML pour un corps de page, texte extrait pour une pièce jointe). */
  text: string;
  /** Nom de la pièce jointe, quand le conteneur en est une. */
  filename?: string;
  /** Taille déclarée du binaire, en octets (angle mort si le contenu n'est pas lu). */
  sizeBytes?: number;
}

/**
 * Un candidat à la détection : une occurrence précise, bornée dans le texte,
 * jamais une valeur brute. `ambiguous` marque les candidats qui relèvent de
 * l'oracle LLM (§7 : prose personnelle et tableaux d'identifiants).
 */
export interface DetectionCandidate {
  family: WikiFamily;
  /** Empreinte HMAC-SHA-256 de la valeur (ou de la structure), clé injectable. */
  fingerprint: string;
  /** Aperçu masqué produit par `redactPreview` de `@placard/core` — jamais la valeur. */
  maskedPreview: MaskedPreview;
  /** Borne incluse de l'occurrence dans `ScanItem.text`. */
  charStart: number;
  /** Borne exclue de l'occurrence dans `ScanItem.text`. */
  charEnd: number;
  /** Identifiant stable de la règle, repris dans le rapport et le registre. */
  ruleId: string;
  /** Confiance de la règle entre 0 et 1. */
  confidence: number;
  /** Le contexte décide (exemple de documentation ou vraie valeur) → oracle LLM. */
  ambiguous: boolean;
  /** Valeur factice connue (`isDummyValue` de `@placard/core`) → malus −20 (§8). */
  isKnownFake: boolean;
}

/** Dépendances injectables du pipeline — aucune n'est optionnelle pour la clé. */
export interface WikiScanDeps {
  /** Clé HMAC propre à l'installation : jamais la même entre deux sites. */
  hmacKey: string;
  /** Moteur vendor réemployé pour les neuf familles Git (défaut : moteur standard). */
  engine?: VendorEngine;
  /** Seuil d'entropie des chaînes suspectes (défaut vendor : 3.5). */
  entropyThreshold?: number;
  /** Familles wiki désactivées par l'espace (§16 PW-24). */
  disabledFamilies?: readonly WikiFamily[];
}

/** Sous-ensemble du contrat `DetectorEngine` utilisé par le pipeline wiki. */
export interface VendorEngine {
  scanLine(input: {
    line: string;
    path: string;
    commit: string;
    lineNumber: number;
    side: 'added' | 'removed';
  }): { detections: VendorRawDetection[] };
  scanPath(path: string): { detections: VendorRawDetection[] };
}

/** Détection brute du moteur vendor (la valeur ne sort jamais du processus). */
export interface VendorRawDetection {
  rule: string;
  family: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}
