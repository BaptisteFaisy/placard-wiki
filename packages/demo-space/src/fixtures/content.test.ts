/**
 * Tests des contenus Confluence par gîte (§6) : le storage XML porte bien les
 * valeurs factices (échappées), les titres/commentaires les portent en clair,
 * la version 2 de l'historique est « corrigée » (plus aucun secret), et les
 * pièces jointes utilisent `.env`/`.pem`.
 */

import { describe, expect, it } from 'vitest';

import {
  attachementDe,
  commentaireSecret,
  corpsDePageXml,
  echapperXml,
  espaceDescriptionXml,
  historiqueV1Xml,
  historiqueV2Xml,
  identifiantDe,
  modelePageXml,
  pagePartageeXml,
  titreSecret,
} from './content.js';
import { MARQUE_SYNTHETIQUE, fixturesDuGite } from './index.js';

const corps = fixturesDuGite('corps-de-page');
const commentaires = fixturesDuGite('commentaires');
const titres = fixturesDuGite('titres-et-etiquettes');
const historique = fixturesDuGite('historique-de-versions');
const description = fixturesDuGite('description-espace');
const modeles = fixturesDuGite('modeles-de-page');
const attachments = fixturesDuGite('pieces-jointes');

describe('échappement XML', () => {
  it('échappe &, < et >', () => {
    expect(echapperXml('a&b<c>d')).toBe('a&amp;b&lt;c&gt;d');
  });
});

describe('corps de page (tableau d’identifiants)', () => {
  const xml = corpsDePageXml(corps);
  it('est un tableau storage avec en-têtes identifiant/mot de passe', () => {
    expect(xml).toContain('<table>');
    expect(xml).toContain('Identifiant');
    expect(xml).toContain('Mot de passe');
    expect(xml).toContain(MARQUE_SYNTHETIQUE);
  });
  it('porte les 12 valeurs échappées et un identifiant par ligne', () => {
    for (const f of corps) {
      expect(xml).toContain(echapperXml(f.value));
      expect(xml).toContain(echapperXml(identifiantDe(f)));
    }
  });
});

describe('commentaires', () => {
  it('dit « le mot de passe est … » et porte la valeur en clair', () => {
    for (const f of commentaires) {
      const texte = commentaireSecret(f);
      expect(texte).toContain('Le mot de passe est');
      expect(texte).toContain(f.value);
      expect(texte).toContain(MARQUE_SYNTHETIQUE);
    }
  });
});

describe('titres', () => {
  it('« accès staging (mdp: …) » avec la valeur et la marque', () => {
    for (const f of titres) {
      const titre = titreSecret(f);
      expect(titre).toContain('accès staging (mdp:');
      expect(titre).toContain(f.value);
      expect(titre).toContain(MARQUE_SYNTHETIQUE);
    }
  });
});

describe('historique de versions', () => {
  const v1 = historiqueV1Xml(historique);
  const v2 = historiqueV2Xml();
  it('v1 porte les secrets (échappés)', () => {
    for (const f of historique) expect(v1).toContain(echapperXml(f.value));
  });
  it('v2 est corrigée : plus aucune valeur, mais une mention', () => {
    for (const f of historique) expect(v2).not.toContain(echapperXml(f.value));
    expect(v2).toContain(MARQUE_SYNTHETIQUE);
  });
});

describe('description d’espace', () => {
  const xml = espaceDescriptionXml(description);
  it('porte les 12 valeurs et la marque', () => {
    for (const f of description) expect(xml).toContain(echapperXml(f.value));
    expect(xml).toContain(MARQUE_SYNTHETIQUE);
  });
});

describe('modèle de page', () => {
  const xml = modelePageXml(modeles);
  it('recopie le tableau et porte la marque', () => {
    expect(xml).toContain('<table>');
    expect(xml).toContain('Runbook modèle');
    expect(xml).toContain(MARQUE_SYNTHETIQUE);
  });
});

describe('page partagée', () => {
  const xml = pagePartageeXml(corps);
  it('recopie le tableau (amplification) et porte la marque', () => {
    expect(xml).toContain('<table>');
    expect(xml).toContain('Partage public');
    expect(xml).toContain(MARQUE_SYNTHETIQUE);
  });
});

describe('pièces jointes', () => {
  it('private-key → .pem avec le bloc PEM', () => {
    const f = attachments.find((x) => x.family === 'private-key')!;
    const att = attachementDe(f);
    expect(att.filename).toMatch(/\.pem$/);
    expect(att.content).toBe(f.value);
  });
  it('risky-file → nom de fichier .env…', () => {
    const f = attachments.find((x) => x.family === 'risky-file')!;
    const att = attachementDe(f);
    expect(att.filename).toBe(f.value);
    expect(att.filename).toMatch(/^\.env/);
  });
  it('les autres familles → .env avec la valeur dans le contenu', () => {
    for (const f of attachments) {
      if (f.family === 'private-key' || f.family === 'risky-file') continue;
      const att = attachementDe(f);
      expect(att.filename).toMatch(/\.env$/);
      expect(att.content).toContain(f.value);
    }
  });
});