/**
 * Fixtures de l'espace de démonstration (§15, §27.1) : un faux secret de
 * chaque famille (douze numéros via `FAMILY_LABELS`) dans chacun des sept
 * gîtes. Les valeurs sont générées à l'exécution par `@placard/core`
 * (`fake-values`) — jamais un littéral au format d'un secret réel (PLA-N-09).
 *
 * Le couple `{ containerType, field }` définit le gîte (`giteOf`, §6) ; le
 * seed et l'oracle lisent la même source, donc le nombre planté est exactement
 * le nombre déclaré.
 */

import {
  fakeCardNumber,
  fakeIban,
  fakeValue,
  prng,
} from '@placard/core';
import {
  FAMILY_LABELS,
  GITES,
  giteOf,
  type ContainerType,
  type ContentField,
  type FamilyNumber,
  type Gite,
  type WikiFamily,
} from '@placard-wiki/domain';

/** Marque portée par tout le contenu semé : aucun secret réel, tout est factice. */
export const MARQUE_SYNTHETIQUE = 'SYNTHÉTIQUE — démo Placard';

/** Un secret factice planté dans un gîte précis de l'espace de démonstration. */
export interface SecretFixture {
  /** Numéro de famille du cahier (1 à 12). */
  readonly number: FamilyNumber;
  readonly family: WikiFamily;
  readonly gite: Gite;
  readonly containerType: ContainerType;
  readonly field: ContentField;
  /** La valeur factice — construite à l'exécution, jamais écrite en clair ici. */
  readonly value: string;
  /** Graine déterministe : la même graine produit la même valeur. */
  readonly seed: string;
}

/** Conteneur/​champ de chaque gîte (le corps d'une page, un commentaire…). */
const CONTENEUR_PAR_GITE: Readonly<Record<Gite, { containerType: ContainerType; field: ContentField }>> = {
  'corps-de-page': { containerType: 'page', field: 'body' },
  commentaires: { containerType: 'comment', field: 'text' },
  'pieces-jointes': { containerType: 'attachment', field: 'text' },
  'historique-de-versions': { containerType: 'version', field: 'body' },
  'modeles-de-page': { containerType: 'template', field: 'body' },
  'titres-et-etiquettes': { containerType: 'page', field: 'title' },
  'description-espace': { containerType: 'space-desc', field: 'description' },
};

/** Les sept gîtes, dans l'ordre du vocabulaire (§6). */
const GITES_ORDRE: readonly Gite[] = GITES.map((entree) => entree.gite);

/**
 * Numéro de famille → famille. Dérivé de `FAMILY_LABELS` (source unique) :
 * `bank-data` porte deux numéros (IBAN 6, carte 7) — les seuls à se chevaucher.
 */
function familleDesNumeros(): ReadonlyMap<FamilyNumber, WikiFamily> {
  const map = new Map<FamilyNumber, WikiFamily>();
  for (const [family, meta] of Object.entries(FAMILY_LABELS)) {
    for (const number of meta.numbers) map.set(number, family as WikiFamily);
  }
  return map;
}

/** Chaîne de connexion factice (famille 10) : mot de passe généré à l'exécution. */
function chaineConnexionFactice(seed: string): string {
  const motDePasse = fakeValue('plaintext-password', seed, 0);
  return `postgres://svc-demo:${motDePasse}@db.demo.internal:5432/placard`;
}

/**
 * Valeur factice d'une famille. `connection-string` et `credential-table` sont
 * propres au wiki (hors `FindingFamily`) : construites ici. `bank-data` choisit
 * l'IBAN pour le numéro 6 et la carte pour le numéro 7.
 */
function valeurFactice(family: WikiFamily, number: FamilyNumber, seed: string): string {
  if (family === 'connection-string') return chaineConnexionFactice(seed);
  if (family === 'credential-table') return fakeValue('plaintext-password', seed, 0);
  if (family === 'bank-data') {
    return number === 6 ? fakeIban(prng(seed)) : fakeCardNumber(prng(seed));
  }
  return fakeValue(family, seed, 0);
}

/** Conteneur/​champ d'un gîte ; l'attachement d'une famille 12 porte un nom de fichier. */
function conteneurDe(gite: Gite, family: WikiFamily): { containerType: ContainerType; field: ContentField } {
  if (gite === 'pieces-jointes' && family === 'risky-file') {
    return { containerType: 'attachment', field: 'filename' };
  }
  return CONTENEUR_PAR_GITE[gite];
}

/** Génère les 84 fixtures (12 numéros × 7 gîtes), déterministes. */
export function genererFixtures(): readonly SecretFixture[] {
  const fixtures: SecretFixture[] = [];
  for (const [number, family] of familleDesNumeros()) {
    for (const gite of GITES_ORDRE) {
      const seed = `demo-space:${family}:${number}:${gite}`;
      const container = conteneurDe(gite, family);
      fixtures.push({
        number,
        family,
        gite,
        containerType: container.containerType,
        field: container.field,
        value: valeurFactice(family, number, seed),
        seed,
      });
    }
  }
  return Object.freeze(fixtures);
}

/** Les fixtures de l'espace de démonstration, figées à l'import. */
export const SECRET_FIXTURES: readonly SecretFixture[] = genererFixtures();

/** Filtre les fixtures d'un gîte donné, pour bâtir un conteneur. */
export function fixturesDuGite(gite: Gite): readonly SecretFixture[] {
  return SECRET_FIXTURES.filter((fixture) => fixture.gite === gite);
}

/** Vérifie qu'une fixture annonce bien son gîte via `giteOf` (cohérence §6). */
export function giteCoherent(fixture: SecretFixture): boolean {
  return giteOf(fixture.containerType, fixture.field) === fixture.gite;
}