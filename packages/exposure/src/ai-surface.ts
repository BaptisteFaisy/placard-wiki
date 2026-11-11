/**
 * Surface IA (§13) : hypothèse CONSERVATRICE, toujours affichée comme telle.
 * Tant que l'app ne sait pas interroger l'index Rovo (§22), une page lisible
 * par Rovo est PRÉSUMÉE indexée — on surestime l'exposition, on ne la devine
 * jamais à la baisse.
 */

import type { AiSurface } from '@placard-wiki/domain';

/** La méthode, affichée avec l'hypothèse (§13 : aucun « propre » sans certificat). */
export const AI_SURFACE_METHOD_FR =
  'Hypothèse conservatrice (§13) : toute page lisible par Rovo est présumée indexée ' +
  'tant que l’app ne peut pas interroger l’index ; une page archivée est présumée hors index. ' +
  'Le doute profite à l’exposition, jamais au silence.';

/** Ce que l'on sait de l'accès de l'assistant à la page. */
export interface AiSurfaceInput {
  /** `true`/`false` si l'accès Rovo est connu ; `'unknown'` → présomption d'indexation. */
  readableByRovo: boolean | 'unknown';
  /** Page archivée : présumée hors de l'index. */
  archived?: boolean;
}

/**
 * Surface IA d'une page. `hypothesis: true` est imposé par le type du domaine :
 * le résultat ne peut PAS être présenté comme un fait.
 */
export function aiSurface(input: AiSurfaceInput): AiSurface {
  const presumedIndexed = !input.archived && input.readableByRovo !== false;
  return { presumedIndexed, hypothesis: true, method: AI_SURFACE_METHOD_FR };
}
