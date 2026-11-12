// Catalogue des 13 outils MCP du §17 — verbes et entrées recopiés du cahier
// des charges, dans l'ordre du module `rovo:mcp` du manifeste Forge. Aucune
// logique ici : la table declarative que l'écran « Playground MCP » affiche.

import type { Bilingual } from '../i18n.js';

/** Verbe HTTP de l'outil (§17 : les lectures sont des GET, appelables par Rovo). */
export type McpVerb = 'GET' | 'CREATE' | 'UPDATE';

/** Une entrée d'outil : nom, valeur de démonstration pré-remplie. */
export interface McpInput {
  name: string;
  demo: string;
  /** Options d'un select (fournisseurs de rotation…) ; sinon champ texte. */
  options?: readonly string[];
}

/** Spécification affichable d'un outil MCP. */
export interface McpToolSpec {
  key: string;
  verb: McpVerb;
  inputs: readonly McpInput[];
  returns: Bilingual;
  /** Comportement spécial à démontrer (refus agent, verrou, raison obligatoire). */
  note?: Bilingual;
}

const D = (en: string, fr: string): Bilingual => ({ en, fr });

/** Les huit fournisseurs du rituel (§9) — mêmes valeurs que ritual/attestation. */
const PROVIDERS = ['AWS', 'GitHub', 'Stripe', 'OpenAI', 'Slack', 'Google Workspace', 'internal-db', 'generic'];

/** Texte d'exemple pour `check-text` — valeur factice documentée par AWS. */
const SAMPLE_TEXT = 'Runbook deploiement : cle de prod AKIAIOSFODNN7EXAMPLE (exemple de documentation AWS).';

export const MCP_TOOLS: readonly McpToolSpec[] = [
  {
    key: 'scan-page',
    verb: 'GET',
    inputs: [{ name: 'pageId', demo: 'P-100' }],
    returns: D('Page foyers: family, fingerprint, masked preview, danger and its terms.', 'Foyers de la page : famille, empreinte, aperçu masqué, danger et ses termes.'),
  },
  {
    key: 'scan-space',
    verb: 'GET',
    inputs: [{ name: 'spaceKey', demo: 'DEMO' }, { name: 'limit', demo: '10' }],
    returns: D('Bounded sweep with progress state and resume cursor.', 'Balayage borné, état d’avancement et curseur de reprise.'),
  },
  {
    key: 'list-exposed-secrets',
    verb: 'GET',
    inputs: [
      { name: 'spaceKey', demo: '' },
      { name: 'minScore', demo: '50' },
      { name: 'state', demo: '' },
      { name: 'limit', demo: '5' },
    ],
    returns: D('Foyers sorted by danger.', 'Foyers triés par danger.'),
  },
  {
    key: 'get-finding',
    verb: 'GET',
    inputs: [{ name: 'findingId', demo: 'F-1' }],
    returns: D('Locations, ritual state, exposure, score terms.', 'Emplacements, état du rituel, exposition, termes du score.'),
  },
  {
    key: 'trace-fingerprint',
    verb: 'GET',
    inputs: [{ name: 'fingerprint', demo: '7f1a9c3e2b4d5f6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b' }],
    returns: D('Every location of this fingerprint on the site.', 'Tous les emplacements de cette empreinte sur le site.'),
  },
  {
    key: 'get-exposure',
    verb: 'GET',
    inputs: [{ name: 'pageId', demo: 'P-140' }],
    returns: D('Potential readers (range), sharing, restrictions, AI surface.', 'Lecteurs potentiels (fourchette), partage, restrictions, surface IA.'),
  },
  {
    key: 'get-certificate',
    verb: 'GET',
    inputs: [{ name: 'spaceKey', demo: 'DEMO' }, { name: 'site', demo: '' }],
    returns: D('Dated, hashed summary — figures and blind spots only.', 'Résumé daté et chiffré — chiffres et angles morts uniquement.'),
  },
  {
    key: 'check-text',
    verb: 'GET',
    inputs: [{ name: 'text', demo: SAMPLE_TEXT }],
    returns: D('Fingerprints detected in a text BEFORE publication. The text is neither stored nor logged.', 'Empreintes détectées dans un texte AVANT publication. Le texte n’est ni stocké ni journalisé.'),
    note: D('Real local computation on this site: light patterns + WebCrypto fingerprint (see the “Skill” tab for the documented gap).', 'Calcul local réel sur ce site : motifs légers + empreinte WebCrypto (voir l’onglet « Skill » pour l’écart documenté).'),
  },
  {
    key: 'record-rotation',
    verb: 'CREATE',
    inputs: [
      { name: 'findingId', demo: 'F-1' },
      { name: 'provider', demo: 'AWS', options: PROVIDERS },
      { name: 'evidenceRef', demo: 'JIRA SEC-417' },
    ],
    returns: D('Recorded attestation — humans only.', 'Attestation enregistrée (réservée aux personnes).'),
    note: D('Refuses an “agent” caller: the attestation is a timestamped fact placed by a person (§17).', 'Refuse un appel dont l’auteur est un agent : l’attestation est un fait horodaté posé par une personne (§17).'),
  },
  {
    key: 'request-redaction',
    verb: 'CREATE',
    inputs: [{ name: 'findingId', demo: 'F-1' }, { name: 'scope', demo: 'all' }],
    returns: D('Proposed masked diff — nothing applied.', 'Diff proposé (masqué), rien d’appliqué.'),
  },
  {
    key: 'apply-redaction',
    verb: 'UPDATE',
    inputs: [
      { name: 'findingId', demo: 'F-1' },
      { name: 'approvedBy', demo: '5f2a…dile' },
      { name: 'comment', demo: '' },
    ],
    returns: D('Applied asUser() in the approver’s name.', 'Appliqué asUser() au nom de la personne qui approuve.'),
    note: D('Locked without a human attestation (PW-09): run record-rotation first.', 'Verrouillé sans attestation humaine (PW-09) : exécutez d’abord record-rotation.'),
  },
  {
    key: 'dismiss-finding',
    verb: 'UPDATE',
    inputs: [
      { name: 'findingId', demo: 'F-5' },
      { name: 'reason', demo: '' },
      { name: 'reviewAt', demo: '2026-12-01T09:00:00Z' },
    ],
    returns: D('Ribbon placed — written reason mandatory.', 'Ruban posé — raison écrite obligatoire.'),
    note: D('An empty reason is refused: “false positive” is not a reason (§25.12).', 'Une raison vide est refusée : « faux positif » n’est pas une raison (§25.12).'),
  },
  {
    key: 'open-remediation-ticket',
    verb: 'CREATE',
    inputs: [{ name: 'findingId', demo: 'F-1' }, { name: 'projectKey', demo: 'SEC' }],
    returns: D('Jira ticket created and linked, assigned to the resolved owner.', 'Ticket Jira créé et lié, assigné au propriétaire résolu.'),
  },
];

/** Clé d'outil → spécification. */
export const MCP_TOOL_BY_KEY: ReadonlyMap<string, McpToolSpec> = new Map(
  MCP_TOOLS.map((tool) => [tool.key, tool]),
);
