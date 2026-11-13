/**
 * Tests de la couverture RÉELLE (§6, §14, §19, §25.18) :
 *  - la couverture complète vaut 100 % ;
 *  - une couverture partielle donne un pourcentage cohérent ET la liste des
 *    gîtes inaccessibles, avec leur raison (« pas de droit », pas « pas de
 *    données ») ;
 *  - sans aucune passe, la couverture est INDÉTERMINÉE — jamais 0 %.
 *
 * Les compteurs viennent d'un store en mémoire : rien n'est écrit en dur dans
 * le rapport, tout est relu depuis l'état réel du store (§14).
 */

import { describe, expect, it } from 'vitest';

import type { Gite } from '@placard-wiki/domain';

import type { GiteScanRecord } from '../store/ports';
import { GITE_ORDER, coveragePercentOf, coverageReport, describeGiteFailure } from './coverage';
import { makeTestContext } from './test-support';

/** Un état de gîte, écrit dans le store comme le ferait une passe. */
function record(over: Partial<GiteScanRecord> & { gite: Gite }): GiteScanRecord {
  return {
    pagesRead: 0,
    pagesUnread: 0,
    pagesInaccessible: 0,
    reason: '',
    passAt: '2026-11-12T10:00:00.000Z',
    ...over,
  };
}

/** Le contexte de test, avec un état de gîte par gîte. */
function contextWith(records: readonly GiteScanRecord[]) {
  const ctx = makeTestContext();
  return {
    ctx,
    async seed(): Promise<void> {
      for (const one of records) await ctx.store.giteScans.put(one);
    },
  };
}

