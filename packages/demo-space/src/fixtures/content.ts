/**
 * Contenus Confluence de l'espace de démonstration, par gîte (§6, §15).
 *
 * Les fonctions renvoient du **storage XML** pour les corps de page, modèles et
 * versions, du texte brut pour les commentaires et les titres, et un couple
 * `{ filename, mimeType, content }` pour les pièces jointes. Aucune valeur
 * n'est écrite ici : chaque contenu est bâti à partir d'une `SecretFixture`
 * (valeurs générées à l'exécution).
 */

import { FAMILY_LABELS } from '@placard-wiki/domain';

import { MARQUE_SYNTHETIQUE, type SecretFixture } from './index';

/** Échappe le minimum vital du XML storage (aucun secret n'est mutilé). */
export function echapperXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Identifiant (colonne « identifiant ») stable et lisible pour une fixture. */
export function identifiantDe(fixture: SecretFixture): string {
  const en = FAMILY_LABELS[fixture.family].en;
  return `svc-${fixture.number}-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Titre du gîte « titres-et-etiquettes » : « accès staging (mdp: …) ». */
export function titreSecret(fixture: SecretFixture): string {
  return `accès staging (mdp: ${fixture.value}) [${MARQUE_SYNTHETIQUE}]`;
}

/** Commentaire du gîte « commentaires » : « le mot de passe est … ». */
export function commentaireSecret(fixture: SecretFixture): string {
  return `Le mot de passe est ${fixture.value} (${MARQUE_SYNTHETIQUE}).`;
}

/** Une pièce jointe factice : `.env` ou `.pem`, selon la famille. */
export interface Attachement {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
}

/** Pièce jointe d'une fixture : le secret vit dans le contenu ou le nom. */
export function attachementDe(fixture: SecretFixture): Attachement {
  if (fixture.family === 'private-key') {
    return { filename: `cle-privee-${fixture.number}.pem`, mimeType: 'application/x-pem-file', content: fixture.value };
  }
  if (fixture.family === 'risky-file') {
    return { filename: fixture.value, mimeType: 'text/plain', content: `export SECRET_DEMO=factice\n# ${MARQUE_SYNTHETIQUE}` };
  }
  return { filename: `secret-${fixture.number}.env`, mimeType: 'text/plain', content: `SECRET_DEMO=${fixture.value}\n` };
}

/** Corps de page du gîte « corps-de-page » : tableau d'identifiants en XML storage. */
export function corpsDePageXml(fixtures: readonly SecretFixture[]): string {
  const titre = `<h2>Tableau d'identifiants — ${MARQUE_SYNTHETIQUE}</h2>`;
  const entete = '<tr><th><p>Identifiant</p></th><th><p>Mot de passe</p></th></tr>';
  const lignes = fixtures
    .map((f) => `<tr><td><p>${echapperXml(identifiantDe(f))}</p></td><td><p>${echapperXml(f.value)}</p></td></tr>`)
    .join('');
  return `${titre}<table><tbody>${entete}${lignes}</tbody></table>`;
}

/** Description d'espace : toutes les valeurs réunies (gîte le plus lu). */
export function espaceDescriptionXml(fixtures: readonly SecretFixture[]): string {
  const lignes = fixtures
    .map((f) => `<li><strong>${f.number}</strong> — ${echapperXml(f.value)}</li>`)
    .join('');
  return `<p>${MARQUE_SYNTHETIQUE}</p><ul>${lignes}</ul>`;
}

/** Version 1 de l'historique : les secrets en clair. */
export function historiqueV1Xml(fixtures: readonly SecretFixture[]): string {
  return `<h2>Accès — version corrigée bientôt</h2><ul>${fixtures
    .map((f) => `<li>${echapperXml(f.value)}</li>`)
    .join('')}</ul>`;
}

/** Version 2 de l'historique : « corrigée » — la v1 reste lisible (§6). */
export function historiqueV2Xml(): string {
  return `<p>Mots de passe retirés de cette version (${MARQUE_SYNTHETIQUE}).`;
}

/** Modèle de page : un runbook modèle qui recopie les identifiants. */
export function modelePageXml(fixtures: readonly SecretFixture[]): string {
  return `<h2>Runbook modèle</h2>${corpsDePageXml(fixtures)}<p>Recopiez-moi (${MARQUE_SYNTHETIQUE}).</p>`;
}

/** Page « anyone with the link » : recopie du tableau (amplification, §6). */
export function pagePartageeXml(fixtures: readonly SecretFixture[]): string {
  return `<p>Partage public simulé — ${MARQUE_SYNTHETIQUE}</p>${corpsDePageXml(fixtures)}`;
}