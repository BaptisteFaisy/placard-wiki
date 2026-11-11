/**
 * Lecteurs étroits du contexte produit Forge (`useProductContext`).
 *
 * Le contexte brut est typé lâchement côté SDK ; ici on n'extrait que les
 * trois champs dont les écrans ont besoin — compte, espace, page — via des
 * interfaces étroites. Jamais de `any` propagé : chaque valeur est lue puis
 * repliée sur une chaîne vide quand le contexte est absent (écran hors
 * contexte, ou rendu hors produit).
 */

import { useProductContext } from '@forge/react';

/** La partie du contexte d'extension qui porte l'espace courant. */
interface SpaceExtension {
  space?: { key?: string };
}

/** La partie du contexte d'extension qui porte le contenu courant. */
interface ContentExtension {
  content?: { id?: string };
}

/** AccountId de la personne connectée (pour `asUser`, attestations, adoption). */
export function useAccountId(): string {
  return useProductContext()?.accountId ?? '';
}

/** Clé de l'espace courant (écran de réglages d'espace, §18.5). */
export function useSpaceKey(): string {
  const extension: SpaceExtension = useProductContext()?.extension ?? {};
  return extension.space?.key ?? '';
}

/** Identifiant de la page courante (encart de page, bannière temps réel). */
export function usePageId(): string {
  const extension: ContentExtension = useProductContext()?.extension ?? {};
  return extension.content?.id ?? '';
}
