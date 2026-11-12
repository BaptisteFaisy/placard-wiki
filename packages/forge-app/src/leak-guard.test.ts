/**
 * Preuve de non-fuite — un balayage complet, en mémoire, sans réseau.
 *
 * La règle d'or du projet (« zéro secret persisté, jamais testé, jamais
 * journalisé ») n'est plus une affirmation : elle est **vérifiée ici**, après
 * un balayage complet de l'espace de canaris.
 *
 * Ce que le test exige, surface par surface :
 *  - aucune valeur de test dans les empreintes, les aperçus, les lignes du
 *    registre, le certificat, le rapport de couverture ni le journal ;
 *  - aucune valeur transmise à l'oracle (le contexte est masqué) ;
 *  - aucune sortie réseau pendant la passe.
 *
 * La passe est partagée avec les autres gardes (charge utile live, réseau) :
 * elle est jouée une fois, en mémoire, par `test-support/preuve.ts`.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { CANARIES, assertNoCanary, canariesReconnus, findCanaries } from './test-support/canaries';
import { HMAC_KEY, runPreuve } from './test-support/preuve';
import type { Preuve } from './test-support/preuve';

/** Les empreintes HMAC que le balayage a reconnues (les foyers détectés). */
function empreintesDetectees(preuve: Preuve): Set<string> {
  return new Set(preuve.foyers.map((foyer) => foyer.fingerprint));
}

/** Les méthodes du port Confluence — le seul interlocuteur du balayage. */
const CLIENT_CONFLUENCE = [
  'getPage', 'listVersions', 'getVersionContent', 'listComments', 'listAttachments',
  'downloadAttachment', 'getSpaceDescription', 'listTemplates', 'searchCql',
  'getRestrictions', 'getSpacePermissions', 'getSharingState',
];

/** Hôtes et mots-clés qu'aucun appel du balayage ne doit mentionner. */
const HOTE_INTERDIT = [
  'amazonaws', 'stripe', 'github', 'gitlab', 'googleapis', 'azure', 'openai',
  'anthropic', 'twilio', 'sendgrid', 'datadog', 'sentry', 'mailchimp',
];

describe('preuve de non-fuite — balayage complet en mémoire', () => {
  let preuve: Preuve;

  beforeAll(async () => {
    preuve = await runPreuve();
  });

  it('la passe a réellement balayé et détecté (garde non vide)', () => {
    expect(preuve.sweep.pagesScanned).toBeGreaterThan(0);
    expect(preuve.foyers.length).toBeGreaterThan(0);
    expect(preuve.sweep.foyersTouched).toBe(preuve.foyers.length);
  });

  it('aucune valeur de test dans les empreintes ni dans les aperçus masqués', () => {
    for (const foyer of preuve.foyers) {
      const apercus = foyer.locations.map((location) => location.maskedPreview);
      assertNoCanary(foyer.fingerprint, `empreinte du foyer ${foyer.id}`, HMAC_KEY);
      for (const apercu of apercus) {
        assertNoCanary(apercu, `aperçu masqué du foyer ${foyer.id}`, HMAC_KEY);
      }
    }
    const apercusMasques = preuve.foyers.flatMap((foyer) => foyer.locations.map((l) => l.maskedPreview));
    expect(apercusMasques.length).toBeGreaterThan(0);
    expect(apercusMasques.some((apercu) => apercu.includes('…') || apercu.includes('[REDACTED:'))).toBe(true);
  });

  it('aucune valeur de test dans les lignes du registre', () => {
    expect(preuve.rows.length).toBeGreaterThan(0);
    assertNoCanary(JSON.stringify(preuve.rows), 'lignes du registre', HMAC_KEY);
  });

  it('aucune valeur de test dans le certificat ni dans le rapport de couverture', () => {
    assertNoCanary(JSON.stringify(preuve.certificate), 'certificat', HMAC_KEY);
    assertNoCanary(JSON.stringify(preuve.coverage), 'rapport de couverture', HMAC_KEY);
    expect(preuve.certificate.contentHash).toMatch(/^hmac256:/);
  });

  it('aucune valeur de test dans le journal de la passe', () => {
    expect(preuve.logs.length).toBeGreaterThan(0);
    assertNoCanary(preuve.logs.join('\n'), 'journal de la passe', HMAC_KEY);
  });

  it('aucune valeur reconnue transmise à l’oracle (contexte masqué)', () => {
    // La garde n'a de sens que si l'oracle a été consulté : le tableau
    // d'identifiants de la démo est un candidat ambigu (§7).
    expect(preuve.questions.length).toBeGreaterThan(0);
    const reconnus = canariesReconnus(empreintesDetectees(preuve), HMAC_KEY);
    // La garde n'est pas vide : le balayage a reconnu des valeurs.
    expect(reconnus.length).toBeGreaterThan(0);
    for (const question of preuve.questions) {
      for (const canary of reconnus) {
        expect(question.maskedContext).not.toContain(canary.value);
        expect(question.maskedPreview).not.toContain(canary.value);
      }
      expect(question.maskedContext).toContain('[REDACTED:');
    }
  });

  it('les valeurs que les règles ne reconnaissent pas restent un angle mort déclaré', () => {
    // Une valeur qu'aucune règle ne reconnaît (mot de passe court, nom de
    // fichier, hôte d'une URL) reste en clair dans le contexte masqué de
    // l'oracle. La preuve le **constate** et le déclare — elle ne le cache
    // pas — et vérifie qu'aucune de ces valeurs n'atteint la charge utile
    // publique, qui elle, ne publie que des valeurs reconnues et caviardées.
    const connus = new Set(canariesReconnus(empreintesDetectees(preuve), HMAC_KEY).map((c) => c.value));
    const nonReconnus = new Set<string>();
    for (const question of preuve.questions) {
      for (const canary of CANARIES) {
        if (connus.has(canary.value)) continue;
        if (question.maskedContext.includes(canary.value)) nonReconnus.add(canary.label);
      }
    }
    for (const canary of CANARIES) {
      if (!nonReconnus.has(canary.label)) continue;
      expect(JSON.stringify(preuve.payload)).not.toContain(canary.value);
    }
  });

  it('aucune sortie réseau pendant la passe', () => {
    expect(preuve.networkCalls).toEqual([]);
    expect(preuve.calls.length).toBeGreaterThan(0);
    for (const call of preuve.calls) {
      expect(CLIENT_CONFLUENCE).toContain(call.method);
      expect(call.argument.startsWith('http')).toBe(false);
      for (const interdit of HOTE_INTERDIT) {
        expect(call.argument.toLowerCase()).not.toContain(interdit);
      }
    }
  });

  it('le corpus de canaris est bien planté (le test ne peut pas passer à vide)', () => {
    expect(CANARIES.length).toBeGreaterThan(10);
    const valeurs = new Set(CANARIES.map((canary) => canary.value));
    expect(valeurs.size).toBe(CANARIES.length);
    expect(findCanaries(CANARIES[0]?.value ?? '', HMAC_KEY)).toHaveLength(1);
  });
});
