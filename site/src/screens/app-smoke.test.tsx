// Test de fumée : l'arbre React entier doit se rendre sans réseau.
// Garantit que le build statique reste autonome (Pages, hors ligne).

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../App.js';

describe('App — rendu statique sans réseau', () => {
  it('se rend sans URL live configurée (mode snapshot)', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('SNAPSHOT');
    expect(html).toContain('Placard du wiki');
  });
});
