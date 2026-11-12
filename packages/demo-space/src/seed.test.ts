/**
 * Tests du seed (§15) : mode `--dry-run` (imprime, aucun réseau), plan
 * idempotent (déterministe, clés uniques), et exécuteur avec `fetch` injectable
 * (création, échec gracieux). Aucune requête réelle n'est émise.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildSeedPlan, SPACE_KEY, type StepKind } from './plan';
import { executePlan, renderPlan, type FetchLike, type SeedOptions } from './executor';
import { isDryRun, main, missingEnv, optionsFromEnv } from './seed';

const OPTS: SeedOptions = {
  baseUrl: 'https://demo.atlassian.net',
  email: 'demo@example.com',
  token: 'jeton-factice',
  apiPrefix: '/wiki/rest/api',
};

/** `fetch` qui renvoie « non trouvé » en GET et « créé » sinon. */
function fetchCreant(journal: string[]): FetchLike {
  return async (url, init) => {
    const method = init?.method ?? 'GET';
    journal.push(`${method} ${url}`);
    const payload = method === 'GET' ? { results: [] } : { id: `id-${journal.length}` };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

describe('plan idempotent', () => {
  it('est déterministe : deux constructions donnent les mêmes étapes', () => {
    const a = buildSeedPlan();
    const b = buildSeedPlan();
    expect(a.steps.map((s) => s.id)).toEqual(b.steps.map((s) => s.id));
    expect(a.steps).toHaveLength(b.steps.length);
  });

  it('a des clés d’étape uniques (condition d’idempotence)', () => {
    const ids = buildSeedPlan().steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('couvre les sept gîtes + espace + partage', () => {
    const kinds = new Set(buildSeedPlan().steps.map((s) => s.kind));
    for (const attendu of ['space', 'space-desc', 'page', 'update', 'comment', 'attachment', 'template', 'share']) {
      expect(kinds.has(attendu as StepKind)).toBe(true);
    }
  });

  it('l’espace porte la clé attendue', () => {
    expect(buildSeedPlan().spaceKey).toBe(SPACE_KEY);
  });
});

describe('renderPlan (--dry-run)', () => {
  it('imprime une ligne par étape, sans réseau', () => {
    const plan = buildSeedPlan();
    const lignes = renderPlan(plan, OPTS);
    expect(lignes).toHaveLength(plan.steps.length);
    expect(lignes[0]).toContain('POST');
    expect(lignes.some((l) => l.includes(SPACE_KEY))).toBe(true);
    expect(lignes.some((l) => l.includes('share:anyone-with-link'))).toBe(true);
  });

  it('rend les références lisibles ‹ID›', () => {
    const lignes = renderPlan(buildSeedPlan(), OPTS);
    expect(lignes.some((l) => l.includes('‹page:corps›'))).toBe(true);
  });
});

describe('main --dry-run', () => {
  it('n’émet AUCUNE requête réseau et imprime le plan', async () => {
    const fetchInterdit = vi.fn(() => {
      throw new Error('aucun réseau en --dry-run');
    }) as unknown as FetchLike;
    const logs: string[] = [];
    const code = await main(['--dry-run'], {}, fetchInterdit, (m) => logs.push(m));
    expect(code).toBe(0);
    expect(fetchInterdit).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes('--dry-run'))).toBe(true);
    expect(logs.some((l) => l.includes('POST'))).toBe(true);
  });

  it('détecte le drapeau --dry-run', () => {
    expect(isDryRun(['--dry-run'])).toBe(true);
    expect(isDryRun([])).toBe(false);
  });
});

describe('main mode réel', () => {
  it('refuse de semer sans variables d’environnement', async () => {
    const logs: string[] = [];
    const code = await main([], {}, fetchCreant([]), (m) => logs.push(m));
    expect(code).toBe(1);
    expect(logs.some((l) => l.includes('manquantes'))).toBe(true);
  });

  it('liste les variables manquantes', () => {
    expect(missingEnv({})).toEqual(['CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN']);
    expect(missingEnv({ CONFLUENCE_BASE_URL: 'x' })).toEqual(['CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN']);
  });

  it('construit les options depuis l’environnement', () => {
    const opts = optionsFromEnv({
      CONFLUENCE_BASE_URL: 'https://x.atlassian.net',
      CONFLUENCE_EMAIL: 'a@b.c',
      CONFLUENCE_API_TOKEN: 't',
    });
    expect(opts?.baseUrl).toBe('https://x.atlassian.net');
    expect(opts?.apiPrefix).toBe('/wiki/rest/api');
    expect(optionsFromEnv({})).toBeUndefined();
  });
});

describe('executePlan (fetch injectable)', () => {
  it('crée les étapes quand le lookup ne trouve rien', async () => {
    const journal: string[] = [];
    const plan = buildSeedPlan();
    const report = await executePlan(plan, OPTS, fetchCreant(journal), () => {});
    expect(report.spaceKey).toBe(SPACE_KEY);
    expect(report.results).toHaveLength(plan.steps.length);
    expect(report.results.every((r) => r.status === 'created')).toBe(true);
    expect(journal.length).toBeGreaterThan(0);
  });

  it('ne lève jamais : un fetch en échec donne « failed »', async () => {
    const fetchErreur: FetchLike = async () => {
      throw new Error('réseau indisponible');
    };
    const report = await executePlan(buildSeedPlan(), OPTS, fetchErreur, () => {});
    expect(report.results.every((r) => r.status === 'failed')).toBe(true);
  });

  it('ignore une étape dont le lookup trouve l’entité', async () => {
    const fetchTrouve: FetchLike = async (_url, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return new Response(
          JSON.stringify({ id: 'existant', key: 'existant', results: [{ id: 'existant', title: 'x' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 'neuf' }), { status: 200 });
    };
    const plan = buildSeedPlan();
    const report = await executePlan(plan, OPTS, fetchTrouve, () => {});
    const ignorees = report.results.filter((r) => r.status === 'skipped');
    expect(ignorees.length).toBeGreaterThan(0);
    expect(report.results.every((r) => r.status !== 'failed')).toBe(true);
  });
});