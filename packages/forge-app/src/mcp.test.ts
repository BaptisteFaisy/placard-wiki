/**
 * Tests des treize outils MCP (§17) — la surface d'agent.
 *
 * Ce que ce fichier prouve :
 * 1. **aucun** des treize outils ne renvoie de valeur brute : empreinte HMAC
 *    et aperçu masqué seulement (recette §25.15) ;
 * 2. `traceFingerprint` rend **tous** les emplacements d'une empreinte — page,
 *    version historique, commentaire, pièce jointe, modèle (§11) ;
 * 3. un acteur **sans droit de lecture** ne voit ni contenu ni aperçu :
 *    existence et propriétaire seulement (§25.13, PW-23).
 *
 * La surface MCP lit son contexte dans le runtime Forge (`runtime/context`) :
 * le test l'injecte par un mock de module — aucun SDK Forge n'est instancié,
 * `@forge/sql` n'est jamais touché, le store est celui de `test-support`.
 */

import { describe, expect, it, vi } from 'vitest';
import { readTemplates } from '@placard-wiki/wiki-source';
import { scanItem } from '@placard-wiki/detectors';
import { groupIntoFoyers } from '@placard-wiki/propagation';
import type { WikiDetection } from '@placard-wiki/propagation';
import type { Foyer } from '@placard-wiki/domain';

import type { ServiceContext } from './services/ports';
import {
  FAKE_CLOUD_KEY, MULTI_PAGE_ID, PAGE_ID, SPACE_KEY, TEMPLATE_ID,
  makeTestContext, multiGiteFixtureClient, seedFoyerBySweep,
} from './services/test-support';

/** Contexte injecté dans la surface MCP (le runtime Forge n'est jamais testé). */
const injected = vi.hoisted(() => ({ ctx: null as ServiceContext | null }));

vi.mock('./runtime/context', () => ({
  getServiceContext: (): ServiceContext => {
    if (injected.ctx === null) throw new Error('test : aucun contexte injecté');
    return injected.ctx;
  },
}));

import {
  applyRedaction, checkText, dismissFinding, getCertificate, getExposure, getFinding,
  listExposedSecrets, openRemediationTicket, recordRotation, requestRedaction,
  scanPage, scanSpace, traceFingerprint,
} from './mcp';

/** Vue restreinte d'un foyer : existence + propriétaire, rien d'autre (PW-23). */
interface AggregateView {
  kind: string;
  exists?: boolean;
  spaceKey?: string;
  ownerRef?: string;
}

/** Branche la surface MCP sur un contexte de test. */
function useCtx(ctx: ServiceContext): void {
  injected.ctx = ctx;
}

/** Emplacement d'un foyer tel que `traceFingerprint` le rend. */
interface TracedLocation {
  containerType: string;
  pageId: string;
  maskedPreview: string;
}

/** Ajoute les modèles de page (gîte 5) au foyer — un même foyer, cinq gîtes. */
async function seedTemplateLocation(ctx: ServiceContext, foyer: Foyer): Promise<Foyer> {
  const items = await readTemplates(ctx.confluence);
  const detectedAt = ctx.clock.now();
  const detections: WikiDetection[] = [];
  for (const item of items) {
    if (item.text === undefined) continue;
    const candidates = scanItem(
      { containerType: item.containerType, field: item.field, text: item.text },
      { hmacKey: ctx.hmacKey },
    );
    for (const candidate of candidates) {
      detections.push({
        fingerprint: candidate.fingerprint,
        family: candidate.family,
        containerType: item.containerType,
        containerAri: item.containerAri,
        pageId: item.pageId,
        field: item.field,
        charStart: candidate.charStart,
        charEnd: candidate.charEnd,
        maskedPreview: candidate.maskedPreview,
        detectedAt,
      });
    }
  }
  const merged = groupIntoFoyers(detections, [foyer], []);
  const result = merged[0];
  if (result === undefined) throw new Error('test : aucun foyer fusionné');
  await ctx.store.saveFoyer(result);
  return result;
}

