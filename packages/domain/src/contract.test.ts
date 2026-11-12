/**
 * Le contrat ne peut pas diverger de son schéma.
 *
 * Le schéma (`docs/api-live.schema.json`) fait foi ; les énumérations
 * TypeScript du domaine doivent dire exactement la même chose. Ce test
 * compare les deux, membre à membre : une énumération oubliée d'un côté
 * casse le test, pas la production.
 */

import { describe, expect, it } from 'vitest';

import schema from '../../../docs/api-live.schema.json';
import {
  LIVE_CONTRACT_CONTENT_FIELDS,
  LIVE_CONTRACT_CONTAINER_TYPES,
  LIVE_CONTRACT_FAMILIES,
  LIVE_CONTRACT_FOYER_STATES,
  LIVE_CONTRACT_GITES,
  LIVE_CONTRACT_HEADER,
  LIVE_CONTRACT_LOCATION_STATUSES,
  LIVE_CONTRACT_OWNER_METHODS,
  LIVE_CONTRACT_SHARING_STATES,
  LIVE_CONTRACT_VERSION,
} from './contract';

/** Les définitions du schéma, telles que typées. */
const DEFS = schema['$defs'] as Record<string, { enum?: string[] }>;

/** L'énumération d'une définition du schéma. */
function schemaEnum(name: string): string[] {
  const definition = DEFS[name];
  if (definition === undefined || definition.enum === undefined) {
    throw new Error(`définition de schéma introuvable ou sans énumération : ${name}`);
  }
  return [...definition.enum].sort();
}

describe('contrat — version', () => {
  it('le schéma porte la version du contrat', () => {
    expect(schema['x-contract-version']).toBe(LIVE_CONTRACT_VERSION);
    expect(schema['x-contract-header']).toBe(LIVE_CONTRACT_HEADER);
  });

  it('l’identifiant du schéma contient la version', () => {
    expect(String(schema['$id'])).toContain(LIVE_CONTRACT_VERSION);
  });

  it('le schéma est un JSON Schema draft 2020-12', () => {
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
  });
});

describe('contrat — énumérations alignées sur le schéma', () => {
  it('les familles', () => {
    expect(schemaEnum('family')).toEqual([...LIVE_CONTRACT_FAMILIES].sort());
  });

  it('les états de foyer', () => {
    expect(schemaEnum('foyerState')).toEqual([...LIVE_CONTRACT_FOYER_STATES].sort());
  });

  it('les gîtes', () => {
    expect(schemaEnum('gite')).toEqual([...LIVE_CONTRACT_GITES].sort());
  });

  it('les types de conteneur', () => {
    expect(schemaEnum('containerType')).toEqual([...LIVE_CONTRACT_CONTAINER_TYPES].sort());
  });

  it('les champs de contenu', () => {
    expect(schemaEnum('contentField')).toEqual([...LIVE_CONTRACT_CONTENT_FIELDS].sort());
  });

  it('les états d’emplacement', () => {
    expect(schemaEnum('locationStatus')).toEqual([...LIVE_CONTRACT_LOCATION_STATUSES].sort());
  });

  it('les états de partage', () => {
    expect(schemaEnum('sharingState')).toEqual([...LIVE_CONTRACT_SHARING_STATES].sort());
  });

  it('les méthodes de propriétaire', () => {
    expect(schemaEnum('ownerMethod')).toEqual([...LIVE_CONTRACT_OWNER_METHODS].sort());
  });
});
