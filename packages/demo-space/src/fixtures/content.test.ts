/**
 * Tests des contenus Confluence par gîte (§6) : le storage XML porte bien les
 * valeurs factices (échappées), les titres/commentaires les portent en clair,
 * la version 2 de l'historique est « corrigée » (plus aucun secret), et les
 * pièces jointes utilisent `.env`/`.pem`.
 */

import { describe, expect, it } from 'vitest';

import {
  TITRE_MAX_CARACTERES,
  attachementDe,
  commentaireSecret,
  commentaireXml,
  corpsDePageXml,
  echapperXml,
  espaceDescriptionTexte,
  historiqueV1Xml,
  historiqueV2Xml,
  identifiantDe,
  modelePageXml,
  pagePartageeXml,
  surUneLigne,
  texteNu,
  titreSecret,
} from './content';
import { MARQUE_SYNTHETIQUE, fixturesDuGite } from './index';

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

  it('le storage XML est un paragraphe échappé (& refusé nu par Confluence)', () => {
    for (const f of commentaires) {
      const xml = commentaireXml(f);
      expect(xml.startsWith('<p>')).toBe(true);
      expect(xml.endsWith('</p>')).toBe(true);
      expect(xml).toContain(echapperXml(f.value));
      expect(xml.replace(/&[a-zA-Z#0-9]+;/g, '')).not.toContain('&');
    }
  });

  it('le corps relu normalisé par Confluence se compare au corps envoyé', () => {
    const f = commentaires.find((x) => x.family === 'credential-table')!;
    // Confluence réécrit les accents en entités et conserve `&amp;`.
    const relu = commentaireXml(f)
      .replace('SYNTHÉTIQUE', 'SYNTH&Eacute;TIQUE')
      .replace('—', '&mdash;')
      .replace('démo', 'd&eacute;mo');
    expect(texteNu(relu)).toBe(texteNu(commentaireXml(f)));
    expect(texteNu(relu)).toContain(f.value);
  });
});

describe('titres', () => {
  it('« accès staging (mdp: …) » avec la marque, et jamais plus de 255 caractères', () => {
    for (const f of titres) {
      const titre = titreSecret(f);
      expect(titre).toContain('accès staging (mdp:');
      expect(titre).toContain(MARQUE_SYNTHETIQUE);
      expect(titre.length).toBeLessThanOrEqual(TITRE_MAX_CARACTERES);
    }
  });

  it('porte la valeur intacte quand elle tient sur une ligne dans la limite', () => {
    for (const f of titres) {
      if (surUneLigne(f.value).length > 180) continue;
      expect(titreSecret(f)).toContain(surUneLigne(f.value));
    }
  });

  it('un bloc PEM trop long est borné mais garde ses marqueurs BEGIN/END', () => {
    const f = titres.find((x) => x.family === 'private-key')!;
    const titre = titreSecret(f);
    expect(titre.length).toBe(TITRE_MAX_CARACTERES);
    expect(titre).toContain('-----BEGIN');
    expect(titre).toContain('PRIVATE KEY-----');
    expect(titre).not.toContain('\n');
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
  const texte = espaceDescriptionTexte(description);
  it('porte les 12 valeurs et la marque, en texte brut (représentation `plain`)', () => {
    for (const f of description) expect(texte).toContain(f.value);
    expect(texte).toContain(MARQUE_SYNTHETIQUE);
    // L'API refuse toute autre représentation : aucune balise dans la description.
    expect(texte).not.toContain('<');
    expect(texte.split('\n')[0]).toBe(MARQUE_SYNTHETIQUE);
    // Une ligne par valeur au minimum (le bloc PEM de la famille 3 en porte six).
    expect(texte.split('\n').length).toBeGreaterThanOrEqual(description.length + 1);
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