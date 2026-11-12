#!/usr/bin/env node
// Sonde des capacités API de la plateforme (prototypes du §22) — 100 % lecture.
//
// Mesure, avec le jeton API Atlassian de l'utilisateur (Basic auth, jamais
// affiché), ce que la plateforme permet VRAIMENT sur les points que le
// prototype « semaine 1 » devait trancher (§22). C'est le complément
// applicatif de PR #65 (purge mesurée côté app) : on croise ici les mêmes
// routes, en lecture seule, pour les autres gîtes.
//
//   P1  purge d'une version précise (v1 vs v2, plage acceptée)
//   P2  pièce jointe : liste, taille, mediaType, et téléchargement du binaire
//   P4  restrictions lisibles, partage « anyone with the link »
//   P6  whiteboards et bases — atteignables par l'API contenu ?
//   P9  groupes imbriqués — résolubles pour compter les lecteurs ?
//
// AUCUNE écriture sur le site : les DELETE sont tentés sur des numéros de
// version inexistants (999999), les téléchargements sont bornés (<= 256 Ko de
// binaire, lecture seule). Aucune valeur de secret n'est échangée : le site de
// démo ne contient que des valeurs factices.
//
// Usage : node tools/probe-confluence-api.mjs
// Sortie : JSON ligne par ligne, à relire dans docs/PROBE-API-2026-11-12.md.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const log = (...a) => console.log(...a);

function creds() {
  const login = readFileSync(join(homedir(), '.atlassian-login'), 'utf8');
  const token = readFileSync(join(homedir(), '.atlassian-api-token'), 'utf8').trim();
  const email = login.split('\n').map((l) => l.trim()).find((l) => l.startsWith('email='))?.slice(6) ?? '';
  const site = 'one-atlas-cndz.atlassian.net';
  const auth = 'Basic ' + Buffer.from(email + ':' + token).toString('base64');
  return { email, site, auth };
}

async function req(method, path, accept = 'application/json') {
  const { auth, site } = creds();
  const res = await fetch('https://' + site + path, { method, headers: { Authorization: auth, Accept: accept } });
  const buf = Buffer.from(await res.arrayBuffer());
  let corps;
  try { corps = JSON.parse(buf.toString('utf8')); } catch { corps = null; }
  return { status: res.status, type: res.headers.get('content-type') || '', octets: buf.length, corps, brut: buf };
}

async function main() {
  const { site } = creds();
  log(JSON.stringify({ etape: 'contexte', site }));

  // L'espace se prend PAR SA CLÉ dans le chemin : `/space?keys=` est ignoré
  // (mesuré : 13 espaces renvoyés, le premier « EO »).
  const espace = await req('GET', '/wiki/rest/api/space/PLACARDDEMO?expand=homepage');
  log(JSON.stringify({ etape: 'espace', status: espace.status, cle: espace.corps?.key, nom: espace.corps?.name, id: espace.corps?.id, page: espace.corps?.homepage?.id }));

  // ── P1 : la route de purge existe-t-elle, et sous quelle plage ? ──────────
  const pageId = espace.corps?.homepage?.id;
  if (pageId) {
    const delV1 = await req('DELETE', `/wiki/rest/api/content/${pageId}/version/999999`);
    log(JSON.stringify({ etape: 'P1-DELETE-v1(bogus)', status: delV1.status, extrait: JSON.stringify(delV1.corps ?? {}).slice(0, 240) }));
    const delV2 = await req('DELETE', `/wiki/api/v2/pages/${pageId}/versions/999999`);
    log(JSON.stringify({ etape: 'P1-DELETE-v2(bogus)', status: delV2.status, extrait: JSON.stringify(delV2.corps ?? {}).slice(0, 160) }));
  }

  // ── P4 : restrictions et réglages d'espace (le partage public y vit-il ?) ─
  const restrict = await req('GET', `/wiki/rest/api/content/${pageId}/restriction/byOperation`);
  log(JSON.stringify({ etape: 'P4-restriction', status: restrict.status, extrait: JSON.stringify(restrict.corps ?? {}).slice(0, 200) }));
  const settings = await req('GET', '/wiki/rest/api/space/PLACARDDEMO/settings');
  log(JSON.stringify({ etape: 'P4-settings', status: settings.status, cles: settings.corps ? Object.keys(settings.corps) : [] }));

  // ── P2 : pièces jointes — liste réelle du seed, puis un binaire ───────────
  const pageAtt = '3964930'; // page du seed qui porte les 12 .env (Tableau d'identifiants)
  const atts = await req('GET', `/wiki/rest/api/content/${pageAtt}/child/attachment`);
  const res = atts.corps?.results ?? [];
  log(JSON.stringify({ etape: 'P2-liste', status: atts.status, nb: atts.corps?.size, listees: res.map((a) => ({ id: a.id, titre: a.title, mediaType: a.extensions?.mediaType, octets: a.extensions?.fileSize })).slice(0, 4) }));
  const petite = res.find((a) => (a.extensions?.fileSize ?? 0) > 0 && (a.extensions?.fileSize ?? 0) <= 256 * 1024);
  if (petite) {
    const bin = await req('GET', `/wiki/rest/api/content/${pageAtt}/child/attachment/${petite.id}/download`, '*/*');
    log(JSON.stringify({ etape: 'P2-download', titre: petite.titre, tailleDeclaree: petite.extensions?.fileSize, status: bin.status, type: bin.type, octetsLus: bin.octets, debut: bin.octets ? bin.brut.toString('utf8', 0, 48).replace(/\n/g, '\\n') : '' }));
  }

  // ── P6 : whiteboards et bases, vus par l'API contenu ──────────────────────
  for (const t of ['whiteboard', 'base']) {
    const r = await req('GET', `/wiki/rest/api/content/search?cql=type=${encodeURIComponent(t)}&limit=1`);
    log(JSON.stringify({ etape: 'P6-recherche', type: t, status: r.status, extrait: JSON.stringify(r.corps ?? {}).slice(0, 160) }));
  }

  // ── P9 : groupes (imbriqués résolubles ?) ─────────────────────────────────
  const groupes = await req('GET', '/wiki/rest/api/group?limit=5');
  log(JSON.stringify({ etape: 'P9-groupes', status: groupes.status, noms: (groupes.corps?.results ?? []).map((g) => g.name) }));
  const perm = await req('GET', '/wiki/rest/api/space/PLACARDDEMO/permission');
  log(JSON.stringify({ etape: 'P9-permissions-espace', status: perm.status }));

  log(JSON.stringify({ etape: 'fin', note: 'lecture seule : DELETE sur versions inexistantes, téléchargement borné' }));
}

main().catch((e) => { console.error('sonde en échec :', String(e).slice(0, 300)); process.exit(2); });