import { describe, expect, it } from 'vitest';

import { fakeSuspiciousString, prng } from '@placard/core';

import {
  RULE_ATTACHMENT_ENTROPY,
  findWikiRiskyExtension,
  isAttachmentOfInterest,
  isHighEntropyBlob,
  screenshotBlindSpot,
} from './attachments.js';

/** Matière à forte entropie : 4 Ko de valeurs factices distinctes (core). */
function highEntropyBlob(): string {
  let out = '';
  for (let i = 0; i < 110; i += 1) out += fakeSuspiciousString(prng(`blob-${i}`));
  return out;
}

describe('famille 12 — pièces jointes sensibles', () => {
  it.each([
    ['coffre.kdbx', 'risky-file-password-vault'],
    ['vpn.ovpn', 'risky-file-vpn-profile'],
    ['export-identifiants.csv', 'risky-file-data-export'],
    ['budget.xlsx', 'risky-file-data-export'],
    ['rapport.XLSX', 'risky-file-data-export'],
  ])('complète le vendor : %s → %s', (filename, ruleId) => {
    const match = findWikiRiskyExtension(filename);
    expect(match?.ruleId).toBe(ruleId);
    expect(match?.reasonFr.length).toBeGreaterThan(10);
  });

  it('laisse au vendor les extensions qu’il couvre déjà (.env, .pem, id_rsa…)', () => {
    // Rien ici : .env/.pem/.p12/.pfx/.ppk/id_rsa sont détectés par scanPath
    // du moteur vendor, réemployé tel quel — jamais recopié (§21).
    expect(findWikiRiskyExtension('config.env')).toBeUndefined();
    expect(findWikiRiskyExtension('cle.pem')).toBeUndefined();
    expect(findWikiRiskyExtension('readme.md')).toBeUndefined();
    expect(findWikiRiskyExtension('notes')).toBeUndefined();
  });

  it('déclare les captures d’écran comme angle mort, avec sa raison', () => {
    const spot = screenshotBlindSpot('capture-terminal.png');
    expect(spot).toBeDefined();
    expect(spot!.reasonFr).toMatch(/non lu/i);
    expect(spot!.reasonFr).toMatch(/OCR/);
    expect(spot!.reasonEn.length).toBeGreaterThan(10);
    expect(screenshotBlindSpot('rapport.pdf')).toBeUndefined();
  });

  it('isAttachmentOfInterest couvre extensions à risque et images', () => {
    expect(isAttachmentOfInterest('coffre.kdbx')).toBe(true);
    expect(isAttachmentOfInterest('photo.jpg')).toBe(true);
    expect(isAttachmentOfInterest('rapport.pdf')).toBe(false);
    expect(isAttachmentOfInterest(undefined)).toBe(false);
  });

  it('qualifie une matière à forte entropie (signal binaire du contenu extrait)', () => {
    expect(isHighEntropyBlob(highEntropyBlob())).toBe(true);
  });

  it('refuse un texte lisible et un extrait trop court', () => {
    expect(isHighEntropyBlob('ceci est un runbook rédigé en français, tout ce qu’il y a de lisible. '.repeat(10))).toBe(false);
    expect(isHighEntropyBlob('ab')).toBe(false);
    expect(isHighEntropyBlob('')).toBe(false);
  });

  it('ne lève jamais sur un nom de fichier hostile', () => {
    expect(() => findWikiRiskyExtension('../..//.kdbx'.repeat(50))).not.toThrow();
    expect(() => screenshotBlindSpot('.'.repeat(500))).not.toThrow();
    expect(isHighEntropyBlob('\u0000'.repeat(5000))).toBe(false);
  });

  it('expose un identifiant de règle stable pour l’entropie binaire', () => {
    expect(RULE_ATTACHMENT_ENTROPY).toBe('risky-file-binary-entropy');
  });
});
