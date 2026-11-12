/**
 * Tests du client Confluence du runtime Forge (§21, gîtes 1 à 4).
 *
 * Le `fetch` est injecté : chaque test fournit une fixture qui répond par
 * chemin — **jamais de réseau**. On vérifie que chaque lecture de gîte passe
 * par le chemin qui répond pour l'identité de l'app (mesuré le 12 novembre
 * 2026) :
 *
 *   - page        → recherche CQL (`cql = id = …`) ;
 *   - commentaires → recherche CQL (`type = comment and container = …`) ;
 *   - pièces jointes (métadonnées) → API v2 `/pages/{id}/attachments` ;
 *   - pièces jointes (contenu)     → v1 `/child/attachment/{id}/download` ;
 *   - versions    → API v2 `/pages/{id}/versions` + `/pages/{id}?version=N`.
 *
 * Les valeurs à forme de secret sont factices et fabriquées ici, jamais des
 * valeurs réelles (PLA-N-09).
 */

import { describe, expect, it } from 'vitest';

import type { FetchLike, ResponseLike } from '@placard-wiki/wiki-source';

import { createForgeConfluence } from './confluence';

/** Une réponse de fixture dictée par le chemin demandé. */
function route(handler: (path: string) => { status: number; body: unknown }): FetchLike {
  return async (url: string): Promise<ResponseLike> => {
    const { status, body } = handler(url);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(text),
    };
  };
}

/** Journal des chemins demandés par le client (pour vérifier la voie choisie). */
function spy(handler: (path: string) => { status: number; body: unknown }): {
  fetch: FetchLike; called: string[];
} {
  const called: string[] = [];
  return { fetch: route((path) => { called.push(path); return handler(path); }), called };
}

const PAGE_ID = '1001';
const ATT_ID = 'att4321';

