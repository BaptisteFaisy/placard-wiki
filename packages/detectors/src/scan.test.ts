import { describe, expect, it } from 'vitest';

import { fakeSuspiciousString, fakeValue, prng } from '@placard/core';

import { scanItem } from './scan.js';
import type { DetectionCandidate, ScanItem, WikiScanDeps } from './types.js';

/** Toutes les valeurs de test sont fabriquées par @placard/core (PLA-N-09). */
const rand = prng('tests-scan');
const CLOUD_KEY = fakeValue('cloud-key', 'tests-scan-cloud');
const PASSWORD = fakeSuspiciousString(rand);
const DEPS: WikiScanDeps = { hmacKey: 'cle-hmac-de-test' };

function page(text: string): ScanItem {
  return { containerType: 'page', field: 'body', text };
}

function familiesOf(candidates: readonly DetectionCandidate[]): string[] {
  return candidates.map((candidate) => candidate.family);
}

describe('scanItem — pipeline des familles wiki', () => {
  it('réemploie les neuf familles Git : clé cloud détectée, bornes exactes', () => {
    const text = `export AWS_ACCESS_KEY_ID=${CLOUD_KEY}`;
    const candidates = scanItem(page(text), DEPS);
    const cloud = candidates.find((c) => c.family === 'cloud-key');
    expect(cloud).toBeDefined();
    expect(text.slice(cloud!.charStart, cloud!.charEnd)).toBe(CLOUD_KEY);
  });

  it('famille 10 : chaîne de connexion, et pas de doublon « mot de passe URL »', () => {
    const text = `DB_URL=postgres://svc-admin:${PASSWORD}@db.internal:5432/app`;
    const candidates = scanItem(page(text), DEPS);
    const connection = candidates.find((c) => c.family === 'connection-string');
    expect(connection).toBeDefined();
    expect(connection!.ruleId).toBe('connection-string-uri');
    expect(connection!.isKnownFake).toBe(false);
    // La règle vendor famille 5 chevauche la même valeur : la famille 10 gagne.
    expect(familiesOf(candidates)).not.toContain('plaintext-password');
  });

  it('famille 10 : valeur factice connue → isKnownFake, toujours candidate', () => {
    const candidates = scanItem(page('postgres://svc:changeme@db.internal/app'), DEPS);
    const connection = candidates.find((c) => c.family === 'connection-string');
    expect(connection?.isKnownFake).toBe(true);
  });

  it('famille 11 : la table entière est candidate, ambigüe (oracle LLM)', () => {
    const table = [
      '<table><tbody>',
      '<tr><th>Identifiant</th><th>Mot de passe</th></tr>',
      `<tr><td>svc-admin</td><td>${PASSWORD}</td></tr>`,
      '</tbody></table>',
    ].join('');
    const candidates = scanItem(page(table), DEPS);
    const structure = candidates.find((c) => c.family === 'credential-table');
    expect(structure).toBeDefined();
    expect(structure!.ambiguous).toBe(true);
    expect(table.slice(structure!.charStart, structure!.charEnd)).toBe(table);
  });

  it('famille 12 : extension wiki (.kdbx) détectée sur le nom', () => {
    const item: ScanItem = { containerType: 'attachment', field: 'filename', text: '', filename: 'coffre.kdbx', sizeBytes: 4096 };
    const candidates = scanItem(item, DEPS);
    expect(familiesOf(candidates)).toContain('risky-file');
    expect(candidates.some((c) => c.ruleId === 'risky-file-password-vault')).toBe(true);
  });

  it('famille 12 : extension vendor (.env) réemployée via scanPath', () => {
    const item: ScanItem = { containerType: 'attachment', field: 'filename', text: '', filename: '.env.production' };
    const candidates = scanItem(item, DEPS);
    expect(candidates.some((c) => c.ruleId === 'risky-file-dotenv')).toBe(true);
  });

  it('famille 12 : contenu textuel extractible d’une pièce jointe est balayé', () => {
    const item: ScanItem = {
      containerType: 'attachment',
      field: 'text',
      text: `export AWS_ACCESS_KEY_ID=${CLOUD_KEY}`,
      filename: 'notes.txt',
    };
    const candidates = scanItem(item, DEPS);
    expect(familiesOf(candidates)).toContain('cloud-key');
  });

  it('empreinte HMAC : préfixe stable, clé injectable, aucune valeur brute en sortie', () => {
    const text = `postgres://svc-admin:${PASSWORD}@db.internal/app`;
    const candidates = scanItem(page(text), DEPS);
    const connection = candidates.find((c) => c.family === 'connection-string')!;
    expect(connection.fingerprint).toMatch(/^hmac256:[0-9a-f]{32}$/);
    // La même clé HMAC reproduit la même empreinte ; une autre clé, une autre.
    const again = scanItem(page(text), DEPS).find((c) => c.family === 'connection-string')!;
    expect(again.fingerprint).toBe(connection.fingerprint);
    const other = scanItem(page(text), { hmacKey: 'autre-cle' }).find(
      (c) => c.family === 'connection-string',
    )!;
    expect(other.fingerprint).not.toBe(connection.fingerprint);
    // Zéro secret dans les sorties (PLA-N-02) : la sérialisation est propre.
    expect(JSON.stringify(candidates)).not.toContain(PASSWORD);
    expect(JSON.stringify(candidates)).not.toContain(CLOUD_KEY);
  });

  it('l’aperçu masqué ne révèle pas la valeur', () => {
    const candidates = scanItem(page(`postgres://svc-admin:${PASSWORD}@db/app`), DEPS);
    const connection = candidates.find((c) => c.family === 'connection-string')!;
    expect(connection.maskedPreview).not.toContain(PASSWORD.slice(0, 8));
    expect(connection.maskedPreview.length).toBeLessThan(PASSWORD.length + 40);
  });

  it('disabledFamilies : une famille désactivée ne produit aucun candidat', () => {
    const text = `postgres://svc-admin:${PASSWORD}@db.internal/app`;
    const deps: WikiScanDeps = { ...DEPS, disabledFamilies: ['connection-string'] };
    expect(familiesOf(scanItem(page(text), deps))).not.toContain('connection-string');
  });

  it('famille 9 (prose) : candidat ambigu, comme le prévoit le §7', () => {
    const secret = fakeSuspiciousString(prng('tests-prose'));
    const candidates = scanItem(page(`le secret de prod est ${secret} — ne pas diffuser`), DEPS);
    const suspicious = candidates.find((c) => c.family === 'suspicious-string');
    expect(suspicious).toBeDefined();
    expect(suspicious!.ambiguous).toBe(true);
  });

  it('ne lève jamais sur un contenu hostile ou vide', () => {
    expect(() => scanItem(page('<table>'.repeat(2000)), DEPS)).not.toThrow();
    expect(scanItem(page(''), DEPS)).toEqual([]);
    expect(() => scanItem(page('\u0000'.repeat(10_000)), DEPS)).not.toThrow();
  });

  it('exige une clé HMAC (l’empreinte n’a pas de sens sans elle)', () => {
    expect(() => scanItem(page('x'), { hmacKey: '' })).toThrow(/hmacKey/);
  });
});
