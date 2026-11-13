/**
 * La file de balayage — le contrat, sans réseau.
 *
 * Ce que ces tests verrouillent :
 *   1. la clé de la file et la forme du corps sont celles que le manifeste
 *      déclare (module `consumer`, queue `pw-sweep-queue`) ;
 *   2. un refus de la plateforme est **décrit** (statut + message) et jamais
 *      avalé : c'était le trou mesuré le 13 novembre 2026.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('@forge/events', () => ({
  Queue: class {
    constructor(readonly params: { key: string }) {}
    push(event: unknown): Promise<{ jobId: string }> {
      return pushMock(this.params, event);
    }
  },
}));

const { SWEEP_QUEUE, describeQueueError, pushSweepEvent } = await import('./queue.js');

beforeEach(() => {
  pushMock.mockReset();
});

describe('file de balayage — ce qui est poussé', () => {
  it('la clé est celle du module consumer du manifeste', async () => {
    pushMock.mockResolvedValue({ jobId: 'job-1' });
    const resultat = await pushSweepEvent({ mode: 'incremental', scope: 'site', cursor: 'curseur-1' });
    expect(resultat).toEqual({ ok: true });
    expect(pushMock).toHaveBeenCalledWith(
      { key: SWEEP_QUEUE },
      { body: { mode: 'incremental', scope: 'site', cursor: 'curseur-1' } },
    );
  });

  it('sans curseur, le corps n’en porte pas', async () => {
    pushMock.mockResolvedValue({ jobId: 'job-2' });
    await pushSweepEvent({ mode: 'full', scope: 'PLACARDDEMO' });
    expect(pushMock.mock.calls[0]?.[1]).toEqual({ body: { mode: 'full', scope: 'PLACARDDEMO' } });
  });
});

describe('file de balayage — un refus est décrit, jamais avalé', () => {
  it('un refus 400 remonte son statut et son message', async () => {
    const erreur = Object.assign(new Error('Bad Request'), { status: 400 });
    pushMock.mockRejectedValue(erreur);
    const resultat = await pushSweepEvent({ mode: 'incremental', scope: 'site' });
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.reason).toContain('statut 400');
    expect(resultat.ok === false && resultat.reason).toContain('Bad Request');
  });

  it('une erreur sans statut reste lisible', () => {
    expect(describeQueueError(new Error('boum'))).toContain('statut inconnu');
    expect(describeQueueError('chaine')).toContain('erreur inconnue');
  });

  it('le statut est lu quelle que soit sa forme (status, statusCode, response)', () => {
    expect(describeQueueError(Object.assign(new Error('x'), { statusCode: 503 }))).toContain('statut 503');
    expect(describeQueueError(Object.assign(new Error('x'), { response: { status: 429 } }))).toContain('statut 429');
  });

  it('un statut porté par le message est lu quand même', () => {
    expect(describeQueueError(new Error('400 Bad Request'))).toContain('statut 400');
  });
});
