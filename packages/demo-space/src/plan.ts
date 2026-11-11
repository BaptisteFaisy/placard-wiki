/**
 * Plan de semis de l'espace de démonstration (§15). Construit à partir des
 * fixtures : une liste d'étapes REST déclaratives, sans exécution. Le seed
 * (CLI) résout les références entre étapes et applique le plan ; en mode
 * `--dry-run`, le plan est seulement imprimé (aucun réseau).
 *
 * Idempotence : chaque étape de création porte une clé stable (`id`) et un
 * `lookup` GET ; l'exécuteur crée l'entité seulement si le lookup ne la trouve
 * pas. Les étapes dépendantes (commentaire, pièce jointe, mise à jour)
 * référencent l'`id` de leur parent via `{{ID}}`, résolu à l'exécution.
 */

import {
  attachementDe,
  commentaireSecret,
  corpsDePageXml,
  espaceDescriptionXml,
  historiqueV1Xml,
  historiqueV2Xml,
  modelePageXml,
  pagePartageeXml,
  titreSecret,
} from './fixtures/content.js';
import { fixturesDuGite, type SecretFixture } from './fixtures/index.js';

/** Clé et nom de l'espace de démonstration (la clé Confluence est alphanumérique). */
export const SPACE_KEY = 'PLACARDDEMO';
export const SPACE_NAME = 'PLACARD-DEMO';
/** Préfixe REST par défaut (Confluence Cloud). Surchargeable par l'environnement. */
export const API_PREFIX_DEFAULT = '/wiki/rest/api';

/** Méthode HTTP d'une étape. */
export type RestMethod = 'GET' | 'POST' | 'PUT';

/** Nature d'une étape, pour l'exécuteur et le rendu `--dry-run`. */
export type StepKind =
  | 'space'
  | 'space-desc'
  | 'page'
  | 'update'
  | 'comment'
  | 'attachment'
  | 'template'
  | 'share';

/** Une étape REST du plan. `body` peut décrire un multipart (pièce jointe). */
export interface SeedStep {
  readonly id: string;
  readonly kind: StepKind;
  readonly method: RestMethod;
  /** Chemin relatif au préfixe REST ; peut contenir des références `{{ID}}`. */
  readonly path: string;
  readonly body?: unknown;
  /** Requête GET de pré-vérification (idempotence) ; absent = toujours exécutée. */
  readonly lookup?: string;
  /** Note d'honnêteté : limite connue, étape impossible, etc. */
  readonly note?: string;
}

/** Le plan complet. */
export interface SeedPlan {
  readonly spaceKey: string;
  readonly spaceName: string;
  readonly steps: readonly SeedStep[];
}

/** Corps JSON d'une page Confluence en storage XML. */
function pageBody(title: string, xml: string): unknown {
  return {
    type: 'page',
    space: { key: SPACE_KEY },
    title,
    body: { storage: { value: xml, representation: 'storage' } },
  };
}

/** Étape « créer une page » avec lookup par titre (idempotent). */
function pageStep(id: string, title: string, xml: string, note?: string): SeedStep {
  return {
    id,
    kind: 'page',
    method: 'POST',
    path: '/content',
    lookup: `/content?spaceKey=${SPACE_KEY}&title=${encodeURIComponent(title)}&expand=version`,
    body: pageBody(title, xml),
    ...(note === undefined ? {} : { note }),
  };
}

/** L'espace de démonstration et sa description (gîte « description-espace »). */
function espaceSteps(): SeedStep[] {
  const desc = espaceDescriptionXml(fixturesDuGite('description-espace'));
  const description = { view: { value: desc, representation: 'view' } };
  return [
    {
      id: 'space:create',
      kind: 'space',
      method: 'POST',
      path: '/space',
      lookup: `/space/${SPACE_KEY}`,
      body: { key: SPACE_KEY, name: SPACE_NAME, description },
      note: 'création d’espace souvent réservée aux admins — échec documenté',
    },
    {
      id: 'space-desc:update',
      kind: 'space-desc',
      method: 'PUT',
      path: `/space/${SPACE_KEY}`,
      body: { key: SPACE_KEY, name: SPACE_NAME, description },
    },
  ];
}

