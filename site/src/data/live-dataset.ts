// Construction du dataset LIVE à partir de la charge utile du webtrigger.
//
// Le contrat live expose : `generatedAt`, `mode`, `site`, `registry`,
// `building`, `foyers`, `budget`, `coverage`, `certificate`. Tout le reste
// (espaces, expositions, propriétaires, titres, file d'adoption, historique
// de rituel) est soit transporté dans `site`, soit DÉDUIT du registre live —
// et la déduction est écrite comme telle (méthode affichée), jamais inventée.

import type { Foyer, OwnerMethod, OwnerResolution, PageExposure, PurgeRequest, RegistryRow, RitualStepState, SpaceSettings } from '@placard-wiki/domain';
import type { WikiPageMeta } from '@placard-wiki/propagation';
import type { LivePayload } from '../lib/live.js';
import { isObject, objectRecord, stringList } from './dataset.js';
import type { OrphanPage, PlacardDataset, PropagationEntry, SpaceRef } from './dataset.js';
import { defaultSettingsFor } from './settings.js';
import { DEMO_SITE_NAME } from '../lib/live-config.js';

const OWNER_METHODS: readonly OwnerMethod[] = ['declared-owner', 'last-editors', 'space-lead', 'teamwork-graph', 'adoption-queue'];

/** Méthode affichée quand l'exposition est déduite du registre live. */
const DERIVED_EXPOSURE_METHOD =
  'Fourchette dérivée du registre live : le flux ne transporte pas la méthode de calcul d’origine (méthode réelle : permissions de l’espace + restrictions de la page + état du partage).';
const DERIVED_AI_METHOD =
  'Présumée indexée si la page est lisible par Rovo — hypothèse conservatrice, l’index réel n’est pas interrogé (§13).';
const DERIVED_OWNER_CAVEAT = 'Méthode déduite du registre live (le flux ne transporte pas la confiance d’origine).';

/** Une méthode de propriétaire connue ? */
function ownerMethodOf(value: unknown): OwnerMethod | undefined {
  return typeof value === 'string' && (OWNER_METHODS as readonly string[]).includes(value) ? (value as OwnerMethod) : undefined;
}

/** Le contenu du sac `site` — objet libre, lu avec prudence. */
function siteBag(site: unknown): Record<string, unknown> {
  return objectRecord(site);
}

/** Espaces : ce que `site` transporte, sinon les clés vues dans les données. */
function spacesOf(bag: Record<string, unknown>, rows: readonly RegistryRow[], building: unknown): SpaceRef[] {
  const raw = bag['spaces'];
  if (Array.isArray(raw)) {
    const parsed = raw
      .map((space) => {
        if (typeof space === 'string') return { key: space, fr: space, en: space };
        if (!isObject(space)) return null;
        const key = typeof space['key'] === 'string' ? space['key'] : typeof space['spaceKey'] === 'string' ? space['spaceKey'] : null;
        if (key === null) return null;
        return {
          key,
          fr: typeof space['fr'] === 'string' ? space['fr'] : key,
          en: typeof space['en'] === 'string' ? space['en'] : key,
        };
      })
      .filter((space): space is SpaceRef => space !== null);
    if (parsed.length > 0) return parsed;
  }
  const keys = new Set<string>();
  for (const row of rows) if (row.spaceKey) keys.add(row.spaceKey);
  const wings = isObject(building) && Array.isArray(building['wings']) ? building['wings'] : [];
  for (const wing of wings) {
    if (isObject(wing) && typeof wing['spaceKey'] === 'string') keys.add(wing['spaceKey']);
  }
  return [...keys].map((key) => ({ key, fr: key, en: key }));
}

/** Titres de pages : `site.titles` sinon le titre porté par le registre. */
function titlesOf(bag: Record<string, unknown>, rows: readonly RegistryRow[]): Record<string, string> {
  const raw = bag['titles'];
  const titles: Record<string, string> = {};
  if (isObject(raw)) {
    for (const [pageId, title] of Object.entries(raw)) if (typeof title === 'string') titles[pageId] = title;
  }
  for (const row of rows) if (row.pageTitle && !titles[row.pageId]) titles[row.pageId] = row.pageTitle;
  return titles;
}

