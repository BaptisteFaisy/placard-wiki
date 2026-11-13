/**
 * Lot « surfaces » (PW-31) — la même empreinte, sur plusieurs surfaces.
 *
 * Ce paquet tient la **vision multi-surfaces** du Placard du wiki : un même
 * secret repéré dans un dépôt Git, dans Confluence et dans Jira doit porter
 * la même empreinte, pour qu'on puisse dire « ce secret a fui là, là et là »
 * (cahier §4 « Propagation », §30, PW-31).
 *
 * ── Comment le dépôt Git produit la même empreinte ────────────────────────
 *
 * Côté wiki, l'empreinte d'une valeur est
 * `HMAC-SHA-256(clé effective, valeur)` — la clé effective est celle de
 * l'installation (`packages/forge-app/src/runtime/secret.ts`).
 *
 * Côté Git, le moteur `placard` fait de même : `computeFingerprint(valeur,
 * sel)` dans `vendor/placard/packages/core/src/redact.ts`, où le sel est
 * aujourd'hui **propre au dépôt** — dérivé du premier commit par
 * `repoSalt()` (`vendor/placard/packages/cli/src/salt.ts`). Les contrôles de
 * validité des valeurs (`vendor/placard/packages/core/src/checksums.ts`) sont
 * partagés par les deux côtés.
 *
 * Pour que les deux empreintes coïncident, l'administrateur pose **la même
 * clé et le même namespace des deux côtés** :
 *
 *  1. côté wiki : `PW_FINGERPRINT_NAMESPACE_KEY` (le secret partagé) et
 *     `PW_FINGERPRINT_NAMESPACE` (l'identifiant, ex. `atlassian:acme`) ;
 *  2. côté Git : la clé HMAC du dépôt doit être la **même clé dérivée**,
 *     c'est-à-dire `deriveNamespaceKey(clé partagée, identifiant)` — la
 *     fonction exportée par ce paquet, que l'outil Git peut réutiliser
 *     telle quelle.
 *
 * ⚠ Le sous-module `vendor/placard` est **épinglé et non modifié** ici : le
 * sel par défaut du dépôt Git reste le sien. Le passage à la clé partagée
 * côté Git suppose une évolution du CLI `placard` (son `repoSalt`), qui
 * n'appartient pas à ce dépôt — le lien est donc **documenté, pas implémenté**
 * de ce côté. Tant que ce n'est pas fait, le registre multi-surfaces
 * accueille les observations Git, mais les empreintes des deux côtés ne se
 * croiseront pas : le produit le dira explicitement plutôt que de mentir.
 *
 * ── Ce que contient le paquet ─────────────────────────────────────────────
 *
 * - `namespace.ts` : le namespace partagé (opt-in) et la dérivation de clé ;
 * - `registry.ts` : le port `SurfaceRegistry` et son implémentation mémoire ;
 * - `match.ts` : la correspondance pure entre une empreinte et des surfaces ;
 * - `types.ts` : ce qu'est une observation (empreinte, surface, état).
 *
 * Aucune valeur brute, jamais : une observation porte une empreinte et une
 * étiquette lisible, rien qui permette de reconstruire le secret (§23).
 */

export const PACKAGE_NAME = '@placard-wiki/surfaces';
export const PACKAGE_STATUS = 'implemented' as const;

export * from './types';
export * from './namespace';
export * from './registry';
export * from './match';
