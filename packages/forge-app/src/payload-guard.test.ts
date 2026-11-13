/**
 * Garde de la charge utile live — le JSON que sert le webtrigger public.
 *
 * La charge utile est **reconstruite avec la même fonction** que le
 * webtrigger (`buildPublicDemo`, extraite dans `services/public-payload.ts`),
 * à partir du même store et du même client Confluence. Ce n'est donc pas une
 * copie de la production : c'est la production, rejouée en mémoire.
 *
 * Le cas mesuré : les **titres** de l'espace de démonstration contiennent des
 * faux secrets. La charge utile les publie — mais **masqués**. Ce test
 * l'exige, titre par titre.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { assertNoCanary, CANARIES } from './test-support/canaries';
import { canaryPages } from './test-support/canary-pages';
import { HMAC_KEY, runPreuve } from './test-support/preuve';
import type { Preuve } from './test-support/preuve';

/** Le texte contient-il au moins une valeur de test ? */
function contientUnCanari(texte: string): boolean {
  return CANARIES.some((canary) => texte.includes(canary.value));
}

describe('garde de la charge utile live (webtrigger `pw-public-demo`)', () => {
  let preuve: Preuve;

  beforeAll(async () => {
    preuve = await runPreuve();
  });

  it('la charge utile est bien produite par la fonction du webtrigger', () => {
    expect(preuve.payload.mode).toBe('live');
    expect(preuve.payload.registry.length).toBeGreaterThan(0);
    expect(Object.keys(preuve.payload.foyers).length).toBeGreaterThan(0);
  });

  it('aucune valeur de test dans la charge utile complète', () => {
    assertNoCanary(JSON.stringify(preuve.payload), 'charge utile du webtrigger', HMAC_KEY);
  });

  it('aucune valeur de test dans les TITRES de pages publiés', () => {
    const pages = canaryPages();
    const titresPublies = preuve.payload.site.titles;
    expect(Object.keys(titresPublies).length).toBeGreaterThan(0);
    for (const page of pages) {
      const publie = titresPublies[page.id];
      if (publie === undefined) continue;
      // Le titre publié ne porte aucune valeur de test…
      assertNoCanary(publie, `titre publié de la page ${page.id}`, HMAC_KEY);
      // … et, s'il en portait une, il a été masqué (le cas mesuré : les
      // titres de la démo contiennent des faux secrets).
      if (contientUnCanari(page.title)) expect(publie).not.toBe(page.title);
    }
  });

  it('les titres du registre sont eux aussi masqués', () => {
    const pages = canaryPages();
    for (const row of preuve.payload.registry) {
      const page = pages.find((candidate) => candidate.id === row.pageId);
      if (page === undefined) continue;
      assertNoCanary(row.pageTitle, `titre de registre de la page ${row.pageId}`, HMAC_KEY);
      if (contientUnCanari(page.title)) expect(row.pageTitle).not.toBe(page.title);
    }
  });

  it('la charge utile ne porte aucun bloc de clé privée', () => {
    const serialisee = JSON.stringify(preuve.payload);
    expect(serialisee).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(serialisee).not.toContain('-----END');
  });
});
