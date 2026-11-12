/**
 * Tests du rapport de couverture (§19, §25.17, §25.18) :
 *  - un droit manquant sur le Teamwork Graph est dit « pas de droit », jamais
 *    « pas de données » ;
 *  - chaque pièce jointe non lue est listée AVEC sa raison (PW-19) ;
 *  - les angles morts (whiteboards, bases Confluence, OCR de captures) restent
 *    déclarés, même store vide ;
 *  - aucune valeur brute ne sort du rapport (PW-23).
 *
 * L'invariant « tout élément non lu porte une raison » vient du paquet
 * `wiki-source` : il est RÉUTILISÉ ici (`isSkipped` + raisons normalisées),
 * du lecteur jusqu'au rapport, pas recopié.
 *
 * Aucune valeur de secret réelle : uniquement les factices de `test-support`
 * (fabriquées à l'exécution) et la fixture de démonstration.
 */

import { describe, expect, it } from 'vitest';

import {
  REASON_NOT_TEXT, REASON_TOO_LARGE, createFixtureClient, isSkipped,
  loadFixtureData, readAttachments,
} from '@placard-wiki/wiki-source';
import type { CoverageReport } from '@placard-wiki/domain';

import type { ServiceContext } from './ports';
import {
  DECLARED_BLIND_SPOTS, GRAPH_RIGHTS_TO_VALIDATE, coverageReport, declaresMissingRight,
} from './registry';
import { GRAPH_MISSING_RIGHT_CAVEAT, resolveOwner } from './owner';
import { runSweep } from './sweep';
import {
  FAKE_CLOUD_KEY, PAGE_ID, SPACE_KEY, deniedGraph, emptyOwnerSource, makeTestContext,
} from './test-support';

/** Page de la fixture de démonstration : 3 pièces jointes (lue, binaire, trop grosse). */
const DEMO_PAGE = '1002';

/** Une page absente de la fixture : la lecture échoue, comme un droit manquant. */
const UNREADABLE_PAGE = '9999';

/** Contexte branché sur la fixture complète (pièces jointes incluses). */
function demoContext(): ServiceContext {
  return makeTestContext({ confluence: createFixtureClient(loadFixtureData()) });
}

/** Contexte où le graphe refuse l'accès et aucune cascade locale ne résout (§12). */
function graphDeniedContext(): ServiceContext {
  return makeTestContext({ ownerSource: emptyOwnerSource(), graph: deniedGraph() });
}

/** Balaye une page puis renvoie le rapport de couverture qui en découle. */
async function coverageAfterSweep(ctx: ServiceContext, scope: string): Promise<CoverageReport> {
  await runSweep(ctx, { mode: 'on-demand', scope, maxPages: 1 });
  return coverageReport(ctx);
}

/** Une ligne du rapport par gîte. */
function gite(report: CoverageReport, name: string): CoverageReport['perGite'][number] | undefined {
  return report.perGite.find((g) => g.gite === name);
}

describe('coverageReport — droit manquant ≠ « pas de données » (§25.18)', () => {
  it('un droit manquant sur le Teamwork Graph apparaît comme « pas de droit »', async () => {
    const ctx = graphDeniedContext();
    await resolveOwner(ctx, PAGE_ID, SPACE_KEY);

    const report = await coverageReport(ctx);
    const lines = report.missingRights.filter((line) => line.includes(PAGE_ID));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('pas de droit');
    expect(lines[0]).toContain(GRAPH_MISSING_RIGHT_CAVEAT);
    // Jamais rangé parmi les angles morts : ce n'est pas une absence de données.
    expect(report.blindSpots.some((spot) => spot.includes(PAGE_ID))).toBe(false);
  });

  it('le caveat « pas de droit » est classé droit manquant, l’absence de propriétaire non', () => {
    expect(declaresMissingRight(GRAPH_MISSING_RIGHT_CAVEAT)).toBe(true);
    expect(declaresMissingRight('droits insuffisants pour lire ce contenu : déclaré, pas masqué')).toBe(true);
    expect(declaresMissingRight('Aucun propriétaire en vue : la page part en file d’adoption (§12).')).toBe(false);
  });

  it('une page illisible faute de droits est un droit manquant, pas un angle mort muet', async () => {
    const report = await coverageAfterSweep(demoContext(), UNREADABLE_PAGE);

    const lines = report.missingRights.filter((line) => line.includes(UNREADABLE_PAGE));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('droits manquants');
    expect(report.blindSpots.some((spot) => spot.includes(UNREADABLE_PAGE))).toBe(false);
  });

  it('le droit du graphe à valider reste déclaré même sans aucune résolution (§12, §22)', async () => {
    const report = await coverageReport(makeTestContext());

    expect(report.missingRights).toContain(GRAPH_RIGHTS_TO_VALIDATE);
    expect(report.missingRights.join(' ')).toContain('read:graph:document');
  });
});

