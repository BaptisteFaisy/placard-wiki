/**
 * Le registre multi-surfaces (PW-31) : où une empreinte a été vue.
 *
 * C'est un **port** : le service ne connaît que cette interface. L'app Forge
 * fournit un adaptateur SQL (table `surface_seen`, dans
 * `packages/forge-app/src/store/forge-store.ts`) ; les tests et le mode
 * hors-ligne utilisent l'implémentation en mémoire ci-dessous.
 *
 * Règle absolue : une observation porte une **empreinte**, jamais une valeur.
 * L'identifiant externe et l'étiquette disent *où*, pas *quoi*.
 */

import type { SurfaceSeen } from './types';

/** Le port du registre multi-surfaces. */
export interface SurfaceRegistry {
  /**
   * Enregistre une observation. Ré-enregistrer le même emplacement
   * (même empreinte, même surface, même identifiant externe) met à jour
   * l'horodatage de dernière observation sans dupliquer la ligne.
   */
  record(seen: SurfaceSeen): Promise<void>;
  /** Les observations d'une empreinte — les surfaces où elle a été vue. */
  listByFingerprint(fingerprint: string): Promise<SurfaceSeen[]>;
  /** Les observations rattachées à un foyer wiki. */
  listByFoyer(foyerId: string): Promise<SurfaceSeen[]>;
  /**
   * Les observations d'un **emplacement** (surface + identifiant externe),
   * toutes empreintes confondues.
   *
   * C'est ce qui permet de dire « le même fichier a été vu sous deux
   * empreintes différentes » — donc sous deux namespaces différents, donc
   * avec deux clés qui ne se rejoignent pas (PW-31).
   */
  listByLocation(surface: SurfaceSeen['surface'], externalId: string): Promise<SurfaceSeen[]>;
}

/** L'identifiant d'un emplacement chez une surface (« le même endroit »). */
export function locationKey(seen: Pick<SurfaceSeen, 'surface' | 'externalId'>): string {
  return `${seen.surface}::${seen.externalId}`;
}

/** État interne du registre en mémoire. */
interface MemorySurfaces {
  rows: Map<string, SurfaceSeen>;
}

/** La clé d'une observation dans le registre en mémoire. */
function rowKey(seen: Pick<SurfaceSeen, 'fingerprint' | 'surface' | 'externalId'>): string {
  return `${seen.fingerprint}::${locationKey(seen)}`;
}

/** Les observations, de la plus récemment vue à la plus ancienne. */
function sorted(rows: Iterable<SurfaceSeen>): SurfaceSeen[] {
  return [...rows].sort((left, right) =>
    left.lastSeenAt < right.lastSeenAt ? 1 : left.lastSeenAt > right.lastSeenAt ? -1 : 0,
  );
}

/**
 * Registre en mémoire — pour les tests et le mode hors-ligne.
 *
 * La ré-observation d'un emplacement conserve la première observation et met à
 * jour la dernière : l'historique reste lisible, la ligne ne se dédouble pas.
 */
export function createMemorySurfaceRegistry(): SurfaceRegistry {
  const state: MemorySurfaces = { rows: new Map() };
  return {
    async record(seen) {
      const key = rowKey(seen);
      const previous = state.rows.get(key);
      state.rows.set(key, previous === undefined ? seen : { ...seen, firstSeenAt: previous.firstSeenAt });
    },
    async listByFingerprint(fingerprint) {
      const rows = [...state.rows.values()].filter((row) => row.fingerprint === fingerprint);
      return sorted(rows);
    },
    async listByFoyer(foyerId) {
      const rows = [...state.rows.values()].filter((row) => row.foyerId === foyerId);
      return sorted(rows);
    },
    async listByLocation(surface, externalId) {
      const rows = [...state.rows.values()].filter(
        (row) => row.surface === surface && row.externalId === externalId,
      );
      return sorted(rows);
    },
  };
}
