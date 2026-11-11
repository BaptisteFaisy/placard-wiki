/**
 * Service d'exposition (§8, §13) : calcule l'exposition d'une page depuis les
 * lecteurs wiki-source et le paquet `@placard-wiki/exposure`.
 *
 * Chaque chiffre porte sa méthode ; les droits manquants et l'état de partage
 * non confirmable (§22) sont déclarés en `caveats`, jamais devinés.
 */

import { aiSurface, readersRange } from '@placard-wiki/exposure';
import type { PageExposure, SharingState } from '@placard-wiki/domain';
import type { RestrictionEntry, SpaceReadership } from '@placard-wiki/exposure';
import type { ConfluenceClient } from '@placard-wiki/wiki-source';

/** Option du calcul d'exposition. */
export interface ExposureOptions {
  /** Effectif total du site — plafond d'un partage public. */
  siteUsers?: number;
  /** Horodatage injectable (tests déterministes). */
  now?: string;
}

/** Audience de l'espace depuis ses permissions (heuristique documentée). */
function spaceReadership(
  entries: Awaited<ReturnType<ConfluenceClient['getSpacePermissions']>>,
  siteUsers?: number,
): SpaceReadership {
  let known = 0;
  let anyone = false;
  for (const e of entries) {
    if (e.operation !== 'read') continue;
    if (e.type === 'anyone') anyone = true;
    else if (e.type === 'known') known += 1;
  }
  if (anyone) return { low: known, high: siteUsers ?? known };
  return { low: known, high: known };
}

/** Restrictions de lecture → entrées non résolues (les groupes imbriqués élargissent). */
function toRestrictionEntries(read: readonly string[]): RestrictionEntry[] {
  return read.map((name) => ({ type: 'group' as const, name }));
}

/** État du partage wiki-source → SharingState du domaine (§22 : souvent `unknown`). */
function toSharingState(raw: { anyoneWithLink: boolean | 'unknown' }): SharingState {
  if (raw.anyoneWithLink === true) return 'anyone-with-link';
  return 'space-default';
}

/**
 * Calcule l'exposition d'une page. Les lecteurs potentiels sont une FOURCHETTE
 * (jamais un nombre exact) ; la surface IA est une hypothèse conservatrice.
 */
export async function computePageExposure(
  client: ConfluenceClient,
  pageId: string,
  spaceKey: string,
  options: ExposureOptions = {},
): Promise<PageExposure> {
  const [restrictions, sharingRaw, permissions] = await Promise.all([
    client.getRestrictions(pageId),
    client.getSharingState(pageId),
    client.getSpacePermissions(spaceKey).catch(() => []),
  ]);
  const sharing = toSharingState(sharingRaw);
  const restrictionEntries = toRestrictionEntries(restrictions.read);
  const space = spaceReadership(permissions, options.siteUsers);
  const missingRights: string[] = [];
  if (permissions.length === 0) {
    missingRights.push('read:confluence-space (permissions de l’espace illisibles)');
  }
  const readers = readersRange({
    space,
    restrictions: restrictionEntries,
    sharing,
    siteUsers: options.siteUsers,
    missingRights,
  });
  if (sharingRaw.anyoneWithLink === 'unknown') {
    readers.caveats.push(
      'État du partage « anyone with the link » non confirmable par API (§22) : ' +
      'hypothèse conservatrice, le terme de partage public n’est pas appliqué.',
    );
  }
  const surface = aiSurface({ readableByRovo: 'unknown' });
  return {
    pageId,
    spaceKey,
    readers,
    sharing,
    restrictions: restrictionEntries.map((r) => ({ type: r.type, name: r.name })),
    aiSurface: surface,
    computedAt: options.now ?? new Date().toISOString(),
  };
}