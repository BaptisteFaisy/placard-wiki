/**
 * Intégrité du contenu + réemploi de `@placard/core` (§21) : les lecteurs
 * ramènent le texte **sans jamais le modifier ni le normaliser**, et les
 * valeurs à forme de secret ne sont jamais écrites dans le dépôt — elles sont
 * générées à l'exécution par les fake-values du vendor (PLA-N-09).
 */

import { describe, expect, it } from 'vitest';

import { fakeCloudKey, fakePassword, fakePrivateKeyBlock, prng } from '@placard/core';

import type { ConfluencePage } from '../api.js';
import { createFixtureClient } from '../fixture-client.js';
import { readPageBody } from '../readers/index.js';

function pageWith(body: string): ConfluencePage {
  return {
    id: '9001',
    title: 'Page factice générée à l’exécution',
    spaceKey: 'RUN',
    versionNumber: 1,
    bodyStorage: body,
    labels: [],
    lastModifiedAt: '2026-11-10T08:00:00.000Z',
  };
}

describe('intégrité du contenu lu', () => {
  it('le corps généré via fake-values ressort octet pour octet', async () => {
    const rand = prng('wiki-source-integrite');
    const body = [
      '<p>Clé cloud factice : ', fakeCloudKey(rand), '</p>',
      '<p>Mot de passe factice : ', fakePassword(rand), '</p>',
      fakePrivateKeyBlock(rand),
    ].join('');
    const client = createFixtureClient({ pages: [pageWith(body)] });
    const [item] = await readPageBody(client, '9001');
    expect(item!.text).toBe(body);
    expect(item!.sizeBytes).toBe(new TextEncoder().encode(body).length);
  });

  it('fake-values est déterministe à graine égale (rejeu fiable)', () => {
    expect(fakeCloudKey(prng('même-graine'))).toBe(fakeCloudKey(prng('même-graine')));
  });
});