/** Commentaires : un par famille, « le mot de passe est … », sur la page corps. */
function commentaireSteps(parent: string): SeedStep[] {
  return fixturesDuGite('commentaires').map((fixture) => ({
    id: `comment:${fixture.number}`,
    kind: 'comment' as const,
    method: 'POST' as const,
    path: `/content/{{${parent}}}/child/comment`,
    lookup: `/content/{{${parent}}}/child/comment?expand=body.storage`,
    body: {
      type: 'comment',
      container: { id: `{{${parent}}}` },
      body: { storage: { value: commentaireSecret(fixture), representation: 'storage' } },
    },
    note: 'déduplication par corps (pas d’identifiant stable via REST)',
  }));
}

/** Pièces jointes : `.env`/`.pem` factices, un par famille, sur la page corps. */
function attachementSteps(parent: string): SeedStep[] {
  return fixturesDuGite('pieces-jointes').map((fixture) => {
    const att = attachementDe(fixture);
    return {
      id: `attachment:${fixture.number}`,
      kind: 'attachment' as const,
      method: 'POST' as const,
      path: `/content/{{${parent}}}/child/attachment`,
      lookup: `/content/{{${parent}}}/child/attachment`,
      body: { _multipart: true, filename: att.filename, mimeType: att.mimeType, content: att.content },
    };
  });
}

/** Historique : créer la v1 (secrets) puis mettre à jour en v2 (« corrigée »). */
function historiqueSteps(): SeedStep[] {
  const titre = 'Historique — accès corrigé (SYNTHÉTIQUE)';
  const create = pageStep('page:histo', titre, historiqueV1Xml(fixturesDuGite('historique-de-versions')));
  const update: SeedStep = {
    id: 'update:histo',
    kind: 'update',
    method: 'PUT',
    path: '/content/{{page:histo}}',
    body: {
      id: '{{page:histo}}',
      type: 'page',
      title: titre,
      version: { number: 2, message: 'corrigé — la v1 reste lisible (démo)' },
      body: { storage: { value: historiqueV2Xml(), representation: 'storage' } },
    },
    note: 'la version 1 reste lisible : c’est le point aveugle (§6)',
  };
  return [create, update];
}

/** Modèle de page : runbook modèle qui recopie les identifiants. */
function templateStep(): SeedStep {
  return {
    id: 'template:modele',
    kind: 'template',
    method: 'POST',
    path: '/template',
    lookup: `/template?spaceKey=${SPACE_KEY}`,
    body: {
      spaceKey: SPACE_KEY,
      name: 'Runbook modèle (SYNTHÉTIQUE)',
      templateType: 'page',
      body: { storage: { value: modelePageXml(fixturesDuGite('modeles-de-page')), representation: 'storage' } },
    },
    note: 'création de modèle non garantie sur Cloud — échec documenté',
  };
}

/** Titres : une page par famille, « accès staging (mdp: …) ». */
function titreSteps(): SeedStep[] {
  return fixturesDuGite('titres-et-etiquettes').map((fixture) =>
    pageStep(
      `page:titre-${fixture.number}`,
      titreSecret(fixture),
      `<p>Voir l’espace de démonstration (${fixture.family}).</p>`,
    ),
  );
}

/** Page « anyone with the link » : recopie du tableau + tentative de partage. */
function partageSteps(): SeedStep[] {
  const page = pageStep('page:partagee', 'Page partagée — anyone with the link (SYNTHÉTIQUE)',
    pagePartageeXml(fixturesDuGite('corps-de-page')));
  const share: SeedStep = {
    id: 'share:anyone-with-link',
    kind: 'share',
    method: 'PUT',
    path: `/space/${SPACE_KEY}/property`,
    body: { key: 'public-links', value: 'anyone' },
    note: 'partage public « anyone with the link » impossible via REST standard — documenté',
  };
  return [page, share];
}

/** Assemble le plan complet, dans un ordre déterministe. */
export function buildSeedPlan(): SeedPlan {
  const corps = pageStep('page:corps', "Tableau d'identifiants — staging (SYNTHÉTIQUE)",
    corpsDePageXml(fixturesDuGite('corps-de-page')));
  const steps: SeedStep[] = [
    ...espaceSteps(),
    corps,
    ...commentaireSteps('page:corps'),
    ...attachementSteps('page:corps'),
    ...historiqueSteps(),
    templateStep(),
    ...titreSteps(),
    ...partageSteps(),
  ];
  return { spaceKey: SPACE_KEY, spaceName: SPACE_NAME, steps: Object.freeze(steps) };
}