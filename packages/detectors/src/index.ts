/**
 * Familles wiki (§7, familles 10 à 12) et pipeline de scan des conteneurs :
 * - chaînes de connexion (`postgres://`, `mongodb://`, `redis://`, JDBC avec
 *   mot de passe intégré) ;
 * - tableaux d'identifiants (détection structurelle : une colonne identifiant,
 *   une colonne secret — le motif Confluence par excellence) ;
 * - pièces jointes sensibles (extension + contenu textuel extractible +
 *   entropie du binaire).
 *
 * Les neuf familles de `placard` (Git) sont réemployées telles quelles via
 * @placard/detectors — jamais recopiées. Le LLM n'intervient que sur les
 * candidats ambigus (famille 9/11), avec cache par empreinte de contenu.
 *
 * Squelette — le lot « detectors » implémente le registre wiki et le pipeline.
 */

export const PACKAGE_NAME = '@placard-wiki/detectors';
export const PACKAGE_STATUS = 'skeleton' as const;
