/**
 * Tests des sept gîtes (§6) : chaque lecteur ramène des éléments du bon
 * conteneur, et l'ensemble couvre bien les sept gîtes du cahier.
 */

import { describe, expect, it } from 'vitest';

import { GITES } from '@placard-wiki/domain';

import { createFixtureClient, loadFixtureData } from '../fixture-client.js';
import {
  readAllPageGites, readAttachments, readComments, readPageBody, readSpaceDescription,
  readTemplates, readTitlesAndLabels, readVersions,
} from '../readers/index.js';
import { giteOfItem, isSkipped, REASON_NOT_TEXT, REASON_TOO_LARGE } from '../types.js';

const client = createFixtureClient(loadFixtureData());

describe('les sept gîtes', () => {
  it('gîte 1 — corps de page : le corps storage est lu avec sa version', async () => {
    const items = await readPageBody(client, '1002');
    expect(items).toHaveLength(1);
    const body = items[0]!;
    expect(body.containerType).toBe('page');
    expect(body.field).toBe('body');
    expect(body.text).toContain('DEMO_USER=fixture');
    expect(body.versionNumber).toBe(3);
    expect(giteOfItem(body)).toBe('corps-de-page');
  });

  it('gîte 6 — titres et étiquettes : un élément par étiquette, plus le titre', async () => {
    const items = await readTitlesAndLabels(client, '1002');
    expect(items[0]!.field).toBe('title');
    expect(items[0]!.text).toBe('Runbook staging (fixture)');
    expect(items.slice(1).map((i) => i.text)).toEqual(['staging']);
    for (const item of items) expect(giteOfItem(item)).toBe('titres-et-etiquettes');
  });

  it('gîte 2 — commentaires : chaque commentaire est un élément distinct', async () => {
    const items = await readComments(client, '1002');
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.containerType === 'comment')).toBe(true);
    expect(giteOfItem(items[0]!)).toBe('commentaires');
  });

  it('gîte 4 — historique : la version 1 reste lisible dans la cave', async () => {
    const items = await readVersions(client, '1002');
    expect(items.map((i) => i.versionNumber)).toEqual([1, 2, 3]);
    expect(items[0]!.text).toContain('Première version factice');
    expect(giteOfItem(items[0]!)).toBe('historique-de-versions');
  });

  it('gîte 5 — modèles : le canevas recopié par chaque nouvelle page', async () => {
    const items = await readTemplates(client, 'RUN');
    expect(items).toHaveLength(1);
    expect(items[0]!.containerType).toBe('template');
    expect(items[0]!.text).toContain('Modèle factice');
    expect(giteOfItem(items[0]!)).toBe('modeles-de-page');
  });

  it('gîte 7 — espace : description + page d’accueil lues ensemble', async () => {
    const items = await readSpaceDescription(client, 'RUN');
    expect(items.some((i) => i.containerType === 'space-desc')).toBe(true);
    expect(items.some((i) => i.pageId === '1001' && i.containerType === 'page')).toBe(true);
    expect(giteOfItem(items[0]!)).toBe('description-espace');
  });

  it('les lecteurs d’une page couvrent cinq gîtes distincts d’un coup', async () => {
    const items = await readAllPageGites(client, '1002');
    const gites = new Set(items.map(giteOfItem));
    expect(gites).toContain('corps-de-page');
    expect(gites).toContain('titres-et-etiquettes');
    expect(gites).toContain('commentaires');
    expect(gites).toContain('pieces-jointes');
    expect(gites).toContain('historique-de-versions');
  });

  it('les sept gîtes du cahier sont tous atteignables par un lecteur', async () => {
    const page = await readAllPageGites(client, '1002');
    const space = await readSpaceDescription(client, 'RUN');
    const templates = await readTemplates(client, 'RUN');
    const reached = new Set([...page, ...space, ...templates].map(giteOfItem));
    for (const gite of GITES) expect(reached.has(gite.gite), `gîte non couvert : ${gite.gite}`).toBe(true);
  });
});

describe('pièces jointes — jamais d’ignoré silencieux', () => {
  it('au-delà de 5 Mo : non lu, avec la raison', async () => {
    const items = await readAttachments(client, '1002');
    const large = items.find((i) => i.filename === 'export-complet.csv')!;
    expect(large.text).toBeUndefined();
    expect(large.skippedReason).toBe(REASON_TOO_LARGE);
    expect(isSkipped(large)).toBe(true);
  });

  it('binaire non textuel : non lu, avec la raison', async () => {
    const items = await readAttachments(client, '1002');
    const binary = items.find((i) => i.filename === 'capture-ecran.png')!;
    expect(binary.text).toBeUndefined();
    expect(binary.skippedReason).toBe(REASON_NOT_TEXT);
  });

  it('texte sous la borne : lu intégralement', async () => {
    const items = await readAttachments(client, '1002');
    const text = items.find((i) => i.filename === 'notes-deploiement.env')!;
    expect(text.text).toContain('DEMO_USER=lecteur-factice');
    expect(text.skippedReason).toBeUndefined();
  });

  it('tout élément non lu porte une raison (invariant du paquet)', async () => {
    const items = await readAllPageGites(client, '1002');
    for (const item of items) {
      if (item.text === undefined) expect(item.skippedReason, `silence sur ${item.containerAri}`).toBeTruthy();
    }
  });
});
