/**
 * L'exposition chiffrée (§8) : lecteurs potentiels (fourchette + méthode),
 * partage public, restrictions, surface IA, et le score de danger 0-100 dont
 * **chaque terme appliqué est affiché**.
 *
 * Deux chiffres d'accompagnement, toujours avec leur méthode :
 * - lecteurs potentiels : fourchette basse/haute (pas un nombre exact) ;
 * - coût de remise en état : fourchette en heures par famille.
 *
 * Règle d'honnêteté : aucun score sans ses termes, aucune exposition sans sa
 * méthode, aucun « propre » sans certificat. Le moteur de score explicable
 * vient de @placard/analysis — jamais recopié.
 *
 * Squelette — le lot « exposure » implémente le calcul et ses termes.
 */

export const PACKAGE_NAME = '@placard-wiki/exposure';
export const PACKAGE_STATUS = 'skeleton' as const;
