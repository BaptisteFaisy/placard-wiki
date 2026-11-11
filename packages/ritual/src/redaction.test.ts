import { describe, expect, it } from 'vitest';

import { fakeValue, redactPreview } from '@placard/core';

import {
  REFUSAL_NO_ATTESTATION,
  applyRedaction,
  formatDateFr,
  redactionMarker,
  redactionPreview,
} from './redaction.js';
import type { RedactionSource } from './redaction.js';
import type { StoragePort } from './ports.js';
import { makeAttestation, makeFoyer } from './test-support.js';

/**
 * Recette §25.4 (modèle d'abord), §25.7 (refus sans attestation), §25.9
 * (version attribuée à la personne qui approuve) + la règle absolue : le
 * texte retiré n'est recopié nulle part (§5, §9).
 */

const SECRET = fakeValue('cloud-key', 'graine-redaction');
const MASKED = redactPreview(SECRET, 'cloud-key');

function sourceWith(containerType: RedactionSource['containerType'], locationId: string, pageId: string): RedactionSource {
  const text = `<p>Runbook staging — clé : ${SECRET} à révoquer.</p>`;
  const start = text.indexOf(SECRET);
  return {
    locationId,
    pageId,
    containerType,
    text,
    occurrences: [{ start, end: start + SECRET.length }],
    maskedPreview: MASKED,
  };
}

/** Port de stockage factice : enregistre les écritures, ne lit rien. */
function fakeStorage(): { port: StoragePort; calls: Array<{ pageId: string; text: string; comment: string; asUser: string }> } {
  const calls: Array<{ pageId: string; text: string; comment: string; asUser: string }> = [];
  const port: StoragePort = {
    async writeVersion(pageId, text, comment, asUser) {
      calls.push({ pageId, text, comment, asUser });
      return 8;
    },
  };
  return { port, calls };
}

describe('marqueur et dates (§9)', () => {
  it('formate la date réelle en français court', () => {
    expect(formatDateFr('2026-11-12T09:30:00.000Z')).toBe('12 nov. 2026');
  });

  it('construit le marqueur avec la date et la référence réelles de l’attestation', () => {
    expect(redactionMarker(makeAttestation())).toBe('[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]');
  });
});

describe('redactionPreview — diffs masqués', () => {
  const attestation = makeAttestation();

  it('ne recopie jamais la valeur : maskedBefore montre l’aperçu masqué', () => {
    const { diffs } = redactionPreview(attestation, [sourceWith('page', 'loc-page', 'page-1')]);
    expect(diffs).toHaveLength(1);
    const diff = diffs[0]!;
    expect(diff.maskedBefore).toContain(MASKED);
    expect(diff.maskedBefore).not.toContain(SECRET);
    expect(diff.after).toContain('[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]');
    expect(diff.after).not.toContain(SECRET);
    expect(JSON.stringify(diffs)).not.toContain(SECRET);
  });

  it('propose les modèles d’abord (§25.4)', () => {
    const sources = [
      sourceWith('page', 'loc-page', 'page-1'),
      sourceWith('template', 'loc-template', 'page-2'),
      sourceWith('comment', 'loc-comment', 'page-1'),
    ];
    const { diffs, templateFirst } = redactionPreview(attestation, sources);
    expect(templateFirst).toEqual(['loc-template']);
    expect(diffs[0]?.locationId).toBe('loc-template');
  });
});

describe('applyRedaction', () => {
  it('refuse sans attestation humaine (§25.7)', async () => {
    const { port } = fakeStorage();
    const result = await applyRedaction(
      makeFoyer(),
      undefined,
      { approvedBy: 'ari:identity::alice', comment: 'Runbook nettoyé', sources: [sourceWith('page', 'loc-page', 'page-1')] },
      port,
    );
    expect(result).toEqual({ ok: false, reason: REFUSAL_NO_ATTESTATION });
  });

  it('refuse une approbation anonyme (§5 : modification au nom de la personne)', async () => {
    const { port } = fakeStorage();
    const result = await applyRedaction(
      makeFoyer(),
      makeAttestation(),
      { approvedBy: '  ', comment: '', sources: [sourceWith('page', 'loc-page', 'page-1')] },
      port,
    );
    expect(result.ok).toBe(false);
  });

  it('applique au nom de la personne qui approuve, avec commentaire de version (§25.9)', async () => {
    const { port, calls } = fakeStorage();
    const result = await applyRedaction(
      makeFoyer(),
      makeAttestation(),
      { approvedBy: 'ari:identity::alice', comment: 'Runbook nettoyé', sources: [sourceWith('page', 'loc-page', 'page-1')] },
      port,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(1);
    expect(result.asUser).toBe('ari:identity::alice');
    expect(calls[0]?.asUser).toBe('ari:identity::alice');
    expect(result.versionComment).toContain('Runbook nettoyé');
    expect(result.versionComment).toContain('SEC-417');
    expect(result.versionComment).toContain('ari:identity::alice');
    expect(calls[0]?.comment).toBe(result.versionComment);
  });

  it('ne recopie JAMAIS le texte retiré (§5) : la valeur factice d’entrée ne sort nulle part', async () => {
    const { port, calls } = fakeStorage();
    const result = await applyRedaction(
      makeFoyer(),
      makeAttestation(),
      {
        approvedBy: 'ari:identity::alice',
        comment: '',
        sources: [sourceWith('page', 'loc-page', 'page-1'), sourceWith('template', 'loc-template', 'page-2')],
      },
      port,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sortie complète sérialisée : ni les nouveaux textes, ni le commentaire,
    // ni l'attribution ne contiennent la valeur factice placée en entrée.
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(calls)).not.toContain(SECRET);
    // Le marqueur a bien pris la place de la valeur dans le texte storage,
    // modèles d'abord (§25.4).
    expect(result.texts[0]?.locationId).toBe('loc-template');
    expect(result.texts[0]?.text).toContain('[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]');
    expect(result.texts[1]?.text).toContain('[retiré — rotation attestée le 12 nov. 2026, voir SEC-417]');
  });
});