describe('createForgeConfluence — la page est lue par la recherche CQL (gîte 1)', () => {
  it('écrit la requête CQL `id = …` avec le corps, la version et les étiquettes', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/content/search')) {
        return {
          status: 200,
          body: {
            results: [{
              id: PAGE_ID,
              title: 'Runbook',
              space: { key: 'DEMO', name: 'Démo' },
              version: { number: 7, when: '2026-11-12T10:00:00.000Z' },
              body: { storage: { value: '<p>Bonjour</p>' } },
              metadata: {
                labels: { results: [{ name: 'prod', id: '1', label: 'prod' }] },
              },
            }],
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const page = await client.getPage(PAGE_ID);
    expect(called.every((p) => p.includes('/content/search'))).toBe(true);
    expect(page.id).toBe(PAGE_ID);
    expect(page.title).toBe('Runbook');
    expect(page.spaceKey).toBe('DEMO');
    expect(page.versionNumber).toBe(7);
    expect(page.bodyStorage).toBe('<p>Bonjour</p>');
    expect(page.labels).toEqual(['prod']);
  });
});

describe('createForgeConfluence — les commentaires via CQL (gîte 2)', () => {
  it('relit les commentaires avec leur corps storage depuis la recherche', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/content/search') && path.includes('type%20%3D%20comment')) {
        return {
          status: 200,
          body: {
            results: [{
              id: '2001', type: 'comment',
              body: { storage: { value: '<p>le mot de passe est ABCDEF</p>' } },
              version: { number: 1, when: '2026-11-12T11:00:00.000Z' },
            }],
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const comments = await client.listComments(PAGE_ID);
    expect(called[0]).toContain('type%20%3D%20comment');
    expect(comments).toHaveLength(1);
    expect(comments[0]?.id).toBe('2001');
    expect(comments[0]?.bodyStorage).toBe('<p>le mot de passe est ABCDEF</p>');
    expect(comments[0]?.versionNumber).toBe(1);
  });
});

describe('createForgeConfluence — les pièces jointes via l\'API v2 (gîte 3)', () => {
  it('liste les métadonnées depuis /pages/{id}/attachments', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/api/v2/pages/') && path.includes('/attachments')) {
        return {
          status: 200,
          body: {
            results: [{
              id: ATT_ID, title: 'secret.env', mediaType: 'text/plain', fileSize: 21,
            }],
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const metas = await client.listAttachments(PAGE_ID);
    expect(called[0]).toContain(`/api/v2/pages/${PAGE_ID}/attachments`);
    expect(metas).toHaveLength(1);
    expect(metas[0]?.filename).toBe('secret.env');
    expect(metas[0]?.mediaType).toBe('text/plain');
    expect(metas[0]?.sizeBytes).toBe(21);
  });

  it('télécharge le contenu par le chemin v1 téléchargement (encore 200)', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/child/attachment/') && path.includes('/download')) {
        return { status: 200, body: 'CLE=factice-valeur' };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const download = await client.downloadAttachment(PAGE_ID, ATT_ID, 100);
    expect(called[0]).toContain(`/child/attachment/${ATT_ID}/download`);
    expect(download.text).toBe('CLE=factice-valeur');
    expect(download.truncated).toBe(false);
  });

  it('déclare une pièce jointe non lue sur 403 (droits), jamais un silence', async () => {
    const { fetch } = spy(() => ({ status: 403, body: { message: 'forbidden' } }));
    const client = createForgeConfluence(fetch);
    const download = await client.downloadAttachment(PAGE_ID, ATT_ID, 100);
    expect(download.text).toBeUndefined();
    expect(download.skippedReason).toContain('droits');
  });
});

describe('createForgeConfluence — l\'historique via l\'API v2 (gîte 4)', () => {
  it('liste les versions depuis /pages/{id}/versions', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/api/v2/pages/') && path.includes('/versions')) {
        return {
          status: 200,
          body: {
            results: [
              { number: 2, createdAt: '2026-11-12T12:00:00.000Z', authorId: 'u:1', message: 'fix' },
              { number: 1, createdAt: '2026-11-11T09:00:00.000Z', authorId: 'u:1', message: 'init' },
            ],
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const versions = await client.listVersions(PAGE_ID);
    expect(called[0]).toContain(`/api/v2/pages/${PAGE_ID}/versions`);
    expect(versions.map((v) => v.number)).toEqual([2, 1]);
    expect(versions[0]?.message).toBe('fix');
  });

  it('relit le corps d\'une ancienne version via /pages/{id}?version=N', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/api/v2/pages/') && path.includes('version=1')) {
        return {
          status: 200,
          body: {
            id: PAGE_ID, title: 'Runbook', version: { number: 1 },
            body: { storage: { value: '<p>Ancienne valeur</p>' } },
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const content = await client.getVersionContent(PAGE_ID, 1);
    expect(called[0]).toContain('version=1');
    expect(called[0]).toContain('body-format=storage');
    expect(content.bodyStorage).toBe('<p>Ancienne valeur</p>');
    expect(content.number).toBe(1);
    expect(content.title).toBe('Runbook');
  });
});

describe('createForgeConfluence — la description d\'espace via l\'API v2 (gîte 7)', () => {
  it('lit la description en clair depuis /spaces?keys=…&description-format=PLAIN', async () => {
    const { fetch, called } = spy((path) => {
      if (path.includes('/api/v2/spaces?keys=')) {
        return {
          status: 200,
          body: {
            results: [{
              id: '3833860', key: 'DEMO', name: 'Espace démo', homepageId: '3834036',
              description: {
                plain: {
                  representation: 'plain',
                  value: 'SYNTHÉTIQUE — 1 — ASIAWXJ8DRNTYXF36479',
                },
              },
            }],
          },
        };
      }
      return { status: 410, body: { message: 'deprecated' } };
    });
    const client = createForgeConfluence(fetch);
    const space = await client.getSpaceDescription('DEMO');
    expect(called[0]).toContain('keys=DEMO');
    expect(called[0]).toContain('description-format=PLAIN');
    expect(space.key).toBe('DEMO');
    expect(space.name).toBe('Espace démo');
    expect(space.descriptionStorage).toBe('SYNTHÉTIQUE — 1 — ASIAWXJ8DRNTYXF36479');
    expect(space.homepageId).toBe('3834036');
  });
});

describe('createForgeConfluence — la clé d\'espace est lue sous ses deux formes', () => {
  it('lit la clé d\'espace depuis un lien (/rest/api/space/MSD)', async () => {
    const { fetch } = spy((path) => {
      if (path.includes('/content/search')) {
        return {
          status: 200,
          body: {
            results: [{
              id: PAGE_ID, title: 'P', space: '/rest/api/space/DEMO',
              version: { number: 1 }, body: { storage: { value: 'x' } },
            }],
          },
        };
      }
      return { status: 410, body: {} };
    });
    const client = createForgeConfluence(fetch);
    const page = await client.getPage(PAGE_ID);
    expect(page.spaceKey).toBe('DEMO');
  });
});