/**
 * Garde réseau — le code ne parle qu'à la liste blanche.
 *
 * Une **analyse de source** (aucun réseau réel) : le paquet Forge ne doit avoir
 * aucune sortie hors Confluence, Teamwork Graph, Jira et l'oracle LLM. C'est la
 * contrepartie statique de la garde dynamique (qui borne le `fetch` pendant la
 * passe) : celle-ci vérifie que le code ne peut pas sortir, même plus tard.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** La source du paquet, lue depuis ce fichier de test. */
const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Les hôtes autorisés en dur dans le code (URL d'affichage du site, rien de plus). */
const HOTE_AUTORISE = new Set(['one-atlas-cndz.atlassian.net']);

/**
 * Le SEUL module qui parle au réseau : le relais LLM (la clé InferHub reste
 * hors d'Atlassian). Il n'a droit qu'au `fetch` du SDK — jamais `http`, ni
 * `axios`, ni une URL en dur : l'adresse vient d'une variable Forge.
 */
const MODULES_RESEAU_AUTORISES = new Set(['/runtime/llm-relay.ts']);

/** Les hôtes que le manifeste autorise en sortie backend. */
const HÔTES_SORTIE_AUTORISÉS = new Set(['r630-debian.tail3a8bdf.ts.net']);

/** Les fournisseurs que le code ne doit **jamais** mentionner. */
const FOURNISSEURS_INTERDITS = [
  'amazonaws.com', 'stripe.com', 'github.com', 'api.github.com',
  'gitlab.com', 'googleapis.com', 'openai.com', 'anthropic.com', 'twilio.com',
  'sendgrid.com', 'mailchimp', 'slack.com', 'discord.com', 'datadoghq.com',
  'sentry.io', 'azure.com', 'cloudflare',
];

/** Les verbes réseau autorisés (SDK Forge + LLM hébergé). */
const VERBES_AUTORISES = ['requestConfluence', 'requestJira', 'requestTeamworkGraph', 'chat'];

/** Les primitives réseau directes que rien ne doit employer. */
const RESEAU_DIRECT = ['fetch(', 'http.get', 'http.request', 'https.get', 'https.request', 'axios', 'XMLHttpRequest', 'WebSocket'];

/** Les fichiers sources du paquet (les tests exclus : ils n'embarquent pas). */
function fichiersSource(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const visiter = (dir: string): void => {
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      const chemin = `${dir}/${entree.name}`;
      if (entree.isDirectory()) {
        visiter(chemin);
        continue;
      }
      if (!entree.name.endsWith('.ts') || entree.name.endsWith('.test.ts')) continue;
      out.push({ path: chemin.replace(SRC, ''), text: readFileSync(chemin, 'utf8') });
    }
  };
  visiter(SRC);
  return out;
}

describe('garde réseau — analyse de source du paquet Forge', () => {
  const fichiers = fichiersSource();

  it('la source est bien lue (garde non vide)', () => {
    expect(fichiers.length).toBeGreaterThan(20);
  });

  it('aucun hôte hors liste blanche dans les URL du code', () => {
    const hote = /https?:\/\/([^/?"'\s)]+)/g;
    for (const fichier of fichiers) {
      for (const match of fichier.text.matchAll(hote)) {
        const accueil = (match[1] ?? '').split(':')[0] ?? '';
        expect(HOTE_AUTORISE.has(accueil), `hôte ${accueil} dans ${fichier.path}`).toBe(true);
      }
    }
  });

  it('aucun fournisseur interdit mentionné nulle part', () => {
    for (const fichier of fichiers) {
      const bas = fichier.text.toLowerCase();
      for (const interdit of FOURNISSEURS_INTERDITS) {
        expect(bas, `${fichier.path} mentionne ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it('aucune primitive réseau directe (fetch, http, axios…)', () => {
    for (const fichier of fichiers) {
      const reseauAutorise = MODULES_RESEAU_AUTORISES.has(fichier.path);
      for (const primitive of RESEAU_DIRECT) {
        // Le relais a droit au `fetch` du SDK, et à rien d'autre.
        if (reseauAutorise && primitive === 'fetch(') continue;
        expect(fichier.text, `${fichier.path} emploie ${primitive}`).not.toContain(primitive);
      }
    }
  });

  it('le module du relais ne sort que par le fetch du SDK', () => {
    for (const fichier of fichiers) {
      if (!MODULES_RESEAU_AUTORISES.has(fichier.path)) continue;
      for (const primitive of RESEAU_DIRECT) {
        if (primitive === 'fetch(') continue;
        expect(fichier.text, `${fichier.path} emploie ${primitive}`).not.toContain(primitive);
      }
      // Aucune URL en dur : l'adresse vient d'une variable Forge.
      expect(fichier.text, `${fichier.path} contient une URL en dur`).not.toMatch(/https?:\/\//);
    }
  });

  it('le manifeste n’autorise en sortie que le relais LLM', () => {
    const manifeste = readFileSync(fileURLToPath(new URL('../manifest.yml', import.meta.url)), 'utf8');
    const bloc = manifeste.match(/backend:\n((?:\s+(?:#[^\n]*)?\n)*(?:\s+-\s+[^\n]*\n)+)/);
    expect(bloc, 'permissions.external.fetch.backend absent du manifeste').not.toBeNull();
    const sorties = (bloc?.[1] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim());
    expect(sorties.length).toBeGreaterThan(0);
    for (const sortie of sorties) {
      const hote = (sortie.replace(/^https?:\/\//, '').split('/')[0] ?? '').split(':')[0] ?? '';
      expect(HÔTES_SORTIE_AUTORISÉS.has(hote), `sortie backend ${hote} non autorisée`).toBe(true);
    }
  });

  it('les verbes SDK Forge se limitent à la liste blanche', () => {
    const appel = /\.(request[A-Z]\w+)\(|\b(chat)\(/g;
    for (const fichier of fichiers) {
      for (const match of fichier.text.matchAll(appel)) {
        const verbe = match[1] ?? match[2] ?? '';
        expect(VERBES_AUTORISES, `${fichier.path} emploie ${verbe}`).toContain(verbe);
      }
    }
  });

  it('les services ne sortent jamais : tout passe par les ports', () => {
    for (const fichier of fichiers) {
      if (!fichier.path.startsWith('/services/')) continue;
      const bas = fichier.text.toLowerCase();
      for (const primitive of RESEAU_DIRECT) {
        expect(bas, `${fichier.path} (service) emploie ${primitive}`).not.toContain(primitive);
      }
      expect(bas, `${fichier.path} (service) importe @forge`).not.toMatch(/from\s+['"]@forge\//);
      expect(bas, `${fichier.path} (service) importe @forge`).not.toContain("import('@forge/");
    }
  });
});