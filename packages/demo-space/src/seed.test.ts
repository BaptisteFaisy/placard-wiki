/**
 * Tests du seed (§15) : mode `--dry-run` (imprime, aucun réseau), plan
 * idempotent (déterministe, clés uniques), et exécuteur avec `fetch` injectable
 * (création, échec gracieux). Aucune requête réelle n'est émise.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildSeedPlan, SPACE_KEY, type StepKind } from './plan';
import { executePlan, renderPlan, type FetchLike, type SeedOptions } from './executor';
import { isDryRun, main, missingEnv, optionsFromEnv } from './seed';
import { TITRE_MAX_CARACTERES, commentaireXml } from './fixtures/content';
import { MARQUE_SYNTHETIQUE, fixturesDuGite } from './fixtures/index';

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

describe('plan conforme à l’API réelle (diagnostics curl)', () => {
  const plan = buildSeedPlan();
  const etape = (id: string) => plan.steps.find((s) => s.id === id)!;

  it('les commentaires passent par POST /content avec container.id + container.type', () => {
    const commentaire = etape('comment:1');
    expect(commentaire.method).toBe('POST');
    expect(commentaire.path).toBe('/content');
    const corps = commentaire.body as { type: string; container: { type: string; id: string } };
    expect(corps.type).toBe('comment');
    expect(corps.container).toEqual({ id: '{{page:corps}}', type: 'page' });
    // `child/comment` reste le GET de déduplication (POST y répond 405).
    expect(commentaire.lookup).toContain('/child/comment');
  });

  it('la description d’espace est en représentation `plain`, sans renommer l’espace', () => {
    const corps = etape('space-desc:update').body as Record<string, unknown>;
    const description = corps.description as { plain: { representation: string; value: string } };
    expect(description.plain.representation).toBe('plain');
    expect(description.plain.value).toContain(MARQUE_SYNTHETIQUE);
    expect(corps.name).toBeUndefined();
  });

  it('la mise à jour de l’historique vérifie la version courante (409 sinon)', () => {
    const update = etape('update:histo');
    expect(update.method).toBe('PUT');
    expect(update.lookup).toBe('/content/{{page:histo}}?expand=version');
    expect(update.minVersion).toBe(2);
    expect(update.conflictMeansPresent).toBe(true);
  });

  it('espace et modèle : un conflit « déjà présent » est déclaré idempotent', () => {
    expect(etape('space:create').conflictMeansPresent).toBe(true);
    expect(etape('template:modele').conflictMeansPresent).toBe(true);
    // Aucun GET ne liste les modèles d’espace (405) : pas de lookup inutile.
    expect(etape('template:modele').lookup).toBeUndefined();
  });

  it('seul le partage public reste un échec documenté', () => {
    const documentes = plan.steps.filter((s) => s.documented === true).map((s) => s.id);
    expect(documentes).toEqual(['share:anyone-with-link']);
  });

  it('les titres tiennent dans la limite Confluence de 255 caractères', () => {
    for (const step of plan.steps.filter((s) => s.kind === 'page')) {
      const titre = (step.body as { title: string }).title;
      expect(titre.length).toBeLessThanOrEqual(TITRE_MAX_CARACTERES);
    }
  });
});

describe('executePlan contre les erreurs réelles', () => {
  /** `fetch` piloté par un tableau de réponses (statut + corps) selon l'URL. */
  function fetchPilote(
    journal: Array<{ url: string; init?: RequestInit }>,
    reponse: (url: string, method: string) => { status: number; body: string },
  ): FetchLike {
    return async (url, init) => {
      journal.push({ url, init });
      const { status, body } = reponse(url, init?.method ?? 'GET');
      return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
    };
  }

  const RIEN = JSON.stringify({ results: [] });

  it('pose X-Atlassian-Token: nocheck sur le multipart (sinon 403 XSRF)', async () => {
    const journal: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = fetchPilote(journal, (_url, method) =>
      method === 'GET' ? { status: 200, body: RIEN } : { status: 200, body: '{"id":"x"}' },
    );
    await executePlan(buildSeedPlan(), OPTS, fetch, () => {});
    const pieces = journal.filter((c) => c.url.includes('/child/attachment') && c.init?.method === 'POST');
    expect(pieces.length).toBeGreaterThan(0);
    for (const appel of pieces) {
      const entetes = appel.init?.headers as Record<string, string>;
      expect(entetes['X-Atlassian-Token']).toBe('nocheck');
      expect(entetes['Content-Type']).toBeUndefined();
    }
  });

  it('un conflit 400/409 « déjà présent » devient « ignoré »', async () => {
    const fetch = fetchPilote([], (url, method) => {
      if (method === 'GET') return { status: 404, body: '' };
      if (url.endsWith('/space')) {
        return { status: 400, body: '{"message":"A space already exists with the provided key."}' };
      }
      if (url.endsWith('/template')) {
        return { status: 400, body: "{'translation':'Template title already used, please use a different name.'}" };
      }
      if (method === 'PUT' && url.includes('/content/')) {
        return { status: 409, body: '{"message":"Version must be incremented on update. Current version is: 2"}' };
      }
      return { status: 200, body: '{"id":"x"}' };
    });
    const report = await executePlan(buildSeedPlan(), OPTS, fetch, () => {});
    const byId = new Map(report.results.map((r) => [r.id, r]));
    expect(byId.get('space:create')?.status).toBe('skipped');
    expect(byId.get('template:modele')?.status).toBe('skipped');
  });

  it('ignore la description d’espace déjà identique (PUT rejoué à tort)', async () => {
    const plan = buildSeedPlan();
    const desc = (plan.steps.find((s) => s.id === 'space-desc:update')!.body as Record<string, unknown>).description;
    const fetch = fetchPilote([], (url, method) => {
      if (method !== 'GET') return { status: 200, body: '{"id":"x"}' };
      if (url.includes('expand=description.plain')) {
        return { status: 200, body: JSON.stringify({ id: '3833860', key: SPACE_KEY, description: desc }) };
      }
      return { status: 200, body: RIEN };
    });
    const report = await executePlan(plan, OPTS, fetch, () => {});
    expect(report.results.find((r) => r.id === 'space-desc:update')?.status).toBe('skipped');
  });

  it('ignore la mise à jour quand la page a déjà la version cible', async () => {
    const fetch = fetchPilote([], (url, method) => {
      if (method !== 'GET') return { status: 200, body: '{"id":"x"}' };
      if (url.includes('?expand=version')) {
        return { status: 200, body: '{"id":"4030465","version":{"number":2}}' };
      }
      if (url.includes('/space/')) return { status: 200, body: '{"id":"3833860","key":"PLACARDDEMO"}' };
      return { status: 200, body: RIEN };
    });
    const report = await executePlan(buildSeedPlan(), OPTS, fetch, () => {});
    const update = report.results.find((r) => r.id === 'update:histo');
    expect(update?.status).toBe('skipped');
    expect(update?.confluenceId).toBe('4030465');
  });

  it('déduplique un commentaire dont Confluence a réécrit les accents', async () => {
    const envoye = commentaireXml(fixturesDuGite('commentaires').find((f) => f.number === 5)!);
    const relu = envoye.replace('SYNTHÉTIQUE', 'SYNTH&Eacute;TIQUE').replace('—', '&mdash;');
    const fetch = fetchPilote([], (url, method) => {
      if (method !== 'GET') return { status: 200, body: '{"id":"neuf"}' };
      if (url.includes('/child/comment')) {
        return {
          status: 200,
          body: JSON.stringify({ results: [{ id: '4128801', body: { storage: { value: relu } } }] }),
        };
      }
      return { status: 200, body: RIEN };
    });
    const report = await executePlan(buildSeedPlan(), OPTS, fetch, () => {});
    expect(report.results.find((r) => r.id === 'comment:5')?.status).toBe('skipped');
    expect(report.results.find((r) => r.id === 'comment:5')?.confluenceId).toBe('4128801');
  });
});

