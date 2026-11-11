/**
 * Recette §25.1 à §25.3 + cas limites §24 : regroupement empreinte → foyer.
 */

import { describe, expect, it } from 'vitest';

import { aperçuDe, fausseCleAws, empreinteDe, makeDetection, makePage } from './fixtures.js';
import { groupIntoFoyers, foyerIdOf } from './group.js';

describe('groupIntoFoyers — une empreinte, plusieurs emplacements (§11)', () => {
  it('§25.1 : une clé AWS factice ouvre un foyer « clé cloud » avec empreinte et aperçu masqué', () => {
    const cle = fausseCleAws('recette-25-1');
    const foyers = groupIntoFoyers([
      makeDetection({
        fingerprint: empreinteDe(cle),
        pageId: 'p-runbook',
        maskedPreview: aperçuDe(cle),
        detectedAt: '2026-11-05T09:00:00.000Z',
      }),
    ]);

    expect(foyers).toHaveLength(1);
    const foyer = foyers[0]!;
    expect(foyer.family).toBe('cloud-key');
    expect(foyer.state).toBe('open');
    expect(foyer.fingerprint).toBe(empreinteDe(cle));
    expect(foyer.locations).toHaveLength(1);
    expect(foyer.locations[0]!.gite).toBe('corps-de-page');
    expect(foyer.locations[0]!.status).toBe('present');
    expect(foyer.scoreTerms.length).toBeGreaterThan(0); // §8 : aucun score sans ses termes
    // §5 : aucune valeur brute dans le foyer sérialisé.
    expect(JSON.stringify(foyer)).not.toContain(cle);
    expect(JSON.stringify(foyer)).toContain(foyer.locations[0]!.maskedPreview.slice(0, 4));
  });

  it('§25.2 : la même clé dans un commentaire crée un second emplacement du MÊME foyer', () => {
    const cle = fausseCleAws('recette-25-2');
    const empreinte = empreinteDe(cle);
    const foyers = groupIntoFoyers([
      makeDetection({ fingerprint: empreinte, pageId: 'p-runbook' }),
      makeDetection({
        fingerprint: empreinte,
        pageId: 'p-runbook',
        containerType: 'comment',
        containerAri: 'ari:cloud:confluence:::comment/42',
        field: 'text',
        detectedAt: '2026-11-06T14:30:00.000Z',
      }),
    ]);

    expect(foyers).toHaveLength(1); // un foyer, pas deux trouvailles
    expect(foyers[0]!.locations).toHaveLength(2);
    expect(foyers[0]!.locations.map((l) => l.foyerId)).toEqual([
      foyerIdOf(empreinte),
      foyerIdOf(empreinte),
    ]);
    expect(foyers[0]!.locations.some((l) => l.gite === 'commentaires')).toBe(true);
    expect(foyers[0]!.firstSeenAt).toBe('2026-11-05T09:00:00.000Z');
    expect(foyers[0]!.lastSeenAt).toBe('2026-11-06T14:30:00.000Z');
  });

  it('§25.3 : retirée du courant, la clé laisse un emplacement « historique, version 3 »', () => {
    const cle = fausseCleAws('recette-25-3');
    const empreinte = empreinteDe(cle);
    // Le balayage ne voit plus la clé dans la version courante, seulement en v3.
    const foyers = groupIntoFoyers([
      makeDetection({
        fingerprint: empreinte,
        pageId: 'p-runbook',
        containerType: 'version',
        containerAri: 'ari:cloud:confluence:::page/p-runbook/version/3',
        versionNumber: 3,
        detectedAt: '2026-11-07T08:00:00.000Z',
      }),
    ]);

    expect(foyers).toHaveLength(1);
    const loc = foyers[0]!.locations[0]!;
    expect(loc.gite).toBe('historique-de-versions');
    expect(loc.versionNumber).toBe(3);
    expect(loc.status).toBe('present'); // encore lisible : le foyer reste ouvert
    expect(foyers[0]!.state).toBe('open');
    expect(foyers[0]!.score).toBe(foyers[0]!.baseScore); // exposition reste élevée
  });

  it('§24 : page supprimée après détection → emplacements « disparus »', () => {
    const cle = fausseCleAws('recette-24-supprimee');
    const foyers = groupIntoFoyers(
      [makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-morte' })],
      [],
      [makePage({ pageId: 'p-morte', deleted: true })],
    );

    expect(foyers[0]!.locations[0]!.status).toBe('vanished');
    expect(foyers[0]!.state).toBe('open'); // la corbeille est un résidu déclaré
  });

  it('dédup : la même détection vue deux fois ne fait qu'un emplacement', () => {
    const cle = fausseCleAws('recette-dedup');
    const base = makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-runbook' });
    const foyers = groupIntoFoyers([base, { ...base }]);
    expect(foyers[0]!.locations).toHaveLength(1);
  });

  it('fusion : un foyer existant garde son état et ses dates', () => {
    const cle = fausseCleAws('recette-fusion');
    const empreinte = empreinteDe(cle);
    const [existant] = groupIntoFoyers([
      makeDetection({
        fingerprint: empreinte,
        pageId: 'p-runbook',
        detectedAt: '2026-03-02T10:00:00.000Z',
      }),
    ]);
    const tourné = {
      ...existant!,
      state: 'rotation-attested' as const,
      rotatedAt: '2026-04-01T10:00:00.000Z',
      rotationEvidenceRef: 'SEC-417',
    };
    const foyers = groupIntoFoyers(
      [
        makeDetection({
          fingerprint: empreinte,
          pageId: 'p-autre',
          containerAri: 'ari:cloud:confluence:::page/p-autre',
          detectedAt: '2026-05-04T10:00:00.000Z',
        }),
      ],
      [tourné],
    );

    expect(foyers).toHaveLength(1);
    expect(foyers[0]!.id).toBe(existant!.id);
    expect(foyers[0]!.state).toBe('rotation-attested'); // état de réparation préservé
    expect(foyers[0]!.firstSeenAt).toBe('2026-03-02T10:00:00.000Z');
    expect(foyers[0]!.lastSeenAt).toBe('2026-05-04T10:00:00.000Z');
    expect(foyers[0]!.locations).toHaveLength(2);
    expect(foyers[0]!.rotatedAt).toBe('2026-04-01T10:00:00.000Z');
  });

  it('identifiant de foyer stable : dérivé de l’empreinte, jamais de la valeur', () => {
    const cle = fausseCleAws('recette-id-stable');
    const f1 = groupIntoFoyers([makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-a' })]);
    const f2 = groupIntoFoyers([makeDetection({ fingerprint: empreinteDe(cle), pageId: 'p-b' })]);
    expect(f1[0]!.id).toBe(f2[0]!.id);
    expect(f1[0]!.id).toBe(foyerIdOf(empreinteDe(cle)));
    expect(JSON.stringify(f1[0]!.id)).not.toContain(cle);
  });
});