/** Expositions : `site.exposures` sinon déduites du registre (méthode dite). */
function exposuresOf(bag: Record<string, unknown>, rows: readonly RegistryRow[]): Record<string, PageExposure> {
  const raw = bag['exposures'];
  if (isObject(raw)) return raw as unknown as Record<string, PageExposure>;
  const exposures: Record<string, PageExposure> = {};
  for (const row of rows) {
    if (exposures[row.pageId]) continue;
    exposures[row.pageId] = {
      pageId: row.pageId,
      spaceKey: row.spaceKey,
      readers: { low: row.readersLow, high: row.readersHigh, method: DERIVED_EXPOSURE_METHOD, caveats: [] },
      sharing: row.sharing as PageExposure['sharing'],
      restrictions: [],
      aiSurface: { presumedIndexed: row.aiSurface, hypothesis: true, method: DERIVED_AI_METHOD },
      computedAt: row.lastSeenAt,
    };
  }
  return exposures;
}

/** Propriétaires : `site.owners` sinon déduits du registre (confiance dite). */
function ownersOf(bag: Record<string, unknown>, rows: readonly RegistryRow[]): Record<string, OwnerResolution> {
  const raw = bag['owners'];
  if (isObject(raw)) return raw as unknown as Record<string, OwnerResolution>;
  const owners: Record<string, OwnerResolution> = {};
  for (const row of rows) {
    if (!row.ownerRef || owners[row.pageId]) continue;
    const method = ownerMethodOf(row.ownerMethod);
    owners[row.pageId] = {
      pageId: row.pageId,
      ownerRef: row.ownerRef,
      method: method ?? 'adoption-queue',
      confidence: 'medium',
      resolvedAt: row.lastSeenAt,
      caveat: method === undefined ? DERIVED_OWNER_CAVEAT : undefined,
    };
  }
  return owners;
}

/** File d'adoption : `site.orphanPages` sinon les pages sans propriétaire. */
function orphanPagesOf(bag: Record<string, unknown>, rows: readonly RegistryRow[]): OrphanPage[] {
  const raw = bag['orphanPages'];
  if (Array.isArray(raw)) return raw as unknown as OrphanPage[];
  return rows
    .filter((row) => !row.ownerRef)
    .map((row) => ({ pageId: row.pageId, title: row.pageTitle, spaceKey: row.spaceKey, lastEditors: [] }));
}

/** Historique de rituel : `site.rituals` sinon vide (déclaré). */
function ritualsOf(bag: Record<string, unknown>): Record<string, RitualStepState[]> {
  const raw = bag['rituals'];
  return isObject(raw) ? (raw as unknown as Record<string, RitualStepState[]>) : {};
}

/** Demandes de purge : `site.purgeRequests` sinon vide (déclaré). */
function purgeRequestsOf(bag: Record<string, unknown>): Record<string, PurgeRequest[]> {
  const raw = bag['purgeRequests'];
  return isObject(raw) ? (raw as unknown as Record<string, PurgeRequest[]>) : {};
}

/** Angles morts affichés : `site` puis le certificat puis la couverture. */
function blindSpotsOf(bag: Record<string, unknown>, payload: LivePayload): readonly string[] {
  const raw = stringList(bag['coverageBlindSpots']);
  if (raw.length > 0) return raw;
  if (payload.certificate.blindSpots.length > 0) return payload.certificate.blindSpots;
  return payload.coverage.blindSpots;
}

/**
 * Métadonnées de pages pour la propagation : `site.pagesMeta` sinon première
 * détection par page (limite documentée du paquet propagation : « à défaut,
 * première détection »).
 */