/** Appelle les treize outils, dans l'ordre, et garde chaque sortie. */
async function callAllTools(foyer: Foyer): Promise<Array<{ tool: string; out: unknown }>> {
  return [
    { tool: 'scanPage', out: await scanPage({ pageId: MULTI_PAGE_ID }) },
    { tool: 'scanSpace', out: await scanSpace({ spaceKey: SPACE_KEY }) },
    { tool: 'listExposedSecrets', out: await listExposedSecrets({}) },
    { tool: 'getFinding', out: await getFinding({ findingId: foyer.id }) },
    { tool: 'traceFingerprint', out: await traceFingerprint({ fingerprint: foyer.fingerprint }) },
    { tool: 'getExposure', out: await getExposure({ pageId: MULTI_PAGE_ID }) },
    { tool: 'getCertificate', out: await getCertificate({ spaceKey: SPACE_KEY }) },
    { tool: 'checkText', out: await checkText({ text: `export AWS_ACCESS_KEY_ID=${FAKE_CLOUD_KEY}` }) },
    { tool: 'recordRotation', out: await recordRotation({ findingId: foyer.id, provider: 'AWS', evidenceRef: 'SEC-417' }) },
    { tool: 'requestRedaction', out: await requestRedaction({ findingId: foyer.id }) },
    { tool: 'applyRedaction', out: await applyRedaction({ findingId: foyer.id, approvedBy: 'ari:identity::alice', comment: 'caviardage' }) },
    { tool: 'dismissFinding', out: await dismissFinding({ findingId: foyer.id, reason: 'exemple de recette', reviewAt: '2027-01-01T00:00:00.000Z' }) },
    { tool: 'openRemediationTicket', out: await openRemediationTicket({ findingId: foyer.id, projectKey: 'SEC' }) },
  ];
}

describe('surface MCP — aucune valeur brute en sortie (recette §25.15)', () => {
  it('les treize outils ne renvoient que empreinte HMAC et aperçu masqué', async () => {
    const ctx = makeTestContext({ confluence: multiGiteFixtureClient() });
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, MULTI_PAGE_ID);
    const merged = await seedTemplateLocation(ctx, foyer);

    const outputs = await callAllTools(merged);
    expect(outputs).toHaveLength(13);
    for (const { tool, out } of outputs) {
      expect(JSON.stringify(out), tool).not.toContain(FAKE_CLOUD_KEY);
    }

    // La preuve utile reste là : empreinte et aperçu masqué, rien de plus.
    const scanJson = JSON.stringify(outputs.find((o) => o.tool === 'scanPage')?.out);
    expect(scanJson).toContain('hmac256:');
    expect(scanJson).toContain('AKIA…(20)');
  });
});

describe('traceFingerprint — tous les emplacements d’une empreinte (§11)', () => {
  it('rend la page, la version historique, le commentaire, la pièce jointe et le modèle', async () => {
    const ctx = makeTestContext({ confluence: multiGiteFixtureClient() });
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, MULTI_PAGE_ID);
    const merged = await seedTemplateLocation(ctx, foyer);

    const out = await traceFingerprint({ fingerprint: merged.fingerprint }) as {
      locations: TracedLocation[];
    };
    const types = out.locations.map((l) => l.containerType).sort();
    expect(types).toEqual(['attachment', 'comment', 'page', 'template', 'version']);
    for (const location of out.locations) expect(location.maskedPreview).toBe('AKIA…(20)');
    // Le modèle est bien celui de la fixture (gîte 5), pas un alias de page.
    const template = out.locations.find((l) => l.containerType === 'template');
    expect(template?.pageId).toBe(TEMPLATE_ID);
    expect(JSON.stringify(out)).not.toContain(FAKE_CLOUD_KEY);
  });

  it('rend une liste vide pour une empreinte inconnue', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const out = await traceFingerprint({ fingerprint: 'hmac256:0000000000000000' });
    expect(out).toEqual({ fingerprint: 'hmac256:0000000000000000', locations: [] });
  });
});

describe('droits de lecture — PW-23 (recette §25.13)', () => {
  it('un acteur sans droit de lecture ne voit ni contenu ni aperçu : existence et propriétaire seulement', async () => {
    const ctx = makeTestContext();
    useCtx(ctx);
    const foyer = await seedFoyerBySweep(ctx, PAGE_ID);
    await ctx.store.owners.put({
      pageId: PAGE_ID,
      ownerRef: 'ari:identity::alice',
      method: 'declared-owner',
      confidence: 'high',
      resolvedAt: '2026-11-11T10:00:00.000Z',
    });
    ctx.access = { async canReadPage() { return false; } };

    const scan = await scanPage({ pageId: PAGE_ID }) as { foyers: AggregateView[] };
    const view = scan.foyers[0]!;
    expect(view.kind).toBe('space-aggregate');
    expect(view.exists).toBe(true);
    expect(view.ownerRef).toBe('ari:identity::alice');

    const json = JSON.stringify(scan);
    expect(json).not.toContain('hmac256:');
    expect(json).not.toContain('AKIA');
    expect(json).not.toContain(FAKE_CLOUD_KEY);

    // Même règle sur la lecture d'un foyer précis.
    const finding = await getFinding({ findingId: foyer.id }) as { view: AggregateView };
    expect(finding.view.kind).toBe('space-aggregate');
    expect(JSON.stringify(finding)).not.toContain('hmac256:');
    expect(JSON.stringify(finding)).not.toContain(FAKE_CLOUD_KEY);
  });
});
