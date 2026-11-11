/**
 * Regroupement empreinte → foyer (§11, PLA-F-06 adapté au wiki).
 *
 * Logique conceptuelle réemployée depuis `vendor/placard/packages/analysis/src/
 * group.ts` : la clé de regroupement est l'empreinte HMAC (jamais la valeur),
 * les emplacements sont triés de façon déterministe, et l'identifiant du groupe
 * est dérivé de l'empreinte pour rester stable d'un balayage à l'autre.
 * Adaptation wiki : le groupe devient un `Foyer` persistant, fusionnable avec
 * les foyers existants, et chaque emplacement porte un statut
 * (`present` / `redacted` / `vanished`).
 */

import {
  BASE_SCORE_BY_FAMILY,
  computeDanger,
  giteOf,
  type Foyer,
  type FoyerLocation,
} from '@placard-wiki/domain';

import type { WikiDetection, WikiPageMeta } from './detection.js';

/** Hachage FNV-1a 32 bits — identifiants déterministes, sans dépendance. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Identifiant stable du foyer : dérivé de l'empreinte, jamais de la valeur. */
export function foyerIdOf(fingerprint: string): string {
  return `foyer-${fingerprint.slice(0, 16)}`;
}

/** Clé de déduplication d'un emplacement : même conteneur, même position. */
function locationKeyOf(d: WikiDetection): string {
  return `${d.containerAri}|${d.field}|${d.charStart ?? ''}|${d.versionNumber ?? ''}`;
}

/** Statut d'un emplacement : supprimé (§24) > caviardé > présent. */
function statutDe(
  d: WikiDetection,
  pagesParId: ReadonlyMap<string, WikiPageMeta>,
): FoyerLocation['status'] {
  const page = pagesParId.get(d.pageId);
  if (page?.deleted === true) return 'vanished';
  if (d.redactedAt !== undefined) return 'redacted';
  return 'present';
}

/** Construit l'emplacement issu d'une détection (gîte déduit via §6). */
function locationDe(
  d: WikiDetection,
  foyerId: string,
  pagesParId: ReadonlyMap<string, WikiPageMeta>,
): FoyerLocation {
  return {
    id: `loc-${fnv1a(locationKeyOf(d))}`,
    foyerId,
    containerType: d.containerType,
    containerAri: d.containerAri,
    pageId: d.pageId,
    versionNumber: d.versionNumber,
    field: d.field,
    charStart: d.charStart,
    charEnd: d.charEnd,
    maskedPreview: d.maskedPreview,
    detectedAt: d.detectedAt,
    redactedAt: d.redactedAt,
    status: statutDe(d, pagesParId),
    gite: giteOf(d.containerType, d.field),
  };
}

