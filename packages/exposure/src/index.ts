/**
 * L'exposition chiffrée (§8) : score de danger 0-100 dont CHAQUE terme appliqué
 * est affiché avec sa méthode et son évidence (§25.6), lecteurs potentiels en
 * fourchette (jamais un nombre exact), surface IA en hypothèse conservatrice
 * (§13), coût de remise en état, rapport de pré-activation et visibilité
 * PW-23.
 *
 * Règle d'honnêteté (§8) : aucun score sans ses termes, aucune exposition sans
 * sa méthode, aucun « propre » sans certificat.
 *
 * Réemploi vs adaptation :
 * - **Réemployé tel quel** : `@placard-wiki/domain` (catalogue `SCORE_TERMS`,
 *   `BASE_SCORE_BY_FAMILY`, `computeDanger` — seule somme bornée du monorepo —
 *   `REMEDIATION_COST_HOURS`, types `AppliedScoreTerm`/`ReadersRange`/
 *   `AiSurface`/`PageExposure`/`Foyer`) ; `@placard/core` en test
 *   (`fakeValue`, `redactPreview`, `computeFingerprint`) pour ne jamais écrire
 *   de valeur brute dans le dépôt.
 * - **Adapté** : la forme du score explicable de
 *   `vendor/placard/packages/analysis/src/score.ts` (délégation à un calcul
 *   unique + liste des termes réellement appliqués), mais avec les entrées du
 *   wiki — le score Git (`inHead`, `publicRemote`, `isTestPath`) ne s'applique
 *   pas à Confluence et n'est jamais recopié.
 */

export * from './score.js';
export * from './readers.js';
export * from './ai-surface.js';
export * from './remediation.js';
export * from './pre-activation.js';
export * from './visible-to.js';

export const PACKAGE_NAME = '@placard-wiki/exposure';
export const PACKAGE_STATUS = 'implemented' as const;