describe('main : échecs documentés', () => {
  const ENV_REEL = {
    CONFLUENCE_BASE_URL: 'https://demo.atlassian.net',
    CONFLUENCE_EMAIL: 'demo@example.com',
    CONFLUENCE_API_TOKEN: 'jeton-factice',
  };

  it('ne fait pas échouer le semis (code 0) et le compte à part', async () => {
    const fetch: FetchLike = async (url, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.includes('/property')) {
        return new Response('{"errors":[{"status":405}]}', { status: 405 });
      }
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    };
    const logs: string[] = [];
    const code = await main([], ENV_REEL, fetch, (m) => logs.push(m));
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes('échec documenté share:anyone-with-link'))).toBe(true);
    expect(logs.some((l) => l.includes('1 échec(s) documenté(s), 0 échec(s)'))).toBe(true);
  });

  it('échoue (code 1) sur une erreur non documentée', async () => {
    const fetch: FetchLike = async (_url, init) => {
      const method = init?.method ?? 'GET';
      return new Response(method === 'GET' ? '{"results":[]}' : '{"statusCode":405}', {
        status: method === 'GET' ? 200 : 405,
      });
    };
    const logs: string[] = [];
    const code = await main([], ENV_REEL, fetch, (m) => logs.push(m));
    expect(code).toBe(1);
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