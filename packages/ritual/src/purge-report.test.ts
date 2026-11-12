import { describe, expect, it } from 'vitest';

import {
  REFUSAL_WITHOUT_MOTIVE,
  decidePurgeRequest,
  purgeRequestLines,
  purgeRequestsCsv,
} from './purge-report';
import type { PurgeRequestLine } from './purge-report';
import { makeFoyer } from './test-support';

/** Une demande de test — empreinte HMAC factice, jamais une valeur. */
function request(overrides: Partial<import('@placard-wiki/domain').PurgeRequest> = {}) {
  return {
    id: 'purge-1',
    foyerId: 'foyer-1',
    pageId: 'page-1',
    versionNumbers: [2],
    requestedAt: '2026-11-12T10:00:00.000Z',
    requestedByRef: 'ari:identity::alice',
    state: 'requested',
    blockedReason: 'HTTP 401 sur l’historique',
    ...overrides,
  } as import('@placard-wiki/domain').PurgeRequest;
}

describe('decidePurgeRequest — l’état suit l’administrateur', () => {
  it('reconnaissance : requested → acknowledged', () => {
    const result = decidePurgeRequest(request(), 'acknowledged', { adminRef: 'REF-1' });
    expect(result.ok).toBe(true);
    expect(result.request!.state).toBe('acknowledged');
    expect(result.request!.adminRef).toBe('REF-1');
  });

  it('refus avec motif : requested → refused, motif porté', () => {
    const result = decidePurgeRequest(request(), 'refused', { motive: 'La page est archivée, purge inutile.' });
    expect(result.ok).toBe(true);
    expect(result.request!.state).toBe('refused');
    expect(result.request!.adminRef).toBe('La page est archivée, purge inutile.');
  });

  it('refus sans motif : refusé — la raison écrite est obligatoire', () => {
    const result = decidePurgeRequest(request(), 'refused');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REFUSAL_WITHOUT_MOTIVE);
  });

  it('transition impossible : une demande faite (done) n’accepte plus de décision', () => {
    const result = decidePurgeRequest(request({ state: 'done' }), 'refused', { motive: 'x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('« done »');
  });
});

describe('purgeRequestsCsv — l’export exploitable, sans valeur brute', () => {
  const foyer = makeFoyer();
  const lines: PurgeRequestLine[] = purgeRequestLines([request()], new Map([[foyer.id, foyer]]));

  it('une ligne par page et par version, avec la bonne tête', () => {
    const csv = purgeRequestsCsv(lines);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('requete,foyer,famille,empreinte,page,version,raison,etat,demandee_le,reference_admin');
    expect(rows).toHaveLength(2);
    const cells = rows[1]!.split(',');
    expect(cells[0]).toBe('purge-1');
    expect(cells[3]).toBe(foyer.fingerprint);
    expect(cells[4]).toBe('page-1');
    expect(cells[5]).toBe('2');
    expect(cells[6]).toBe('HTTP 401 sur l’historique');
    expect(cells[7]).toBe('requested');
  });

  it('échappe les champs qui contiennent des virgules ou des guillemets', () => {
    const tricky: PurgeRequestLine[] = [
      {
        requestId: 'purge-2', foyerId: 'foyer-1', family: 'cloud-key',
        fingerprint: 'hmac256:abcdef', pageId: 'page-2', versionNumber: 3,
        reason: 'Un motif, avec une virgule et un "guillemet".', state: 'requested',
        requestedAt: '2026-11-12T10:00:00.000Z',
      },
    ];
    const csv = purgeRequestsCsv(tricky);
    expect(csv).toContain('"Un motif, avec une virgule et un ""guillemet""."');
  });

  it('ne contient jamais de valeur brute : que des empreintes HMAC', () => {
    const csv = purgeRequestsCsv(lines);
    expect(csv).not.toMatch(/AKIA|sk-[A-Za-z0-9]/);
  });
});