function pagesMetaOf(bag: Record<string, unknown>, foyers: Record<string, Foyer>, titles: Record<string, string>): WikiPageMeta[] {
  const raw = bag['pagesMeta'];
  if (Array.isArray(raw)) {
    const parsed = raw
      .map((page) => {
        if (!isObject(page)) return null;
        const pageId = typeof page['pageId'] === 'string' ? page['pageId'] : null;
        const createdAt = typeof page['createdAt'] === 'string' ? page['createdAt'] : null;
        if (pageId === null || createdAt === null) return null;
        const title = typeof page['title'] === 'string' ? page['title'] : titles[pageId] ?? pageId;
        const templateId = typeof page['templateId'] === 'string' ? page['templateId'] : undefined;
        const duplicatedFromPageId = typeof page['duplicatedFromPageId'] === 'string' ? page['duplicatedFromPageId'] : undefined;
        return {
          pageId,
          title,
          createdAt,
          ...(templateId !== undefined ? { templateId } : {}),
          ...(duplicatedFromPageId !== undefined ? { duplicatedFromPageId } : {}),
        };
      })
      .filter((page): page is WikiPageMeta => page !== null);
    if (parsed.length > 0) return parsed;
  }
  const firstSeen = new Map<string, string>();
  for (const foyer of Object.values(foyers)) {
    for (const location of foyer.locations) {
      const seen = firstSeen.get(location.pageId);
      if (seen === undefined || location.detectedAt < seen) firstSeen.set(location.pageId, location.detectedAt);
    }
  }
  return [...firstSeen.entries()].map(([pageId, createdAt]) => ({ pageId, title: titles[pageId] ?? pageId, createdAt }));
}

/** Foyers proposés à l'écran de propagation : ceux qui vivent à plusieurs endroits. */
function propagationFoyersOf(foyers: Record<string, Foyer>): PropagationEntry[] {
  return Object.values(foyers)
    .filter((foyer) => new Set(foyer.locations.map((location) => location.pageId)).size > 1)
    .map((foyer) => ({ id: foyer.id, foyer }));
}

/** Réglages initiaux : un jeu par espace live (familles actives, seuil 0). */
function settingsOf(spaces: readonly SpaceRef[], bag: Record<string, unknown>): Record<string, SpaceSettings> {
  const raw = bag['settings'];
  if (isObject(raw)) return raw as unknown as Record<string, SpaceSettings>;
  const settings: Record<string, SpaceSettings> = {};
  for (const space of spaces) settings[space.key] = defaultSettingsFor(space.key);
  return settings;
}

/** Construit le dataset live complet à partir de la charge utile du contrat. */
export function buildLiveDataset(payload: LivePayload): PlacardDataset {
  const bag = siteBag(payload.site);
  const rows = payload.registry;
  const spaces = spacesOf(bag, rows, payload.building);
  const titles = titlesOf(bag, rows);
  // Le nom du site balayé : celui du flux, sinon le site de démo connu.
  const name = typeof bag['name'] === 'string' ? bag['name'] : payload.site.name ?? DEMO_SITE_NAME;
  const url = typeof bag['url'] === 'string' ? bag['url'] : payload.site.url;
  return {
    source: 'live',
    generatedAt: payload.generatedAt,
    siteName: name,
    ...(url !== undefined ? { siteUrl: url } : {}),
    spaces,
    foyers: payload.foyers,
    registryRows: rows,
    building: payload.building,
    budget: payload.budget,
    coverage: payload.coverage,
    coverageBlindSpots: blindSpotsOf(bag, payload),
    certificate: payload.certificate,
    exposures: exposuresOf(bag, rows),
    owners: ownersOf(bag, rows),
    orphanPages: orphanPagesOf(bag, rows),
    rituals: ritualsOf(bag),
    purgeRequests: purgeRequestsOf(bag),
    titles,
    pagesMeta: pagesMetaOf(bag, payload.foyers, titles),
    propagationFoyers: propagationFoyersOf(payload.foyers),
    propExposure: new Map<string, number>(),
    propTitles: {},
    initialSettings: settingsOf(spaces, bag),
  };
}
