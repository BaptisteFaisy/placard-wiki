/**
 * Tests du scénario hors réseau (`pnpm demo`) : les nombres attendus et la
 * règle absolue — **zéro valeur brute**.
 *
 * Le scénario est exécuté une seule fois (`beforeAll`) : il est déterministe.
 * Les nombres sont ceux de la passe sur les fixtures : 84 valeurs factices
 * plantées, regroupées en 48 foyers (une empreinte = un foyer) sur 67
 * emplacements, danger maximal 95 (clé privée propagée sur 5 emplacements).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { RITUAL_STEPS } from '@placard-wiki/domain';

import { runDemoScenario } from './demo-scenario';
import { renderReportJson, renderReportText } from './demo';
import { SECRET_FIXTURES } from './fixtures/index';
import type { DemoReport } from './demo-types';

/** Les valeurs factices à ne jamais voir apparaître — filtrées aux longues. */
const VALEURS = SECRET_FIXTURES.map((f) => f.value).filter((v) => v.length >= 6);

describe('démo hors réseau (pnpm demo)', () => {
  let rapport: DemoReport;

  beforeAll(async () => {
    rapport = await runDemoScenario();
  });

  it('tourne hors réseau, sans clé', () => {
    expect(rapport.offline).toBe(true);
  });

  it('regroupe les nombres attendus : 48 foyers, 67 emplacements', () => {
    expect(rapport.scores.foyers).toBe(48);
    expect(rapport.scores.emplacements).toBe(67);
    expect(rapport.scores.plantes).toBe(SECRET_FIXTURES.length);
  });

  it('la répartition par gîte somme bien aux emplacements', () => {
    const total = Object.values(rapport.scores.parGite).reduce((a, b) => a + b, 0);
    expect(total).toBe(rapport.scores.emplacements);
  });

  it('trouve le danger maximal 95 (clé privée propagée)', () => {
    expect(rapport.scores.dangerMax).toBe(95);
    expect(rapport.scores.dangerMaxFamily).toBe('private-key');
  });

  it('le score n’est jamais nu : au moins un terme avec une méthode', () => {
    expect(rapport.foyer.scoreTerms.length).toBeGreaterThan(0);
    for (const terme of rapport.foyer.scoreTerms) {
      expect(terme.method.length).toBeGreaterThan(0);
      expect(terme.label.length).toBeGreaterThan(0);
    }
  });

  it('joue les cinq étapes du rituel, dans l’ordre du domaine', () => {
    const etapes = rapport.ritual.steps.map((s) => s.step);
    expect(etapes).toEqual([...RITUAL_STEPS]);
  });

  it('déverrouille le rituel : attestation humaine, caviardage, puis purge documentée', () => {
    expect(rapport.ritual.attestation.state).toBe('rotation-attested');
    expect(rapport.ritual.redaction.applied).toBe(2);
    expect(rapport.ritual.redaction.asUser).toBe('alice');
    expect(rapport.ritual.purge.apiCanPurge).toBe(false);
    expect(rapport.ritual.purge.state).toBe('purge-impossible');
    expect(rapport.ritual.purge.blockedReason.length).toBeGreaterThan(0);
  });

  it('émet un certificat daté et vérifiable en signature (§16)', () => {
    expect(rapport.certificate.scope).toBe('site');
    expect(rapport.certificate.contentHash).toMatch(/^hmac256:/);
  });

  it('ZÉRO valeur brute : rien dans le rapport ni dans les rendus', () => {
    const brut = JSON.stringify(rapport);
    const texte = renderReportText(rapport).join('\n');
    const json = renderReportJson(rapport);
    for (const valeur of VALEURS) {
      expect(brut).not.toContain(valeur);
      expect(texte).not.toContain(valeur);
      expect(json).not.toContain(valeur);
    }
  });

  it('les diff de caviardage sont intégralement masqués', () => {
    expect(rapport.ritual.redaction.diffs.length).toBeGreaterThan(0);
    for (const diff of rapport.ritual.redaction.diffs) {
      for (const valeur of VALEURS) {
        expect(diff.maskedBefore).not.toContain(valeur);
        expect(diff.after).not.toContain(valeur);
      }
      expect(diff.after).toContain('retiré — rotation attestée');
    }
  });
});