describe('coverageReport — pièces jointes non lues et pourquoi (§25.17, PW-19)', () => {
  it('liste chaque pièce jointe non lue avec sa raison (trop volumineuse, binaire non textuel)', async () => {
    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);
    const attachments = gite(report, 'pieces-jointes');
    const reason = attachments?.reason ?? '';

    expect(attachments?.skipped).toBe(2);
    expect(reason).toContain('export-complet.csv');
    expect(reason).toContain(REASON_TOO_LARGE);
    expect(reason).toContain('capture-ecran.png');
    expect(reason).toContain(REASON_NOT_TEXT);
  });

  it('compteurs réels issus du store : lus et non lus séparés, plus de zéros statiques', async () => {
    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);

    expect(gite(report, 'pieces-jointes')?.scanned).toBe(1);
    expect(gite(report, 'pieces-jointes')?.skipped).toBe(2);
    expect(gite(report, 'corps-de-page')?.scanned).toBe(1);
    expect(gite(report, 'corps-de-page')?.skipped).toBe(0);
  });

  it('store vide : couverture nulle MAIS déclarée, jamais un silence', async () => {
    const report = await coverageReport(makeTestContext());

    expect(report.perGite.map((g) => g.gite)).toEqual(['corps-de-page', 'pieces-jointes']);
    for (const entry of report.perGite) {
      expect(entry.scanned).toBe(0);
      expect(entry.skipped).toBe(0);
      expect(entry.reason).toBeUndefined();
    }
  });

  it('tout élément non lu porte une raison (invariant wiki-source réutilisé, du lecteur au rapport)', async () => {
    const client = createFixtureClient(loadFixtureData());
    const skippedItems = (await readAttachments(client, DEMO_PAGE)).filter(isSkipped);
    expect(skippedItems.length).toBeGreaterThan(0);

    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);
    const reason = gite(report, 'pieces-jointes')?.reason ?? '';
    for (const item of skippedItems) {
      expect(item.skippedReason, `silence sur ${item.containerAri}`).toBeTruthy();
      expect(reason, `raison absente du rapport pour ${item.containerAri}`).toContain(item.skippedReason as string);
      expect(reason).toContain(item.filename as string);
    }
    expect(reason).not.toContain('raison absente');
  });

  it('chaque pièce jointe non lue du store est non lue pour une raison écrite (§14)', async () => {
    const ctx = demoContext();
    await coverageAfterSweep(ctx, DEMO_PAGE);

    const unread = await ctx.store.attachmentScans.listSkipped();
    expect(unread.length).toBe(2);
    for (const record of unread) {
      expect(record.readState).not.toBe('read');
      expect(record.skippedReason, `silence sur ${record.filename}`).toBeTruthy();
    }
  });
});

describe('coverageReport — angles morts déclarés, jamais masqués (§6, §19)', () => {
  it('whiteboards, bases Confluence et OCR de captures sont déclarés même store vide', async () => {
    const report = await coverageReport(makeTestContext());
    const declared = report.blindSpots.join(' ');

    for (const spot of DECLARED_BLIND_SPOTS) expect(report.blindSpots).toContain(spot);
    expect(declared).toContain('Whiteboards');
    expect(declared).toContain('bases Confluence');
    expect(declared).toContain('OCR');
    expect(declared).toContain('angle mort déclaré');
  });

  it('les angles morts déclarés survivent à une passe réelle (non déclarés ≠ oubliés)', async () => {
    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);

    for (const spot of DECLARED_BLIND_SPOTS) expect(report.blindSpots).toContain(spot);
    // Les gîtes non balayés par la passe de pages restent annoncés.
    expect(report.blindSpots.join(' ')).toContain('Modèles de page');
  });

  it('les deux listes sont distinctes : un angle mort n’est pas un droit manquant', async () => {
    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);

    expect(report.blindSpots.length).toBeGreaterThan(0);
    for (const spot of report.blindSpots) expect(declaresMissingRight(spot)).toBe(false);
  });
});

describe('coverageReport — aucune valeur brute ne sort du rapport (PW-23)', () => {
  it('le rapport sérialisé ne contient ni la clé factice ni le corps de la page', async () => {
    const ctx = makeTestContext();
    await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
    await resolveOwner(ctx, PAGE_ID, SPACE_KEY);

    const serialized = JSON.stringify(await coverageReport(ctx));
    expect(serialized).not.toContain(FAKE_CLOUD_KEY);
    // Ni la clé, ni son préfixe, ni la ligne du corps de page qui la portait.
    expect(serialized).not.toContain(FAKE_CLOUD_KEY.slice(0, 4));
    expect(serialized).not.toContain('AWS_ACCESS_KEY_ID');
    expect(serialized).not.toContain('Runbook de démonstration');
  });

  it('ni le contenu des pièces jointes ni celui des pages ne fuit dans la couverture', async () => {
    const report = await coverageAfterSweep(demoContext(), DEMO_PAGE);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain('lecteur-factice');
    expect(serialized).not.toContain('DEMO_USER');
    expect(serialized).not.toContain('BEGIN ');
  });
});
