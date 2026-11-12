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

/**
 * Limite d'un titre de page Confluence Cloud, mesurée sur le site réel :
 * au-delà, `POST /content` répond HTTP 400 « Title cannot be longer than
 * 255 characters. » (c'est ce qui faisait échouer la famille 3, dont la
 * valeur est un bloc PEM de six lignes).
 */
export const TITRE_MAX_CARACTERES = 255;

/** Ramène une valeur à une seule ligne (Confluence aplatit les sauts de ligne d'un titre). */
export function surUneLigne(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Borner une valeur à `budget` caractères en gardant la **tête et la queue** :
 * les marqueurs `-----BEGIN … PRIVATE KEY-----` et `-----END …-----` survivent,
 * donc un bloc PEM tronqué reste détectable par la famille `private-key`
 * (motif « une seule ligne » des détecteurs). Le milieu est remplacé par « … ».
 */
export function bornerPourTitre(value: string, budget: number): string {
  const ligne = surUneLigne(value);
  if (ligne.length <= budget) return ligne;
  const tete = Math.ceil((budget - 1) * 0.6);
  const queue = Math.max(0, budget - 1 - tete);
  return `${ligne.slice(0, tete)}…${ligne.slice(ligne.length - queue)}`;
}

/** Identifiant (colonne « identifiant ») stable et lisible pour une fixture. */
export function identifiantDe(fixture: SecretFixture): string {
  const en = FAMILY_LABELS[fixture.family].en;
  return `svc-${fixture.number}-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Gabarit du titre : la place laissée à la valeur est ce qui reste une fois le texte fixe posé. */
function gabaritTitre(valeur: string): string {
  return `accès staging (mdp: ${valeur}) [${MARQUE_SYNTHETIQUE}]`;
}

/**
 * Titre du gîte « titres-et-etiquettes » : « accès staging (mdp: …) ».
 * La valeur est mise sur une ligne et bornée pour tenir dans les 255
 * caractères imposés par Confluence (sinon HTTP 400 — famille 3, bloc PEM).
 */
export function titreSecret(fixture: SecretFixture): string {
  const budget = TITRE_MAX_CARACTERES - gabaritTitre('').length;
  return gabaritTitre(bornerPourTitre(fixture.value, budget));
}

/** Commentaire du gîte « commentaires » : « le mot de passe est … ». */
export function commentaireSecret(fixture: SecretFixture): string {
  return `Le mot de passe est ${fixture.value} (${MARQUE_SYNTHETIQUE}).`;
}

/**
 * Le même commentaire en storage XML. Le paragraphe est obligatoire (un `&`
 * nu est refusé : HTTP 400) et la valeur est échappée — la famille 11 porte
 * un `&` dans sa valeur factice.
 */
export function commentaireXml(fixture: SecretFixture): string {
  return `<p>${echapperXml(commentaireSecret(fixture))}</p>`;
}

/** Entités nommées que Confluence renvoie dans le storage qu'il réécrit. */
const ENTITES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  Eacute: 'É', eacute: 'é', agrave: 'à', ccedil: 'ç', ucirc: 'û',
  mdash: '—', ndash: '–', hellip: '…', egrave: 'è', ecirc: 'ê',
};

/** Décode les entités HTML numériques et les entités nommées courantes. */
export function decoderEntites(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (motif, entite: string) => {
    if (entite.startsWith('#x')) return String.fromCodePoint(parseInt(entite.slice(2), 16));
    if (entite.startsWith('#')) return String.fromCodePoint(parseInt(entite.slice(1), 10));
    return ENTITES[entite] ?? motif;
  });
}

/**
 * Texte nu d'un storage XML : balises retirées, entités décodées, espaces
 * aplatis. Sert à la déduplication des commentaires — Confluence **réécrit**
 * le corps envoyé (`É` → `&Eacute;`, `—` → `&mdash;`), une comparaison brute
 * ne retrouverait jamais le commentaire déjà posé et le duplicerait.
 */
export function texteNu(storageXml: string): string {
  return decoderEntites(storageXml.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
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

/**
 * Description d'espace, en **texte brut**. L'API Confluence Cloud n'accepte
 * qu'une description d'espace en représentation `plain` (vérifié sur le site :
 * `description.view` → HTTP 400 « For now, only a space description with PLAIN
 * representation is valid »). Aucune balise : une ligne par valeur.
 */
export function espaceDescriptionTexte(fixtures: readonly SecretFixture[]): string {
  const lignes = fixtures.map((f) => `${f.number} — ${f.value}`);
  return [MARQUE_SYNTHETIQUE, ...lignes].join('\n');
}

/** Version 1 de l'historique : les secrets en clair. */
export function historiqueV1Xml(fixtures: readonly SecretFixture[]): string {
  return `<h2>Accès — version corrigée bientôt</h2><ul>${fixtures
    .map((f) => `<li>${echapperXml(f.value)}</li>`)
    .join('')}</ul>`;
}

/** Version 2 de l'historique : « corrigée » — la v1 reste lisible (§6). */
export function historiqueV2Xml(): string {
  return `<p>Mots de passe retirés de cette version (${MARQUE_SYNTHETIQUE}).</p>`;
}

/** Modèle de page : un runbook modèle qui recopie les identifiants. */
export function modelePageXml(fixtures: readonly SecretFixture[]): string {
  return `<h2>Runbook modèle</h2>${corpsDePageXml(fixtures)}<p>Recopiez-moi (${MARQUE_SYNTHETIQUE}).</p>`;
}

/** Page « anyone with the link » : recopie du tableau (amplification, §6). */
export function pagePartageeXml(fixtures: readonly SecretFixture[]): string {
  return `<p>Partage public simulé — ${MARQUE_SYNTHETIQUE}</p>${corpsDePageXml(fixtures)}`;
}