/** Ordre déterministe des emplacements : gîte, page, date, identifiant. */
function compareLocations(a: FoyerLocation, b: FoyerLocation): number {
  if (a.gite !== b.gite) return a.gite < b.gite ? -1 : 1;
  if (a.pageId !== b.pageId) return a.pageId < b.pageId ? -1 : 1;
  if (a.detectedAt !== b.detectedAt) return a.detectedAt < b.detectedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Page principale du foyer — heuristique documentée : à défaut de données
 * d'exposition (calculées par le lot `exposure`), on prend l'emplacement
 * `present` le plus tôt détecté, en privilégiant les gîtes à forte audience
 * (description d'espace, modèle). Ce n'est qu'un choix d'affichage.
 */
function primaryPageDe(locations: readonly FoyerLocation[]): string | undefined {
  const priorité: Record<string, number> = {
    'description-espace': 0,
    'modeles-de-page': 1,
  };
  const présents = locations.filter((l) => l.status === 'present');
  const candidats = présents.length > 0 ? présents : locations;
  let meilleur: FoyerLocation | undefined;
  for (const l of candidats) {
    if (meilleur === undefined) {
      meilleur = l;
      continue;
    }
    const pA = priorité[meilleur.gite] ?? 2;
    const pB = priorité[l.gite] ?? 2;
    if (pB < pA || (pB === pA && l.detectedAt < meilleur.detectedAt)) meilleur = l;
  }
  return meilleur?.pageId;
}

/** Score de danger initial : le terme de base de la famille (§8). */
function scoreInitial(family: Foyer['family']): {
  baseScore: number;
  score: number;
  scoreTerms: Foyer['scoreTerms'];
} {
  const baseScore = BASE_SCORE_BY_FAMILY[family];
  const terms = [
    {
      id: 'base-famille',
      points: baseScore,
      label: `Score de base de la famille`,
      method: 'Barème par famille du cahier (§8) — terms d’exposition ajoutés par le lot exposure',
      evidence: `famille=${family}`,
    },
  ];
  return { baseScore, score: computeDanger(terms), scoreTerms: terms };
}

/** Fusionne un foyer existant avec de nouvelles détections (même empreinte). */
function fusionner(
  existant: Foyer,
  locations: FoyerLocation[],
  firstSeenAt: string,
  lastSeenAt: string,
): Foyer {
  const parId = new Map<string, FoyerLocation>();
  for (const l of [...existant.locations, ...locations]) parId.set(l.id, l);
  const fusionnées = [...parId.values()].sort(compareLocations);
  return {
    ...existant,
    locations: fusionnées,
    firstSeenAt: existant.firstSeenAt < firstSeenAt ? existant.firstSeenAt : firstSeenAt,
    lastSeenAt: existant.lastSeenAt > lastSeenAt ? existant.lastSeenAt : lastSeenAt,
    primaryPageId: primaryPageDe(fusionnées) ?? existant.primaryPageId,
  };
}

/** Construit (ou fusionne) le foyer d’un paquet de détections de même empreinte. */
function foyerDepuisPaquet(
  fingerprint: string,
  paquet: readonly WikiDetection[],
  pagesParId: ReadonlyMap<string, WikiPageMeta>,
  existant: Foyer | undefined,
): Foyer {
  const foyerId = foyerIdOf(fingerprint);
  const vus = new Map<string, FoyerLocation>();
  for (const d of paquet) {
    const loc = locationDe(d, foyerId, pagesParId);
    const precedent = vus.get(loc.id);
    // Dédup : à clé égale, la détection la plus récente l'emporte.
    if (precedent === undefined || loc.detectedAt > precedent.detectedAt) vus.set(loc.id, loc);
  }
  const locations = [...vus.values()].sort(compareLocations);
  const dates = paquet.map((d) => d.detectedAt);
  const firstSeenAt = dates.reduce((a, b) => (a < b ? a : b));
  const lastSeenAt = dates.reduce((a, b) => (a > b ? a : b));
  if (existant !== undefined) return fusionner(existant, locations, firstSeenAt, lastSeenAt);

  const premier = paquet[0];
  if (premier === undefined) throw new Error('foyerDepuisPaquet : paquet vide');
  const score = scoreInitial(premier.family);
  return {
    id: foyerId,
    fingerprint,
    family: premier.family,
    ...score,
    state: 'open',
    firstSeenAt,
    lastSeenAt,
    locations,
    primaryPageId: primaryPageDe(locations),
    spaceKey: undefined,
  };
}

/**
 * Regroupe les détections en foyers : une empreinte = un foyer, N
 * emplacements (§11). Les foyers existants sont mis à jour (état de
 * réparation préservé), les nouvelles empreintes ouvrent un foyer `open`.
 *
 * Limite documentée : un balayage peut être partiel (§14) — les emplacements
 * absents des nouvelles détections sont **conservés** tels quels ; c'est le
 * rituel (caviardage, purge) ou `markLocationsVanished` qui change un statut,
 * jamais l'absence dans un balayage incrémental.
 */
export function groupIntoFoyers(
  detections: readonly WikiDetection[],
  foyersExistants: readonly Foyer[] = [],
  pages: readonly WikiPageMeta[] = [],
): Foyer[] {
  const pagesParId = new Map(pages.map((p) => [p.pageId, p]));
  const existants = new Map(foyersExistants.map((f) => [f.fingerprint, f]));
  const paquets = new Map<string, WikiDetection[]>();

  for (const d of detections) {
    const paquet = paquets.get(d.fingerprint);
    if (paquet === undefined) paquets.set(d.fingerprint, [d]);
    else paquet.push(d);
  }

  const foyers: Foyer[] = [];
  for (const [fingerprint, paquet] of paquets) {
    foyers.push(foyerDepuisPaquet(fingerprint, paquet, pagesParId, existants.get(fingerprint)));
  }
  return foyers;
}
