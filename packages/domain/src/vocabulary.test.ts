import { describe, expect, it } from 'vitest';
import {
  FAMILY_LABELS,
  FORBIDDEN_ASSERTIONS,
  GITES,
  OWNER_METHOD_LABELS,
  RITUAL_STEPS,
  giteOf,
} from './vocabulary.js';

describe('vocabulaire du produit (§4, §6)', () => {
  it('les familles couvrent les douze numéros du cahier (§7)', () => {
    // Onze identifiants : `bank-data` (hérité de placard) couvre IBAN (6) et carte (7).
    expect(Object.keys(FAMILY_LABELS)).toHaveLength(11);
    const numbers: number[] = [];
    for (const [family, label] of Object.entries(FAMILY_LABELS)) {
      expect(label.fr.length, family).toBeGreaterThan(3);
      expect(label.en.length, family).toBeGreaterThan(3);
      expect(label.numbers.length, family).toBeGreaterThan(0);
      numbers.push(...label.numbers);
    }
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('les sept gîtes sont décrits (pourquoi + impact)', () => {
    expect(GITES).toHaveLength(7);
    for (const gite of GITES) {
      expect(gite.why.length).toBeGreaterThan(5);
      expect(gite.impact.length).toBeGreaterThan(5);
    }
  });

  it('le rituel a cinq étapes, dans l’ordre du cahier', () => {
    expect(RITUAL_STEPS).toEqual(['rotate', 'redact', 'purge', 'prevent', 'verify']);
  });

  it('giteOf retrouve les sept gîtes depuis (conteneur, champ)', () => {
    expect(giteOf('page', 'body')).toBe('corps-de-page');
    expect(giteOf('page', 'title')).toBe('titres-et-etiquettes');
    expect(giteOf('page', 'labels')).toBe('titres-et-etiquettes');
    expect(giteOf('comment', 'body')).toBe('commentaires');
    expect(giteOf('attachment', 'text')).toBe('pieces-jointes');
    expect(giteOf('version', 'body')).toBe('historique-de-versions');
    expect(giteOf('template', 'body')).toBe('modeles-de-page');
    expect(giteOf('space-desc', 'description')).toBe('description-espace');
  });

  it('la cascade de propriétaire a cinq méthodes (§12)', () => {
    expect(Object.keys(OWNER_METHOD_LABELS)).toHaveLength(5);
  });

  it('les assertions interdites portent leur formulation honnête (§4)', () => {
    expect(FORBIDDEN_ASSERTIONS.length).toBeGreaterThanOrEqual(3);
    for (const rule of FORBIDDEN_ASSERTIONS) {
      expect(rule.instead.length).toBeGreaterThan(5);
    }
  });
});
