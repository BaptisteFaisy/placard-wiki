/**
 * Recette §11 : « recopié N fois entre <mois> et <mois>, dont K par
 * duplication de page » — heuristiques documentées, jamais d'acteur.
 */

import { describe, expect, it } from 'vitest';

import { fausseCleAws, empreinteDe, makeDetection, makePage } from './fixtures.js';
import { groupIntoFoyers } from './group.js';
import { propagationTimeline } from './timeline.js';

function foyerPropagé() {
  const cle = fausseCleAws('recette-timeline');
  const empreinte = empreinteDe(cle);
  const pages = [
    makePage({ pageId: 'p-source', title: 'Runbook accès prod', createdAt: '2026-02-10T08:00:00.000Z' }),
    makePage({ pageId: 'p-2', title: 'Procédure staging', createdAt: '2026-03-05T08:00:00.000Z' }),
    makePage({ pageId: 'p-3', title: 'Comptes de démo', createdAt: '2026-06-17T08:00:00.000Z' }),
    makePage({ pageId: 'p-4', title: 'Copie de Runbook accès prod', createdAt: '2026-08-01T08:00:00.000Z' }),
    makePage({ pageId: 'p-5', title: 'Notes de migration', createdAt: '2026-10-05T08:00:00.000Z' }),
  ];
  const detections = pages.map((p, i) =>
    makeDetection({
      fingerprint: empreinte,
      pageId: p.pageId,
      containerAri: `ari:cloud:confluence:::page/${p.pageId}`,
      detectedAt: `2026-11-0${i + 1}T09:00:00.000Z`,
    }),
  );
  const [foyer] = groupIntoFoyers(detections, [], pages);
  return { foyer: foyer!, pages };
}

describe('propagationTimeline (§11)', () => {
  it('compte les recopies, qualifie les duplications, date la période', () => {
    const { foyer, pages } = foyerPropagé();
    const timeline = propagationTimeline(foyer, pages);

    expect(timeline.copyCount).toBe(4);
    expect(timeline.duplicationCount).toBe(1); // H2 : titre « Copie de … »
    expect(timeline.sourcePageId).toBe('p-source');
    expect(timeline.summary).toBe('recopié 4 fois entre mars et octobre, dont 1 par duplication de page');
  });

  it('H1 : une duplication explicite Confluence est qualifiée comme telle', () => {
    const { foyer, pages } = foyerPropagé();
    const avecH1 = pages.map((p) =>
      p.pageId === 'p-3' ? { ...p, duplicatedFromPageId: 'p-source' } : p,
    );
    const timeline = propagationTimeline(foyer, avecH1);
    expect(timeline.duplicationCount).toBe(2);
    const copie = timeline.copies.find((c) => c.pageId === 'p-3');
    expect(copie?.heuristique).toContain('H1');
  });

  it('H3 : même modèle + créations rapprochées → duplication de page présumée', () => {
    const cle = fausseCleAws('recette-h3');
    const empreinte = empreinteDe(cle);
    const pages = [
      makePage({ pageId: 'p-a', createdAt: '2026-04-01T08:00:00.000Z', templateId: 'tpl-runbook' }),
      makePage({ pageId: 'p-b', createdAt: '2026-04-04T08:00:00.000Z', templateId: 'tpl-runbook' }),
    ];
    const [foyer] = groupIntoFoyers(
      pages.map((p) =>
        makeDetection({
          fingerprint: empreinte,
          pageId: p.pageId,
          containerAri: `ari:cloud:confluence:::page/${p.pageId}`,
        }),
      ),
      [],
      pages,
    );
    const timeline = propagationTimeline(foyer!, pages);
    expect(timeline.duplicationCount).toBe(1);
    expect(timeline.copies[0]!.heuristique).toContain('H3');
  });

  it('aucune recopie : la phrase le dit simplement', () => {
    const cle = fausseCleAws('recette-unique');
    const pages = [makePage({ pageId: 'p-unique' })];
    const [foyer] = groupIntoFoyers(
      [makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-unique' })],
      [],
      pages,
    );
    const timeline = propagationTimeline(foyer!, pages);
    expect(timeline.copyCount).toBe(0);
    expect(timeline.summary).toContain('Aucune recopie');
  });

  it('jamais d’acteur : la sortie ne porte aucune information de personne (§11)', () => {
    const { foyer, pages } = foyerPropagé();
    const brut = JSON.stringify(propagationTimeline(foyer, pages)).toLowerCase();
    for (const interdit of ['author', 'auteur', 'actor', 'user', 'createdby', 'by"']) {
      expect(brut).not.toContain(interdit);
    }
  });
});
