/**
 * Le rituel wiki (§9) : tourner → caviarder → purger → empêcher → vérifier,
 * avec ses verrous. La séquence et son verrouillage (rotation avant purge)
 * viennent de @placard/ritual — jamais recopiés.
 *
 * Verrou central : l'étape 2 (caviarder) est bloquée tant que la rotation n'a
 * pas été **attestée par une personne** — jamais par l'app, jamais par un
 * agent. L'attestation est un fait horodaté avec lien vers la preuve.
 *
 * Squelette — le lot « ritual » implémente : attestation, diff de caviardage
 * (masqué), application asUser, demande de purge, ticket Jira, sceau de cire.
 */

export const PACKAGE_NAME = '@placard-wiki/ritual';
export const PACKAGE_STATUS = 'skeleton' as const;
