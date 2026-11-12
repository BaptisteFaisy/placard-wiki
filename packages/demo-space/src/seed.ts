/**
 * Seed de l'espace de démonstration (§15) — remplace le squelette.
 *
 * Usage :
 *   pnpm seed:demo            # réel (CONFLUENCE_BASE_URL/EMAIL/API_TOKEN requis)
 *   pnpm seed:demo -- --dry-run   # imprime les requêtes, AUCUN réseau
 *
 * `fetch` est injectable (`main(argv, env, fetchImpl, log)`) pour les tests ;
 * le plan est idempotent (lookup avant création, et un conflit « déjà présent »
 * vaut « ignoré »). La seule étape qui échoue encore est le partage public
 * « anyone with the link », impossible via REST : elle est marquée `documented`
 * et ne fait pas échouer le semis.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { executePlan, renderPlan, type FetchLike, type Logger, type SeedOptions } from './executor';
import { API_PREFIX_DEFAULT, buildSeedPlan } from './plan';

/** Variables d'environnement obligatoires en mode réel. */
const REQUIRED_ENV = ['CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'] as const;

/** Variables absentes de l'environnement. */
export function missingEnv(env: NodeJS.ProcessEnv): readonly string[] {
  return REQUIRED_ENV.filter((name) => !env[name]);
}

/** Le mode `--dry-run` est-il demandé ? */
export function isDryRun(argv: readonly string[]): boolean {
  return argv.includes('--dry-run');
}

/** Options depuis l'environnement ; `undefined` si une variable manque. */
export function optionsFromEnv(env: NodeJS.ProcessEnv): SeedOptions | undefined {
  const { CONFLUENCE_BASE_URL: baseUrl, CONFLUENCE_EMAIL: email, CONFLUENCE_API_TOKEN: token } = env;
  if (!baseUrl || !email || !token) return undefined;
  return { baseUrl, email, token, apiPrefix: env.CONFLUENCE_API_PREFIX ?? API_PREFIX_DEFAULT };
}

/** Options factices pour le `--dry-run` (aucune requête n'est émise). */
const DRY_RUN_OPTIONS: SeedOptions = {
  baseUrl: 'https://VOTRE-SITE.atlassian.net',
  email: '',
  token: '',
  apiPrefix: API_PREFIX_DEFAULT,
};

/** Point d'entrée : renvoie le code de sortie (0 = succès). */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
  log: Logger = console.log,
): Promise<number> {
  const dryRun = isDryRun(argv);
  const plan = buildSeedPlan();
  if (dryRun) {
    const opts = optionsFromEnv(env) ?? DRY_RUN_OPTIONS;
    log('[demo-space] --dry-run : plan imprimé, aucune requête réseau.');
    for (const line of renderPlan(plan, opts)) log(line);
    return 0;
  }
  const missing = missingEnv(env);
  if (missing.length > 0) {
    log(`[demo-space] variables manquantes : ${missing.join(', ')}`);
    return 1;
  }
  const opts = optionsFromEnv(env)!;
  const report = await executePlan(plan, opts, fetchImpl, log);
  const compte = (s: string) => report.results.filter((r) => r.status === s).length;
  const documentés = report.results.filter((r) => r.status === 'failed' && r.documented === true).length;
  const échecs = compte('failed') - documentés;
  log(
    `[demo-space] espace ${report.spaceKey} : ${compte('created')} créé(s), ${compte('skipped')} ignoré(s), ` +
      `${documentés} échec(s) documenté(s), ${échecs} échec(s).`,
  );
  return échecs > 0 ? 1 : 0;
}

/** Garde d'exécution directe (ESM) : `tsx src/seed.ts`. */
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  void main().then((code) => {
    process.exitCode = code;
  });
}