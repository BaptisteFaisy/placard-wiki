/**
 * Famille 12 (§7) : pièces jointes sensibles.
 *
 * Trois signaux, conformément au cahier :
 *  1. **extension** — le vendor (`riskyFilePathRules`) couvre déjà `.env`,
 *     `.pem`, `.p12`, `.pfx`, `.ppk` et `id_rsa` : rien n'est recopié. Ce
 *     fichier **complète** avec les extensions propres au wiki : `.kdbx`
 *     (coffre KeePass), `.ovpn` (profil VPN), `.csv`/`.xlsx` (exports de
 *     données) ;
 *  2. **contenu textuel extractible** — quand `ScanItem.text` porte le texte
 *     extrait, le pipeline complet (9 familles Git + familles wiki) le lit ;
 *  3. **entropie du binaire** — un extrait à très forte entropie trahit une
 *     matière encodée ou chiffrée dans un fichier à risque.
 *
 * Angle mort **déclaré** (§22, §23) : les captures d'écran. Une image ne se
 * lit pas sans OCR dans le bundle Forge ; le fichier est signalé « non lu »,
 * avec sa raison, jamais deviné.
 */

import { shannonEntropy } from '@placard/core';

/** Une extension à risque propre au wiki, avec sa règle stable. */
export interface WikiExtensionMatch {
  ruleId: string;
  extension: string;
  reasonFr: string;
}

/** Un angle mort déclaré : ce qui n'est pas lu, et pourquoi (jamais masqué). */
export interface BlindSpot {
  filename: string;
  reasonFr: string;
  reasonEn: string;
}

/** Extensions complémentaires du vendor — le wiki, pas le dépôt Git. */
const WIKI_EXTENSIONS: ReadonlyArray<{ ruleId: string; extensions: string[]; reasonFr: string }> = [
  {
    ruleId: 'risky-file-password-vault',
    extensions: ['.kdbx'],
    reasonFr: 'coffre de mots de passe KeePass joint à une page',
  },
  {
    ruleId: 'risky-file-vpn-profile',
    extensions: ['.ovpn'],
    reasonFr: 'profil VPN (certificats et clés embarqués)',
  },
  {
    ruleId: 'risky-file-data-export',
    extensions: ['.csv', '.xlsx', '.xls'],
    reasonFr: 'export de données (identifiants, données personnelles)',
  },
];

/** Extensions d'image : captures d'écran, angle mort déclaré (§22). */
const SCREENSHOT_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.heic',
];

/** Taille minimale d'un extrait pour que l'entropie veuille dire quelque chose. */
const ENTROPY_MIN_CHARS = 200;

/** Entropie (bits/caractère) au-delà de laquelle un extrait sent le binaire. */
export const BINARY_ENTROPY_THRESHOLD = 4.5;

/** Identifiant stable de la règle d'entropie binaire. */
export const RULE_ATTACHMENT_ENTROPY = 'risky-file-binary-entropy';

/** Extension (minuscule, point inclus) d'un nom de fichier. */
function extensionOf(filename: string): string {
  const lowered = filename.toLowerCase();
  const slash = Math.max(lowered.lastIndexOf('/'), lowered.lastIndexOf('\\'));
  const base = slash >= 0 ? lowered.slice(slash + 1) : lowered;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

/** Le nom porte-t-il une extension wiki à risque (complément du vendor) ? */
export function findWikiRiskyExtension(filename: string): WikiExtensionMatch | undefined {
  if (typeof filename !== 'string' || filename.length === 0) return undefined;
  const extension = extensionOf(filename);
  if (extension.length === 0) return undefined;
  // `id_rsa` sans extension : le vendor le couvre déjà par son motif de nom.
  for (const entry of WIKI_EXTENSIONS) {
    if (entry.extensions.includes(extension)) {
      return { ruleId: entry.ruleId, extension, reasonFr: entry.reasonFr };
    }
  }
  return undefined;
}

/**
 * Une capture d'écran est-elle un angle mort ? Raison écrite, conforme à la
 * règle d'honnêteté : « non lu » se déclare, ne se devine pas.
 */
export function screenshotBlindSpot(filename: string): BlindSpot | undefined {
  if (typeof filename !== 'string') return undefined;
  if (!SCREENSHOT_EXTENSIONS.includes(extensionOf(filename))) return undefined;
  return {
    filename,
    reasonFr:
      'capture d’écran : contenu non lu — pas d’OCR dans le bundle Forge ; seul le nom est analysé',
    reasonEn:
      'screenshot: content not read — no OCR in the Forge bundle; only the filename is analyzed',
  };
}

/**
 * L'extrait d'une pièce jointe est-il une matière à forte entropie (binaire
 * encodé, archive, coffre chiffré) ? Signal n° 3 de la famille 12.
 */
export function isHighEntropyBlob(extractedText: string): boolean {
  if (typeof extractedText !== 'string' || extractedText.length < ENTROPY_MIN_CHARS) return false;
  // Échantillon borné : l'entropie sur 4 Ko suffit à qualifier la matière.
  return shannonEntropy(extractedText.slice(0, 4096)) >= BINARY_ENTROPY_THRESHOLD;
}

/** Le nom de fichier mérite-t-il un examen (extension à risque ou image) ? */
export function isAttachmentOfInterest(filename: string | undefined): boolean {
  if (filename === undefined || filename.length === 0) return false;
  return findWikiRiskyExtension(filename) !== undefined || screenshotBlindSpot(filename) !== undefined;
}
