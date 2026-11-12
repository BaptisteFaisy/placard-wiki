/**
 * Le rejeu hors ligne (`tools/leak-check.mjs`) se teste lui-même.
 *
 * Deux cas : un JSON propre (sortie 0) et un JSON qui contient une valeur de
 * test (sortie 1). Le script fait tourner le dump de corpus (`node --import
 * tsx`) en sous-processus : ce test vérifie que la chaîne entière est soudée.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANARIES } from './test-support/canaries';

const RACINE = fileURLToPath(new URL('../../../', import.meta.url));

function rejouer(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const resultat = spawnSync(process.execPath, ['tools/leak-check.mjs', ...args], {
    cwd: RACINE, encoding: 'utf8', timeout: 120_000,
  });
  return { status: resultat.status, stdout: resultat.stdout, stderr: resultat.stderr };
}

describe('tools/leak-check.mjs — rejeu hors ligne', () => {
  it('sort 0 sur une charge utile propre', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'placard-leak-'));
    try {
      const fichier = join(dossier, 'propre.json');
      writeFileSync(fichier, JSON.stringify({ titre: 'rien à signaler' }));
      const resultat = rejouer(['--file', fichier]);
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain('OK');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('sort 1 quand une valeur de test fuit', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'placard-leak-'));
    try {
      const canari = CANARIES[0]?.value ?? 'valeur-par-defaut';
      const fichier = join(dossier, 'fuite.json');
      writeFileSync(fichier, JSON.stringify({ titre: `accès staging (mdp: ${canari})` }));
      const resultat = rejouer(['--file', fichier]);
      expect(resultat.status).toBe(1);
      expect(resultat.stderr).toContain('FUITE');
      // La valeur elle-même n'est jamais recopiée dans la sortie.
      expect(resultat.stderr).not.toContain(canari);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});