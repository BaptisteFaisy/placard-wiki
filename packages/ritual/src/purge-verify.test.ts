import { describe, expect, it } from 'vitest';

import { verifyPurge } from './purge-verify';
import type { FingerprintFn, VersionReader } from './purge-verify';

/**
 * Un lecteur de versions factice : les corps sont ceux qu'il rend,
 * la renumérotation est simulée en changeant les corps des versions.
 */
function readerWith(
  bodies: Record<number, string>,
  list: number[],
): VersionReader {
  return {
    async readVersion(_pageId, versionNumber) {
      const body = bodies[versionNumber];
      if (body === undefined) return { kind: 'absent' };
      return { kind: 'found', body };
    },
    async listVersionNumbers() {
      return list;
    },
  };
}

const FP: FingerprintFn = (content) => `fp:${content}`;

describe('verifyPurge — « est-ce encore lisible ? » (§9)', () => {
  it('purge vérifiée : la version n’existe plus → purgé', async () => {
    const reader = readerWith({}, []);
    const result = await verifyPurge('page-1', [2], reader);
    expect(result.verified).toBe(true);
    expect(result.foyerState).toBe('purged');
    expect(result.reason).toBe('');
    expect(result.checks[0]!.purged).toBe(true);
  });

  it('vérification fausse : la version est encore lisible, le foyer reste ouvert', async () => {
    const reader = readerWith({ 2: 'le corps visé' }, [2]);
    const result = await verifyPurge('page-1', [2], reader);
    expect(result.verified).toBe(false);
    expect(result.foyerState).toBe('purge-requested');
    expect(result.reason).toContain('version 2 est encore lisible');
  });

  it('renumérotation : le contenu visé a bougé ailleurs → encore lisible, raison exacte', async () => {
    // La version 2 a été purgée, mais le contenu est renuméroté en version 1.
    const reader = readerWith({ 1: 'le corps visé', 2: 'autre contenu' }, [1, 2]);
    const result = await verifyPurge('page-1', [2], reader, {
      expectedFingerprints: { 2: 'fp:le corps visé' },
      fingerprint: FP,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('encore lisible en version 1');
  });

  it('renumérotation résolue : le contenu visé n’est plus lisible nulle part → purgé', async () => {
    const reader = readerWith({ 1: 'autre contenu' }, [1]);
    const result = await verifyPurge('page-1', [2], reader, {
      expectedFingerprints: { 2: 'fp:le corps visé' },
      fingerprint: FP,
    });
    expect(result.verified).toBe(true);
    expect(result.foyerState).toBe('purged');
  });

  it('lecture impossible (droits manquants) : pas un « purgé », le foyer reste ouvert', async () => {
    const reader: VersionReader = {
      async readVersion() {
        return { kind: 'unreadable', status: 401, reason: 'identité de l’app non autorisée sur l’historique (HTTP 401)' };
      },
      async listVersionNumbers() {
        return [2];
      },
    };
    const result = await verifyPurge('page-1', [2], reader);
    expect(result.verified).toBe(false);
    expect(result.foyerState).toBe('purge-requested');
    expect(result.reason).toContain('vérification impossible');
    expect(result.reason).toContain('HTTP 401');
  });
});