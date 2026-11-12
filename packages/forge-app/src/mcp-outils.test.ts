/**
 * Tests des treize outils MCP (§17) — ce que la surface d'agent promet, et ce
 * qu'elle refuse :
 *  - la surface expose bien les treize outils du cahier ;
 *  - `scan-space` balaie l'espace (CQL) et déclare les pièces jointes non lues ;
 *  - `dismiss-finding` refuse un ruban sans raison écrite ;
 *  - `open-remediation-ticket` n'emporte jamais de valeur brute ;
 *  - `get-finding` répond explicitement sur un identifiant inconnu ;
 *  - `get-certificate` chiffre, `get-exposure` porte sa méthode, et le registre
 *    respecte ses filtres.
 *
 * Contexte injecté par un mock du runtime Forge : aucun SDK `@forge/*` n'est
 * instancié, `@forge/sql` n'est jamais touché, le store est celui de
 * `services/test-support` (mémoire).
 */

import { describe, expect, it, vi } from 'vitest';
import { createFixtureClient, loadFixtureData } from '@placard-wiki/wiki-source';
import type { Certificate, Foyer, PageExposure, RegistryRow } from '@placard-wiki/domain';

import type { JiraPort, ServiceContext } from './services/ports';
import { runSweep } from './services/sweep';
import {
  FAKE_CLOUD_KEY, PAGE_ID, SPACE_KEY, makeTestContext,
} from './services/test-support';

/** Contexte injecté dans la surface MCP (le runtime Forge n'est jamais testé). */
const injected = vi.hoisted(() => ({ ctx: null as ServiceContext | null }));

vi.mock('./runtime/context', () => ({
  getServiceContext: (): ServiceContext => {
    if (injected.ctx === null) throw new Error('test : aucun contexte injecté');
    return injected.ctx;
  },
}));

import * as mcp from './mcp';

/** Les treize outils du cahier (§17), par leur nom d'export. */
const OUTILS = [
  'scanPage', 'scanSpace', 'listExposedSecrets', 'getFinding', 'traceFingerprint',
  'getExposure', 'getCertificate', 'checkText', 'recordRotation', 'requestRedaction',
  'applyRedaction', 'dismissFinding', 'openRemediationTicket',
] as const;

/** Espace de la fixture de démonstration (cinq pages, pièces jointes incluses). */
const DEMO_SPACE = 'RUN';

/** Contexte branché sur la page de fixture (corps porteur de la clé factice). */
function pageContext(): ServiceContext {
  const ctx = makeTestContext();
  injected.ctx = ctx;
  return ctx;
}

/** Contexte branché sur la fixture de démonstration (pièces jointes non lues). */
function demoContext(): ServiceContext {
  const ctx = makeTestContext({ confluence: createFixtureClient(loadFixtureData()) });
  injected.ctx = ctx;
  return ctx;
}

/** Balaye la page de fixture et renvoie le foyer ouvert. */
async function foyerDeLaPage(ctx: ServiceContext): Promise<Foyer> {
  await runSweep(ctx, { mode: 'on-demand', scope: PAGE_ID, maxPages: 1 });
  const foyer = (await ctx.store.listFoyers({ limit: 10 }))[0];
  if (foyer === undefined) throw new Error('test : aucun foyer produit');
  return foyer;
}

/** Réponse d'un outil qui peut refuser. */
interface Refusal {
  ok?: boolean;
  reason?: string;
}

describe('surface MCP — les treize outils du cahier (§17)', () => {
  it('expose exactement les treize outils nommés au §17', () => {
    expect(OUTILS).toHaveLength(13);
    for (const nom of OUTILS) {
      expect(typeof mcp[nom], nom).toBe('function');
    }
  });
});

describe('scan-space — un espace se balaie comme un espace (§17)', () => {
  it('balaye les pages de l’espace et compte les foyers ouverts', async () => {
    const ctx = pageContext();
    const out = await mcp.scanSpace({ spaceKey: SPACE_KEY }) as {
      spaceKey: string; pagesScanned: number; foyersTouched: number; done: boolean;
    };

    expect(out.spaceKey).toBe(SPACE_KEY);
    expect(out.pagesScanned).toBe(1);
    expect(out.foyersTouched).toBe(1);
    expect(out.done).toBe(true);
    expect(ctx.store).toBeDefined();
  });

  it('déclare les pièces jointes non lues, avec leur raison (§14)', async () => {
    demoContext();
    const out = await mcp.scanSpace({ spaceKey: DEMO_SPACE }) as {
      pagesScanned: number; blindSpots: string[];
    };

    expect(out.pagesScanned).toBe(5);
    // Les pièces jointes non lues sont annoncées, avec leur raison (§14).
    expect(out.blindSpots.join(' ')).toMatch(/non lue/i);
    expect(out.blindSpots.join(' ')).toMatch(/volumineux|binaire|droits insuffisants/);
    // Aucun contenu de page ne fuit dans la sortie.
    expect(JSON.stringify(out)).not.toContain('DEMO_USER');
  });

  it('reste borné par la limite demandée', async () => {
    demoContext();
    const out = await mcp.scanSpace({ spaceKey: DEMO_SPACE, limit: 2 }) as { pagesScanned: number };
    expect(out.pagesScanned).toBe(2);
  });
});

