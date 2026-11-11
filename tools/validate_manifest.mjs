#!/usr/bin/env node
/**
 * Garde de cohérence du manifeste — sans Forge CLI, sans réseau.
 *
 * `forge lint` valide le schéma ; ce script valide les **liens** que le schéma
 * ne voit pas, et qui cassent le déploiement sans erreur de compilation :
 *
 *   1. toute `function` référencée existe dans `packages/forge-app/src/index.ts` ;
 *   2. toute `action` a une `function`, et tout outil de `rovo:mcp` /
 *      `rovo:skill` / `rovo:agent` désigne une `action` déclarée ;
 *   3. toute `resource` pointe vers un fichier présent ;
 *   4. chaque écran Confluence a sa resource et son resolver ;
 *   5. les verbes des actions de lecture sont bien `GET` (cahier §17 : les
 *      outils de lecture doivent être appelables par un agent Rovo) ;
 *   6. `record-rotation` est bien CREATE (l'attestation est un fait écrit) ;
 *   7. exactement un module `sql` et un module `llm`.
 *
 * Usage : node tools/validate_manifest.mjs   (code 0 = OK, 1 = incohérence)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = process.cwd();
const APP = join(ROOT, 'packages', 'forge-app');
const manifest = yaml.load(readFileSync(join(APP, 'manifest.yml'), 'utf8'));
const modules = manifest.modules ?? {};
const errors = [];
const notes = [];

function fail(message) {
  errors.push(message);
}

// 1 — fonctions déclarées vs fonctions exportées
const declaredFunctions = new Set((modules.function ?? []).map((f) => f.key));
const indexSource = readFileSync(join(APP, 'src/index.ts'), 'utf8');
const exported = new Set([...indexSource.matchAll(/export\s+(?:const|async\s+function|function)\s+(\w+)/g)].map((m) => m[1]));
for (const match of indexSource.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*['"][^'"]+['"])?\s*;/g)) {
  for (const part of match[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop()?.trim();
    if (name) exported.add(name);
  }
}

for (const fn of modules.function ?? []) {
  const name = String(fn.handler ?? '').split('.').pop();
  if (!name) fail(`function ${fn.key} : handler absent`);
  else if (!exported.has(name)) fail(`function ${fn.key} : « ${name} » n'est pas exporté par src/index.ts`);
}

// 2 — actions, outils MCP, skill, agent
const actions = modules.action ?? [];
const actionKeys = new Set(actions.map((a) => a.key));
for (const action of actions) {
  if (!action.function) fail(`action ${action.key} : function absente`);
  else if (!declaredFunctions.has(action.function)) fail(`action ${action.key} : function « ${action.function} » non déclarée`);
  if (!action.actionVerb) fail(`action ${action.key} : actionVerb absent`);
  if (!action.description || action.description.length < 20) fail(`action ${action.key} : description trop courte pour Rovo`);
}

const mcp = modules['rovo:mcp'] ?? [];
if (mcp.length !== 1) notes.push(`rovo:mcp : ${mcp.length} module(s) — la plateforme n'en accepte qu'un`);
for (const server of mcp) {
  for (const tool of server.tools ?? []) {
    if (!actionKeys.has(tool)) fail(`rovo:mcp ${server.key} : l'outil « ${tool} » n'est pas une action déclarée`);
  }
  if ((server.tools ?? []).length > 50) fail(`rovo:mcp ${server.key} : plus de 50 outils`);
}

for (const skill of modules['rovo:skill'] ?? []) {
  const dir = skill.source?.dir;
  if (!dir || !existsSync(join(APP, dir, 'SKILL.md'))) fail(`rovo:skill ${skill.key} : SKILL.md introuvable dans ${dir}`);
  for (const tool of skill.dependencies?.tools ?? []) {
    if (!actionKeys.has(tool)) fail(`rovo:skill ${skill.key} : l'outil « ${tool} » n'est pas une action déclarée`);
  }
}

for (const agent of modules['rovo:agent'] ?? []) {
  for (const tool of agent.actions ?? []) {
    if (!actionKeys.has(tool)) fail(`rovo:agent ${agent.key} : l'action « ${tool} » n'est pas déclarée`);
  }
  if (!agent.prompt || agent.prompt.length < 100) fail(`rovo:agent ${agent.key} : prompt trop court`);
}

// 5/6 — verbes (cahier §17)
const READ_TOOLS = [
  'scan-page', 'scan-space', 'list-exposed-secrets', 'get-finding',
  'trace-fingerprint', 'get-exposure', 'get-certificate', 'check-text',
];
for (const action of actions) {
  if (READ_TOOLS.includes(action.key) && action.actionVerb !== 'GET') {
    fail(`action ${action.key} : verbe « ${action.actionVerb} » au lieu de GET (un agent Rovo ne pourrait pas l'appeler)`);
  }
}
const WRITE_TOOLS = {
  'record-rotation': 'CREATE',
  'request-redaction': 'CREATE',
  'apply-redaction': 'UPDATE',
  'dismiss-finding': 'UPDATE',
  'open-remediation-ticket': 'CREATE',
};
for (const [key, verb] of Object.entries(WRITE_TOOLS)) {
  const action = actions.find((a) => a.key === key);
  if (action && action.actionVerb !== verb) fail(`action ${key} : verbe « ${action.actionVerb} » au lieu de ${verb} (§17)`);
}

// 3/4 — resources et écrans
const resources = new Map((manifest.resources ?? []).map((r) => [r.key, r.path]));
const SCREEN_MODULES = [
  'confluence:globalPage', 'confluence:spaceSettingsPage',
  'confluence:contentAction', 'confluence:macro',
];
for (const moduleName of SCREEN_MODULES) {
  for (const screen of modules[moduleName] ?? []) {
    if (!screen.resource) fail(`${moduleName} ${screen.key} : resource absente`);
    else if (!resources.has(screen.resource)) fail(`${moduleName} ${screen.key} : resource « ${screen.resource} » non déclarée`);
    if (!screen.resolver?.function && !screen.function) fail(`${moduleName} ${screen.key} : ni resolver ni function`);
    const fn = screen.resolver?.function ?? screen.function;
    if (fn && !declaredFunctions.has(fn)) fail(`${moduleName} ${screen.key} : function « ${fn} » non déclarée`);
  }
}
for (const [key, path] of resources) {
  if (!existsSync(join(APP, path))) fail(`resource ${key} : fichier ${path} introuvable (depuis packages/forge-app)`);
}

// triggers, consumer, webtrigger, scheduledTrigger → fonctions déclarées
for (const [moduleName, field] of [['trigger', 'function'], ['consumer', null], ['webtrigger', 'function'], ['scheduledTrigger', 'function']]) {
  for (const entry of modules[moduleName] ?? []) {
    const fn = field ? entry[field] : entry.resolver?.function ?? entry.function;
    if (!fn) fail(`${moduleName} ${entry.key} : aucune fonction`);
    else if (!declaredFunctions.has(fn)) fail(`${moduleName} ${entry.key} : function « ${fn} » non déclarée`);
  }
}

// 7 — stockage et modèle (cahier §19)
if ((modules.sql ?? []).length !== 1) fail('sql : un et un seul module de stockage attendu (§20)');
if ((modules.llm ?? []).length !== 1) fail('llm : un et un seul module de modèle attendu (famille 9/11, candidats ambigus)');

// Rappels budget : un seul scheduledTrigger à 5 min (cahier §19)
const scheduled = modules.scheduledTrigger ?? [];
if (scheduled.length > 5) fail(`scheduledTrigger : ${scheduled.length} modules, la plateforme en accepte 5 au plus`);
const fiveMin = scheduled.filter((s) => /cron:.*\*\/5/.test(String(s.interval ?? '')));
if (fiveMin.length > 1) fail('scheduledTrigger : un seul intervalle de 5 minutes est autorisé par la plateforme');

for (const note of notes) console.log('NOTE ' + note);
for (const error of errors) console.log('KO ' + error);
if (errors.length > 0) {
  console.log(`\n${errors.length} incohérence(s) dans packages/forge-app/manifest.yml`);
  process.exit(1);
}
const counts = Object.entries(modules).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 1}`).join(' ');
console.log(`OK — manifeste cohérent (${counts})`);
