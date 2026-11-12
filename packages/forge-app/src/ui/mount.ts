/**
 * Montage d'un écran dans le pont Forge (forme UI Kit actuelle).
 *
 * En UI Kit actuelle, la ressource d'un module Confluence est un fichier
 * `.tsx` que le CLI bundle pour la plateforme (`render: native`). Le module
 * est importé par Forge au moment du rendu ; c'est donc lui qui demande le
 * rendu, via `ForgeReconciler.render` — l'export par défaut de `@forge/react`
 * (le réconcilier d'Atlassian, pas celui de React).
 *
 * Le garde-fou `window` évite de jeter quand le module est importé hors
 * navigateur (tests unitaires, vérification de type) : `@forge/bridge` lève
 * hors d'un produit Atlassian. Même convention que l'app sœur `tickets-pieges`
 * (même atelier, déployée).
 *
 * L'écran reste aussi exporté par défaut : la forme attendue par la plateforme
 * et la forme testable restent la même.
 */

import ForgeReconciler from '@forge/react';
import type { ReactElement } from 'react';

/** Monte un écran dans le pont Forge ; sans effet hors navigateur. */
export function mountScreen(element: ReactElement): void {
  if (typeof (globalThis as { window?: unknown }).window === 'undefined') return;
  ForgeReconciler.render(element);
}