describe('dismiss-finding — un ruban exige une raison écrite (§12)', () => {
  it('refuse un ruban sans raison écrite, puis accepte une raison', async () => {
    const ctx = pageContext();
    const foyer = await foyerDeLaPage(ctx);

    const refus = await mcp.dismissFinding({
      findingId: foyer.id, reason: '', reviewAt: '2027-01-01T00:00:00.000Z',
    }) as Refusal;
    expect(refus.ok).toBe(false);
    expect(refus.reason ?? '').not.toBe('');

    const accepte = await mcp.dismissFinding({
      findingId: foyer.id, reason: 'valeur de test dans un runbook', reviewAt: '2027-01-01T00:00:00.000Z',
    }) as Refusal;
    expect(accepte.ok).toBe(true);

    const apres = await ctx.store.getFoyer(foyer.id);
    expect(apres?.state).toBe('dismissed');
    expect(apres?.dismissedReason).toBe('valeur de test dans un runbook');
  });
});

describe('open-remediation-ticket — le ticket ne transporte aucune valeur brute (§25.15)', () => {
  it('n’envoie ni la clé ni le corps de page à Jira', async () => {
    const ctx = pageContext();
    let charge: { summary: string; description: string; labels: string[] } | null = null;
    const port: JiraPort = {
      async createIssue(payload) {
        charge = { summary: payload.summary, description: payload.description, labels: payload.labels };
        return { key: 'SEC-1', url: '/browse/SEC-1' };
      },
    };
    ctx.jira = port;
    const foyer = await foyerDeLaPage(ctx);

    const out = await mcp.openRemediationTicket({ findingId: foyer.id, projectKey: 'SEC' }) as { ticketKey: string };
    expect(out.ticketKey).toBe('SEC-1');

    const ticket = JSON.stringify(charge);
    expect(ticket).not.toContain(FAKE_CLOUD_KEY);
    expect(ticket).not.toContain('AWS_ACCESS_KEY_ID');
    // Ce qui circule : l’empreinte HMAC et l’aperçu masqué (§5, §23).
    expect(ticket).toContain('hmac256:');
    expect(ticket).toContain('AKIA…(20)');
  });
});

describe('get-finding — pas de silence sur un identifiant inconnu', () => {
  it('répond « foyer-introuvable » au lieu de rien', async () => {
    pageContext();
    const out = await mcp.getFinding({ findingId: 'foyer-inexistant' });
    expect(out).toEqual({ error: 'foyer-introuvable' });
  });
});

describe('get-certificate — le certificat chiffre et s’intègre (§25.16)', () => {
  it('compte les foyers, garde son empreinte d’intégrité et aucune valeur brute', async () => {
    const ctx = pageContext();
    await foyerDeLaPage(ctx);

    const cert = await mcp.getCertificate({ spaceKey: SPACE_KEY }) as Certificate;
    expect(cert.scope).toBe(SPACE_KEY);
    expect(cert.open).toBeGreaterThanOrEqual(1);
    expect(cert.contentHash).not.toBe('');
    expect(cert.residualExposure).not.toBe('');
    expect(JSON.stringify(cert)).not.toContain(FAKE_CLOUD_KEY);
  });

  it('rend le même certificat tant que rien ne change', async () => {
    const ctx = pageContext();
    await foyerDeLaPage(ctx);

    const premier = await mcp.getCertificate({ spaceKey: SPACE_KEY }) as Certificate;
    const second = await mcp.getCertificate({ spaceKey: SPACE_KEY }) as Certificate;
    expect(second.id).toBe(premier.id);
    expect(second.contentHash).toBe(premier.contentHash);
  });
});

describe('get-exposition et registre — chaque chiffre porte sa méthode (§8)', () => {
  it('get-exposure rend une fourchette de lecteurs avec sa méthode', async () => {
    pageContext();
    const out = await mcp.getExposure({ pageId: PAGE_ID }) as PageExposure;

    expect(out.readers.method).not.toBe('');
    expect(out.readers.low).toBeGreaterThanOrEqual(0);
    expect(out.aiSurface.hypothesis).toBe(true);
    expect(JSON.stringify(out)).not.toContain(FAKE_CLOUD_KEY);
  });

  it('list-exposed-secrets filtre sur l’état du foyer', async () => {
    const ctx = pageContext();
    const foyer = await foyerDeLaPage(ctx);

    const ouverts = await mcp.listExposedSecrets({}) as { foyers: RegistryRow[] };
    expect(ouverts.foyers).toHaveLength(1);
    expect(ouverts.foyers[0]?.state).toBe('open');

    await mcp.dismissFinding({
      findingId: foyer.id, reason: 'faux positif de recette', reviewAt: '2027-01-01T00:00:00.000Z',
    });

    const ecartes = await mcp.listExposedSecrets({ state: 'dismissed' }) as { foyers: RegistryRow[] };
    expect(ecartes.foyers).toHaveLength(1);
    expect(ecartes.foyers[0]?.state).toBe('dismissed');

    const tropHauts = await mcp.listExposedSecrets({ minScore: 1000 }) as { foyers: RegistryRow[] };
    expect(tropHauts.foyers).toHaveLength(0);
  });
});