describe('couverture réelle — le pourcentage et sa méthode', () => {
  it('couverture complète : 100 %, et la méthode dit comment elle est obtenue', async () => {
    const { ctx, seed } = contextWith(
      GITE_ORDER.map((gite) => record({ gite, pagesRead: 12 })),
    );
    await seed();

    const report = await coverageReport(ctx);

    expect(report.coveragePercent).toBe(100);
    expect(report.gitesCovered).toBe(7);
    expect(report.gitesTotal).toBe(7);
    expect(report.pagesRead).toBe(84);
    expect(report.pagesTargeted).toBe(12);
    expect(report.method).toContain('÷');
    expect(report.method).toContain('7 × 12');
    expect(report.method).toContain('84');
  });

  it('couverture partielle : pourcentage cohérent, gîtes inaccessibles listés avec leur raison', async () => {
    const { ctx, seed } = contextWith([
      record({ gite: 'corps-de-page', pagesRead: 264 }),
      record({
        gite: 'commentaires',
        pagesInaccessible: 264,
        reason: 'HTTP 401 sur /wiki/rest/api/content/{id}/child/comment — pas de droit (accès refusé), pas absence de données',
      }),
      record({
        gite: 'pieces-jointes',
        pagesInaccessible: 264,
        reason: 'HTTP 401 sur /wiki/rest/api/content/{id}/child/attachment — pas de droit (accès refusé), pas absence de données',
      }),
      record({
        gite: 'historique-de-versions',
        pagesInaccessible: 264,
        reason: 'HTTP 401 sur /wiki/rest/api/content/{id}/version — pas de droit (accès refusé), pas absence de données',
      }),
    ]);
    await seed();

    const report = await coverageReport(ctx);

    // 264 pages lues sur 7 gîtes × 264 pages visées.
    expect(report.coveragePercent).toBe(14.3);
    expect(report.gitesCovered).toBe(1);
    expect(report.gitesTotal).toBe(7);
    expect(report.pagesRead).toBe(264);
    expect(report.pagesTargeted).toBe(264);

    // Les gîtes inaccessibles sont listés, avec le compte ET la raison.
    const refuses = report.perGite.filter((row) => row.state === 'inaccessible');
    expect(refuses.map((row) => row.gite)).toEqual([
      'commentaires', 'pieces-jointes', 'historique-de-versions',
    ]);
    for (const row of refuses) {
      expect(row.pagesInaccessible).toBe(264);
      expect(row.pagesRead).toBe(0);
      expect(row.reason).toContain('401');
      // « pas de droit » — jamais « pas de données ».
      expect(row.reason).toContain('pas de droit');
      expect(row.reason).not.toContain('pas de données —');
    }
    expect(report.method).toContain('264 ÷ (7 × 264) = 14.3 %');
    expect(report.method).toContain('Accès refusé');
  });

  it('aucune passe : couverture indéterminée, jamais 0 %', async () => {
    const report = await coverageReport(makeTestContext());

    expect(report.coveragePercent).toBeNull();
    expect(report.coveragePercent).not.toBe(0);
    expect(report.method).toContain('Pas de passe');
    expect(report.method).toContain('indéterminée');
    // Les sept gîtes restent listés, avec leur doute déclaré.
    expect(report.perGite).toHaveLength(7);
    for (const row of report.perGite) expect(row.state).toBe('not-attempted');
  });

  it('un gîte lu à moitié ne compte qu’à moitié', async () => {
    const { ctx, seed } = contextWith([
      record({ gite: 'corps-de-page', pagesRead: 50, pagesUnread: 50 }),
    ]);
    await seed();

    const report = await coverageReport(ctx);

    // 50 pages lues ÷ (7 gîtes × 100 pages visées).
    expect(report.coveragePercent).toBe(7.1);
    expect(report.gitesCovered).toBe(1);
    const corps = report.perGite.find((row) => row.gite === 'corps-de-page');
    expect(corps?.state).toBe('unread');
    expect(corps?.pagesRead).toBe(50);
    expect(corps?.pagesUnread).toBe(50);
  });

  it('les gîtes hors de la passe de pages sont des angles morts, pas des refus', async () => {
    const { ctx, seed } = contextWith([record({ gite: 'corps-de-page', pagesRead: 10 })]);
    await seed();

    const report = await coverageReport(ctx);

    // Gîte 5 (modèles de page) : hors de la passe de pages — angle mort.
    const modeles = report.perGite.find((row) => row.gite === 'modeles-de-page');
    expect(modeles?.state).toBe('not-attempted');
    expect(modeles?.pagesInaccessible).toBe(0);
    expect(modeles?.reason).toContain('angle mort');
    // Gîte 7 (description d'espace) : la passe le LIT (une fois par espace,
    // §6) — sans passe, il n'est donc pas un angle mort mais « jamais
    // mesuré ». C'est la consolidation avec `main` qui l'a rendu mesurable :
    // le dire « hors de la passe » serait faux.
    const description = report.perGite.find((row) => row.gite === 'description-espace');
    expect(description?.state).toBe('not-attempted');
    expect(description?.pagesInaccessible).toBe(0);
    expect(description?.reason).toContain('jamais mesuré');
    expect(description?.reason).not.toContain('angle mort');
    expect(report.method).toContain('Jamais tentés');
  });
});

describe('couverture réelle — le pourcentage est une formule, pas une constante', () => {
  it('la formule est refusée sans pages visées (jamais 0 %)', () => {
    expect(coveragePercentOf(0, 7, 0)).toBeNull();
    expect(coveragePercentOf(10, 7, 0)).toBeNull();
    expect(coveragePercentOf(0, 0, 10)).toBeNull();
  });

  it('la formule donne le ratio attendu', () => {
    expect(coveragePercentOf(264, 7, 264)).toBe(14.3);
    expect(coveragePercentOf(7, 7, 1)).toBe(100);
  });
});

describe('couverture réelle — la raison d’un refus est « pas de droit »', () => {
  it('un 401 est un droit manquant, pas une absence de données', () => {
    const reason = describeGiteFailure('Confluence HTTP 401 sur /wiki/rest/api/content/3932169/child/comment');

    expect(reason).toContain('401');
    expect(reason).toContain('pas de droit');
    expect(reason).toContain('pas absence de données');
    // L'identifiant de page est normalisé : la raison vaut pour toutes les pages.
    expect(reason).toContain('{id}');
    expect(reason).not.toContain('3932169');
  });

  it('une raison sans statut est conservée telle quelle', () => {
    expect(describeGiteFailure('page introuvable par la recherche Confluence'))
      .toBe('page introuvable par la recherche Confluence');
  });
});
