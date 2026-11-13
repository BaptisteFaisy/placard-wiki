/**
 * « Le même secret, deux surfaces » — la correspondance (PW-31).
 *
 * `matchAcrossSurfaces` est une **fonction pure** : elle ne lit rien, elle
 * n'écrit rien, elle ne compare que des empreintes. Elle dit deux choses :
 *
 *  1. **où** cette empreinte a été vue (les surfaces qui portent exactement
 *     cette empreinte) ;
 *  2. **pourquoi pas ailleurs**, quand une surface connue porte une autre
 *     empreinte — soit parce que c'est un autre secret, soit parce que les
 *     deux côtés n'ont pas partagé la même clé : le message le dit, plutôt
 *     que de laisser croire à une absence de fuite.
 *
 * Règle : deux empreintes ne sont comparables que si elles ont été calculées
 * sous le **même namespace** (même clé partagée, même identifiant). Voir
 * `namespace.ts`.
 */

import { locationKey } from './registry';
import { SURFACE_LABELS } from './types';
import type { SurfaceKind, SurfaceSeen } from './types';

/** Une surface connue qui ne porte pas l'empreinte cherchée. */
export interface DivergentSurface {
  /** La surface. */
  surface: SurfaceKind;
  /** L'identifiant de l'emplacement chez la surface. */
  externalId: string;
  /** L'étiquette lisible. */
  label: string;
  /** L'empreinte observée là — jamais la valeur. */
  fingerprint: string;
  /** Le namespace sous lequel elle a été calculée. */
  namespaceId: string;
  /** Pourquoi elle ne correspond pas. */
  reason: 'namespace-différent' | 'empreinte-différente';
}

/** Le résultat d'une correspondance multi-surfaces. */
export interface SurfaceMatch {
  /** L'empreinte cherchée. */
  fingerprint: string;
  /** Le namespace de l'empreinte cherchée, quand il est connu. */
  namespaceId: string;
  /** Les observations qui portent exactement cette empreinte. */
  matched: SurfaceSeen[];
  /** Les surfaces connues qui ne portent pas cette empreinte. */
  divergent: DivergentSurface[];
  /** Les namespaces vus dans les observations. */
  namespaces: string[];
  /** Les empreintes cherchée et observée sont-elles comparables ? */
  comparable: boolean;
  /** Le message explicite (français) — jamais un silence. */
  message: string;
}

/** Options de la correspondance. */
export interface SurfaceMatchOptions {
  /** Le namespace de l'empreinte cherchée — sans lui, la comparaison de namespace est impossible. */
  namespaceId?: string;
}

/** Les observations qui portent exactement l'empreinte cherchée. */
function matchedOf(surfaces: readonly SurfaceSeen[], fingerprint: string): SurfaceSeen[] {
  return surfaces.filter((seen) => seen.fingerprint === fingerprint);
}

/** Les surfaces connues qui ne portent pas l'empreinte cherchée. */
function divergentOf(
  fingerprint: string,
  surfaces: readonly SurfaceSeen[],
  matched: readonly SurfaceSeen[],
  soughtNamespace: string | undefined,
): DivergentSurface[] {
  const matchedPlaces = new Set(matched.map(locationKey));
  const out: DivergentSurface[] = [];
  for (const seen of surfaces) {
    if (seen.fingerprint === fingerprint) continue;
    const samePlace = matchedPlaces.has(locationKey(seen));
    const foreign = soughtNamespace !== undefined && seen.namespaceId !== soughtNamespace;
    const reason = foreign
      ? 'namespace-différent'
      : samePlace
        ? 'empreinte-différente'
        : null;
    if (reason === null) continue;
    out.push({
      surface: seen.surface,
      externalId: seen.externalId,
      label: seen.label,
      fingerprint: seen.fingerprint,
      namespaceId: seen.namespaceId,
      reason,
    });
  }
  return out;
}

/** Le message explicite : ce qui a été vu, et ce qui n'a pas pu l'être. */
function buildMessage(
  matched: readonly SurfaceSeen[],
  divergent: readonly DivergentSurface[],
  surfaces: readonly SurfaceSeen[],
  soughtNamespace: string | undefined,
): string {
  if (matched.length > 0) {
    const where = [...new Set(matched.map((seen) => SURFACE_LABELS[seen.surface]))].join(', ');
    const base = `empreinte observée sur ${String(matched.length)} emplacement(s) : ${where}.`;
    if (divergent.length === 0) return base;
    return `${base} ${String(divergent.length)} emplacement(s) portent une empreinte calculée ailleurs — détail dans « divergent ».`;
  }
  const foreign = [...new Set(surfaces.map((seen) => seen.namespaceId))]
    .filter((id) => id !== soughtNamespace);
  if (foreign.length > 0) {
    return `aucune correspondance : les surfaces observées portent des empreintes calculées dans un autre namespace (${foreign.join(', ')}) — la comparaison exige la même clé partagée des deux côtés (PW-31).`;
  }
  if (surfaces.length > 0) {
    return 'aucune correspondance : les surfaces connues portent d’autres empreintes que celle-ci.';
  }
  return 'aucune surface connue pour cette empreinte.';
}

/**
 * Cherche une empreinte dans les surfaces connues.
 *
 * - même empreinte → correspondance (`matched`), le message dit où ;
 * - empreinte différente → aucune correspondance ;
 * - namespaces différents → aucune correspondance, et le message **dit**
 *   pourquoi : les empreintes ne sont pas comparables sans clé partagée.
 */
export function matchAcrossSurfaces(
  fingerprint: string,
  surfaces: readonly SurfaceSeen[],
  options: SurfaceMatchOptions = {},
): SurfaceMatch {
  const soughtNamespace = options.namespaceId ?? '';
  const matched = matchedOf(surfaces, fingerprint);
  const divergent = divergentOf(fingerprint, surfaces, matched, options.namespaceId);
  return {
    fingerprint,
    namespaceId: soughtNamespace,
    matched,
    divergent,
    namespaces: [...new Set(surfaces.map((seen) => seen.namespaceId))],
    comparable: matched.length > 0,
    message: buildMessage(matched, divergent, surfaces, options.namespaceId),
  };
}
