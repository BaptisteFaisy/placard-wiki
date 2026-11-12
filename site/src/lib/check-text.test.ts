// Tests des motifs légers du site (lib/check-text.ts).
// Ils tournent via `pnpm --filter @placard-wiki/site test` : le workspace
// vitest racine ne couvre que `packages/*` (vitest.workspace.ts, hors du
// périmètre `site/**` de cette branche) — écart documenté dans la PR.

import { describe, expect, it } from 'vitest';
import { checkText } from './check-text.js';

/** Fabrique une fausse clé AWS de 20 caractères sans l'écrire en clair. */
function fakeAwsKey(): string {
  return 'AKIA' + 'A7X'.repeat(5) + 'Q';
}

describe('checkText — motifs légers', () => {
  it('détecte une fausse clé AWS et masque la valeur', () => {
    const key = fakeAwsKey();
    const hits = checkText(`Accès prod : ${key} à révoquer`);
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.family).toBe('cloud-key');
    expect(hit.knownFake).toBe(false);
    // PW-04 : l'aperçu masqué ne contient jamais la valeur brute.
    expect(hit.maskedPreview).not.toContain(key);
    expect(hit.maskedPreview).toMatch(/^AKIA…\(\d+\)$/);
  });

  it('signale la valeur factice documentée par AWS comme knownFake', () => {
    const hits = checkText('Exemple de doc : AKIAIOSFODNN7EXAMPLE');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.knownFake).toBe(true);
  });

  it('détecte une chaîne de connexion sans exposer identifiant ni mot de passe', () => {
    const hits = checkText('psql postgres://svc_demo:chouchou27@db.internal:5432/app');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.family).toBe('connection-string');
    expect(hits[0]!.maskedPreview).not.toContain('chouchou27');
    expect(hits[0]!.maskedPreview.startsWith('postgres://…')).toBe(true);
  });

  it('détecte un mot de passe en clair et masque la valeur', () => {
    const hits = checkText('mot de passe: chouchou2026 !');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.family).toBe('plaintext-password');
    expect(hits[0]!.maskedPreview).not.toContain('chouchou2026');
  });

  it('détecte un jeton GitHub factice construit pour le test', () => {
    const token = 'ghp_' + 'a1B2'.repeat(9);
    const hits = checkText(`token ci : ${token}`);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.family).toBe('platform-token');
    expect(hits[0]!.maskedPreview).not.toContain(token);
  });

  it('ne produit aucune occurrence sur un texte propre', () => {
    expect(checkText('Runbook de déploiement : voir la page OPS-12, rien de sensible ici.')).toHaveLength(0);
  });

  it('ne fait pas double-emploi sur des occurrences chevauchantes', () => {
    // La règle « mot de passe » et la règle « tableau » couvrent la même ligne :
    // une seule occurrence doit remonter (tri par position, anti-chevauchement).
    const hits = checkText('password=abc123def');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < hits.length; i += 1) {
      const prev = hits[i - 1]!;
      const cur = hits[i]!;
      expect(prev.end).toBeLessThanOrEqual(cur.start);
    }
  });
});
