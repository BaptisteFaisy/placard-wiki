/**
 * Les pages de canaris — l'espace de démonstration rejoué **en mémoire**.
 *
 * La structure est celle du semis réel (`@placard-wiki/demo-space`) :
 *  - une page « tableau d'identifiants » qui porte la valeur d'une famille
 *    par ligne (le gîte « corps-de-page ») ;
 *  - une page par famille, dont le **titre** porte la valeur — c'est le cas
 *    mesuré sur le site réel (les titres de la démo contiennent des faux
 *    secrets) ;
 *  - une page partagée, un historique, des commentaires et des pièces
 *    jointes sur la page du tableau.
 *
 * Rien n'est écrit en clair dans le dépôt : les valeurs viennent de la source
 * unique (`@placard/core`, via les fixtures de `@placard-wiki/demo-space`).
 *
 * Le client est **instrumenté** : chaque appel est journalisé (méthode et
 * argument). La preuve de non-fuite s'en sert pour montrer que le balayage ne
 * contacte que l'espace de démonstration — jamais un fournisseur.
 */

import { createFixtureClient } from '@placard-wiki/wiki-source';
import type { ConfluenceClient, ConfluencePage } from '@placard-wiki/wiki-source';
import {
  attachementDe, commentaireXml, corpsDePageXml, fixturesDuGite, historiqueV1Xml,
  pagePartageeXml, titreSecret,
} from '@placard-wiki/demo-space';

/** L'espace de démonstration semé (le même que sur le site réel). */
export const CANARY_SPACE = 'PLACARDDEMO';

/** Un appel observé sur le client Confluence injecté. */
export interface ClientCall {
  method: string;
  argument: string;
}

/** Le client instrumenté : les appels sont observables, le réseau est impossible. */
export interface SpyConfluenceClient extends ConfluenceClient {
  /** Les appels effectués, dans l'ordre. */
  readonly calls: ClientCall[];
}

/** La page « tableau d'identifiants » : une ligne par famille de valeur. */
function corpsPage(): ConfluencePage {
  return {
    id: 'canary-corps',
    title: "Tableau d'identifiants — staging (SYNTHÉTIQUE)",
    spaceKey: CANARY_SPACE,
    versionNumber: 2,
    bodyStorage: corpsDePageXml(fixturesDuGite('corps-de-page')),
    labels: ['canari'],
    lastModifiedAt: '2026-11-09T08:00:00.000Z',
  };
}

/** Les pages « accès staging (mdp: …) » : la valeur est dans le **titre**. */
function titrePages(): ConfluencePage[] {
  return fixturesDuGite('titres-et-etiquettes').map((fixture) => ({
    id: `canary-titre-${String(fixture.number)}`,
    title: titreSecret(fixture),
    spaceKey: CANARY_SPACE,
    versionNumber: 1,
    bodyStorage: `<p>Voir l'espace de démonstration (${fixture.family}).</p>`,
    labels: ['canari'],
    lastModifiedAt: '2026-11-09T08:00:00.000Z',
  }));
}

/** La page partagée et la page d'historique : deux gîtes de plus. */
function gitesSupplementaires(): ConfluencePage[] {
  return [
    {
      id: 'canary-partagee',
      title: 'Page partagée — anyone with the link (SYNTHÉTIQUE)',
      spaceKey: CANARY_SPACE,
      versionNumber: 1,
      bodyStorage: pagePartageeXml(fixturesDuGite('corps-de-page')),
      labels: ['canari'],
      lastModifiedAt: '2026-11-09T08:00:00.000Z',
    },
    {
      id: 'canary-historique',
      title: 'Historique — accès corrigé (SYNTHÉTIQUE)',
      spaceKey: CANARY_SPACE,
      versionNumber: 2,
      bodyStorage: '<p>Mots de passe retirés de cette version (SYNTHÉTIQUE).</p>',
      labels: ['canari'],
      lastModifiedAt: '2026-11-09T08:00:00.000Z',
    },
  ];
}

/** Les pages de canaris, dans l'ordre du semis réel. */
export function canaryPages(): ConfluencePage[] {
  return [corpsPage(), ...titrePages(), ...gitesSupplementaires()];
}

/** Les commentaires de la page du tableau (un par famille). */
function canaryComments(): Record<string, Array<{ id: string; bodyStorage: string; versionNumber: number }>> {
  return {
    'canary-corps': fixturesDuGite('commentaires').map((fixture) => ({
      id: `canary-commentaire-${String(fixture.number)}`,
      bodyStorage: commentaireXml(fixture),
      versionNumber: 1,
    })),
  };
}

/** Les pièces jointes de la page du tableau (un par famille). */
function canaryAttachments(): {
  attachments: Record<string, Array<{ id: string; filename: string; mediaType: string; sizeBytes: number }>>;
  content: Record<string, { text: string }>;
} {
  const attachments: Record<string, Array<{ id: string; filename: string; mediaType: string; sizeBytes: number }>> = { 'canary-corps': [] };
  const content: Record<string, { text: string }> = {};
  for (const fixture of fixturesDuGite('pieces-jointes')) {
    const attachement = attachementDe(fixture);
    const id = `canary-piece-${String(fixture.number)}`;
    attachments['canary-corps']?.push({
      id,
      filename: attachement.filename,
      mediaType: attachement.mimeType,
      sizeBytes: attachement.content.length,
    });
    content[id] = { text: attachement.content };
  }
  return { attachments, content };
}

/** Les données de fixture complètes (pages, gîtes annexes, espace). */
function canaryFixtureData(): Parameters<typeof createFixtureClient>[0] {
  const { attachments, content } = canaryAttachments();
  return {
    spaces: [{ key: CANARY_SPACE, name: 'Espace des canaris' }],
    pages: canaryPages(),
    versions: {
      'canary-historique': [{
        number: 1,
        title: 'Version 1',
        bodyStorage: historiqueV1Xml(fixturesDuGite('historique-de-versions')),
      }],
    },
    comments: canaryComments(),
    attachments,
    attachmentContent: content,
  };
}

/** Le client Confluence mémoire des canaris, instrumenté (aucun réseau possible). */
export function canaryConfluenceClient(): SpyConfluenceClient {
  const base = createFixtureClient(canaryFixtureData());
  const calls: ClientCall[] = [];
  const instrumented: Record<string, unknown> = {};
  for (const [method, impl] of Object.entries(base)) {
    if (typeof impl !== 'function') continue;
    instrumented[method] = (...args: unknown[]): unknown => {
      calls.push({ method, argument: String(args[0] ?? '') });
      return (impl as (...inner: unknown[]) => unknown)(...args);
    };
  }
  return Object.assign(instrumented, { calls }) as unknown as SpyConfluenceClient;
}
