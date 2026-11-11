/**
 * Le ticket Jira de réparation (§9, PW-13) : créé à l'étape 1, assigné au
 * **propriétaire résolu** (§12 — la cascade et sa méthode viennent du lot
 * « owner », ce paquet ne fait que consommer `OwnerResolution`).
 *
 * Règle absolue (§5) : le ticket ne transporte **aucune valeur brute** — ni
 * dans le résumé, ni dans la description, ni dans les étiquettes. Seuls
 * circulent l'empreinte HMAC, l'aperçu masqué, les scores avec leurs termes
 * et les localisations (page, gîte). Le texte externe est une donnée, jamais
 * une instruction (§31) : rien ici n'interprète un contenu de page.
 */

import type { Foyer, OwnerResolution } from '@placard-wiki/domain';
import { FAMILY_LABELS } from '@placard-wiki/domain';

/** Charge utile de création de ticket — prête pour le port Jira du résolveur. */
export interface JiraTicketPayload {
  projectKey: string;
  summary: string;
  description: string;
  /** Référence du propriétaire résolu ; absente si personne en vue (file d'adoption). */
  assignee?: string;
  labels: string[];
  /** Méthode de résolution du propriétaire, affichée (§12 : jamais de classement). */
  ownerMethod?: string;
  issueType: 'Task';
  priority: 'High' | 'Highest';
}

function locationsBlock(foyer: Foyer): string[] {
  return foyer.locations.map((location) => {
    const version = location.versionNumber !== undefined ? `, version ${String(location.versionNumber)}` : '';
    return `- ${location.gite} : page ${location.pageId}${version} (${location.containerType}, ${location.status})`;
  });
}

function scoreBlock(foyer: Foyer): string[] {
  return foyer.scoreTerms.map(
    (term) => `- ${term.label} : ${term.points > 0 ? '+' : ''}${String(term.points)} (${term.method})`,
  );
}

/**
 * Construit la charge du ticket. `owner` peut être `undefined` ou de
 * confiance `none` : le ticket part alors **non assigné**, avec la file
 * d'adoption mentionnée — on n'invente jamais un propriétaire (§12).
 */
export function jiraTicketPayload(
  foyer: Foyer,
  owner: OwnerResolution | undefined,
  projectKey: string,
): JiraTicketPayload {
  const family = FAMILY_LABELS[foyer.family];
  const labels = family?.numbers.map((n) => `placard-famille-${String(n)}`) ?? [];
  const summary = `Rotation à attester — ${family?.fr ?? foyer.family} (${foyerMaskedPreview(foyer)})`;
  const description = [
    'Placard du wiki a regroupé une empreinte en un foyer (§11). Aucune valeur brute ne figure dans ce ticket.',
    '',
    `- Foyer : ${foyer.id}`,
    `- Empreinte (HMAC-SHA-256, clé d'installation) : ${foyer.fingerprint}`,
    `- Aperçu masqué : ${foyerMaskedPreview(foyer)}`,
    `- Famille : ${family?.fr ?? foyer.family}`,
    `- Danger : ${String(foyer.score)}/100, termes appliqués :`,
    ...scoreBlock(foyer),
    '',
    'Emplacements :',
    ...locationsBlock(foyer),
    '',
    'Rituel (§9) : tourner (ce ticket) → caviarder (verrouillé tant que la rotation',
    "n'est pas attestée par une personne) → purger l'historique → empêcher → vérifier.",
  ].join('\n');
  const payload: JiraTicketPayload = {
    projectKey,
    summary,
    description,
    labels: ['placard-wiki', ...labels],
    issueType: 'Task',
    priority: foyer.score >= 70 ? 'Highest' : 'High',
  };
  if (owner !== undefined && owner.ownerRef !== undefined && owner.confidence !== 'none') {
    payload.assignee = owner.ownerRef;
    payload.ownerMethod = owner.method;
  } else {
    payload.description += '\n\nPropriétaire : personne en vue — page proposée à la file d’adoption (§12).';
  }
  return payload;
}

/** L'aperçu masqué du foyer : celui de son premier emplacement (jamais la valeur). */
export function foyerMaskedPreview(foyer: Foyer): string {
  return foyer.locations[0]?.maskedPreview ?? '[aperçu indisponible]';
}
