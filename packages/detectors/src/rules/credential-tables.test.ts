import { describe, expect, it } from 'vitest';

import { fakeSuspiciousString, prng } from '@placard/core';

import {
  RULE_CREDENTIAL_LIST,
  RULE_CREDENTIAL_TABLE,
  findCredentialTables,
  tableIsKnownFake,
} from './credential-tables.js';

const rand = prng('tests-credential-tables');
const SECRET_A = fakeSuspiciousString(rand);
const SECRET_B = fakeSuspiciousString(prng('tests-credential-tables-b'));

/** Table XML storage annoncée par ses en-têtes (voie 1). */
const ANNOUNCED_TABLE = [
  '<table><tbody>',
  '<tr><th>Service</th><th>Identifiant</th><th>Mot de passe</th></tr>',
  `<tr><td>prod</td><td>svc-admin</td><td>${SECRET_A}</td></tr>`,
  `<tr><td>staging</td><td>deploy bot</td><td>${SECRET_B}</td></tr>`,
  '</tbody></table>',
].join('');

/** Table sans en-têtes parlants, trahie par son contenu (voie 2). */
const CONTENT_TABLE = [
  '<table><tbody>',
  `<tr><td>marie.dupont@acme.fr</td><td>${SECRET_A}</td></tr>`,
  `<tr><td>john.smith@acme.fr</td><td>${SECRET_B}</td></tr>`,
  '</tbody></table>',
].join('');

describe('famille 11 — tableaux d’identifiants (structurel)', () => {
  it('détecte une table annoncée par en-têtes identifiant + secret', () => {
    const matches = findCredentialTables(`<p>Runbook</p>${ANNOUNCED_TABLE}`);
    expect(matches).toHaveLength(1);
    const match = matches[0]!;
    expect(match.ruleId).toBe(RULE_CREDENTIAL_TABLE);
    expect(match.secretCells).toEqual([SECRET_A, SECRET_B]);
    expect(tableIsKnownFake(match)).toBe(false);
  });

  it('la structure entière est candidate (bornes = toute la table)', () => {
    const text = `<p>avant</p>${ANNOUNCED_TABLE}<p>après</p>`;
    const match = findCredentialTables(text)[0]!;
    expect(text.slice(match.start, match.end)).toBe(ANNOUNCED_TABLE);
  });

  it('détecte une table sans en-têtes par son contenu (e-mails + entropie)', () => {
    const matches = findCredentialTables(CONTENT_TABLE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.secretCells).toHaveLength(2);
  });

  it('ignore une table bénigne (noms propres, textes avec espaces)', () => {
    const benign = [
      '<table><tbody>',
      '<tr><th>Service</th><th>Responsable</th><th>Documentation</th></tr>',
      '<tr><td>prod</td><td>Marie Dupont</td><td>voir la page accueil</td></tr>',
      '<tr><td>staging</td><td>John Smith</td><td>aucune pour le moment</td></tr>',
      '</tbody></table>',
    ].join('');
    expect(findCredentialTables(benign)).toHaveLength(0);
  });

  it('détecte la forme liste (li avec identifiant: … mot de passe: …)', () => {
    const list = [
      '<ul>',
      `<li>identifiant: svc-admin — mot de passe: ${SECRET_A}</li>`,
      `<li>identifiant: deploy — mdp: ${SECRET_B}</li>`,
      '</ul>',
    ].join('');
    const matches = findCredentialTables(list);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ruleId).toBe(RULE_CREDENTIAL_LIST);
    expect(matches[0]!.secretCells).toContain(SECRET_A);
  });

  it('marque isKnownFake quand toutes les valeurs secrètes sont factices', () => {
    const dummy = [
      '<table><tbody>',
      '<tr><th>Login</th><th>Password</th></tr>',
      '<tr><td>admin</td><td>changeme</td></tr>',
      '<tr><td>demo</td><td>dummy</td></tr>',
      '</tbody></table>',
    ].join('');
    const matches = findCredentialTables(dummy);
    expect(matches).toHaveLength(1);
    expect(tableIsKnownFake(matches[0]!)).toBe(true);
  });

  it('ne lève jamais sur un contenu hostile', () => {
    expect(() => findCredentialTables('<table>'.repeat(500))).not.toThrow();
    expect(findCredentialTables('<table><tr><td></td>')).toHaveLength(0);
    expect(findCredentialTables('')).toHaveLength(0);
  });

  it('le préfiltre écarte un texte sans structure (coût borné, §14)', () => {
    expect(findCredentialTables(`mot de passe: ${SECRET_A} en prose libre`)).toHaveLength(0);
  });
});
