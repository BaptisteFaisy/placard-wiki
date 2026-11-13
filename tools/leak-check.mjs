#!/usr/bin/env node
/**
 * Rejeu de la garde de non-fuite sur la charge utile LIVE réelle.
 *
 * La chaîne live (`pw-public-demo`) sert un JSON public : la carte des foyers,
 * le registre, le certificat, les titres (masqués) des pages balayées. Ce
 * script reprend le corpus de valeurs de test — les « canaris » plantés dans
 * l'espace de démonstration — et vérifie qu'AUCUNE n'apparaît dans le JSON
 * renvoyé par le site réel en production.
 *
 * Usage :
 *   node tools/leak-check.mjs                 # interroge l'URL live par défaut
 *   node tools/leak-check.mjs --file x.json   # rejoue sur un JSON local
 *   node tools/leak-check.mjs --url  <URL>    # interroge une autre URL
 *
 * Sortie : code 0 = aucune fuite ; code 1 = une valeur de test est présente ;
 * code 2 = charge utile illisible ou indisponible.
 *
 * Aucune valeur n'apparaît dans la sortie : une fuite est nommée par son
 * étiquette et une empreinte SHA-256 tronquée. Bibliothèque standard
 * uniquement ; le corpus est produit par le dépôt lui-même (source unique),
 * lancé via `node --import tsx`.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** L'URL du webtrigger public (celle du site live, de production). */
const URL_LIVE_DEFAUT =
  'https://268bea73-73bf-4b1e-a3e7-862161c6298a.webtrigger.atlassian.app/public/U3iRFUXiNU509Lv_sk5n7382zbI';

/** Racine du dépôt (ce script vit dans `tools/`). */
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Chemin du dumper de corpus (TypeScript, exécuté avec le chargeur tsx). */
const DUMPER = join(RACINE, 'packages', 'forge-app', 'src', 'test-support', 'canaries-dump.ts');

/** Empreinte courte d'une valeur : identifier une fuite sans la montrer. */
function empreinte(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

/** Lance le dumper et récupère le corpus, en mémoire (stdout capturé). */
function corpus() {
  const resultat = spawnSync(
    process.execPath,
    ['--import', 'tsx', DUMPER],
    { cwd: RACINE, encoding: 'utf8', timeout: 60_000 },
  );
  if (resultat.status !== 0) {
    throw new Error(`corpus illisible (${String(resultat.stderr).trim() || 'tsx introuvable — pnpm install requis'})`);
  }
  return JSON.parse(resultat.stdout);
}

/** La charge utile : un fichier local, une URL, ou l'URL live par défaut. */
async function chargeUtile(args) {
  const fichier = args.find((arg) => arg === '--file') ? args[args.indexOf('--file') + 1] : undefined;
  const url = args.find((arg) => arg === '--url') ? args[args.indexOf('--url') + 1] : undefined;
  if (fichier !== undefined) return readFileSync(fichier, 'utf8');
  const cible = url ?? process.env['PW_LIVE_URL'] ?? URL_LIVE_DEFAUT;
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), 30_000);
  try {
    const reponse = await fetch(cible, { signal: controle.signal });
    if (!reponse.ok) throw new Error(`HTTP ${String(reponse.status)}`);
    return await reponse.text();
  } finally {
    clearTimeout(minuterie);
  }
}

/** Rejoue la garde : renvoie les fuites constatées (étiquette + empreinte). */
function fuites(charge, canaries) {
  const trouvees = [];
  for (const canary of canaries) {
    if (charge.includes(canary.value)) {
      trouvees.push({ label: canary.label, empreinte: empreinte(canary.value) });
    }
  }
  return trouvees;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node tools/leak-check.mjs [--file x.json | --url <URL>]');
    return 0;
  }
  let canaries;
  let charge;
  try {
    canaries = corpus();
  } catch (erreur) {
    console.error(`::error:: corps de canaris : ${String(erreur.message)}`);
    return 2;
  }
  try {
    charge = await chargeUtile(args);
  } catch (erreur) {
    console.error(`::error:: charge utile indisponible : ${String(erreur.message)}`);
    return 2;
  }
  const trouvees = fuites(charge, canaries);
  if (trouvees.length === 0) {
    console.log(`OK — ${String(canaries.length)} canaris vérifiés, aucune valeur de test dans la charge utile (${String(charge.length)} octets).`);
    return 0;
  }
  for (const fuite of trouvees) {
    console.error(`FUITE ${fuite.label} [${fuite.empreinte}]`);
  }
  console.error(`${String(trouvees.length)} valeur(s) de test présente(s) dans la charge utile live.`);
  return 1;
}

process.exitCode = await main();