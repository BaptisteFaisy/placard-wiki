/**
 * Les treize outils MCP (§17), chacun sa fonction (une action = une fonction,
 * pour qu'un agent puisse les appeler une par une).
 *
 * Règles absolues :
 * - aucun outil ne renvoie de valeur brute ; aucun n'en accepte en entrée hors
 *   `check-text`, dont le texte n'est ni stocké ni journalisé ;
 * - `record-rotation` refuse un appel dont l'auteur est un agent :
 *   l'attestation est humaine ;
 * - un foyer n'est visible que par qui peut lire la page (PW-23) : sinon
 *   agrégats par espace.
 */

/** Réponse honnête d'un outil pas encore implémenté. */
function pending(tool: string): { notImplemented: string; honesty: string } {
  return {
    notImplemented: tool,
    honesty: 'Outil déclaré au manifeste (§17), implémentation en cours — aucune donnée renvoyée.',
  };
}

export async function scanPage(_payload: { pageId: string }): Promise<unknown> {
  return pending('scan-page');
}

export async function scanSpace(_payload: { spaceKey: string; limit?: number }): Promise<unknown> {
  return pending('scan-space');
}

export async function listExposedSecrets(_payload: {
  spaceKey?: string;
  minScore?: number;
  state?: string;
  limit?: number;
}): Promise<unknown> {
  return pending('list-exposed-secrets');
}

export async function getFinding(_payload: { findingId: string }): Promise<unknown> {
  return pending('get-finding');
}

export async function traceFingerprint(_payload: { fingerprint: string }): Promise<unknown> {
  return pending('trace-fingerprint');
}

export async function getExposure(_payload: { pageId: string }): Promise<unknown> {
  return pending('get-exposure');
}

export async function getCertificate(_payload: { spaceKey?: string; site?: boolean }): Promise<unknown> {
  return pending('get-certificate');
}

/** Le seul outil qui accepte du texte — jamais stocké, jamais journalisé. */
export async function checkText(_payload: { text: string }): Promise<unknown> {
  return pending('check-text');
}

/** Réservé aux personnes : un agent qui atteste est refusé (§17). */
export async function recordRotation(_payload: {
  findingId: string;
  provider: string;
  evidenceRef: string;
}): Promise<unknown> {
  return pending('record-rotation');
}

export async function requestRedaction(_payload: {
  findingId: string;
  scope?: string;
}): Promise<unknown> {
  return pending('request-redaction');
}

export async function applyRedaction(_payload: {
  findingId: string;
  approvedBy: string;
  comment: string;
}): Promise<unknown> {
  return pending('apply-redaction');
}

export async function dismissFinding(_payload: {
  findingId: string;
  reason: string;
  reviewAt: string;
}): Promise<unknown> {
  return pending('dismiss-finding');
}

export async function openRemediationTicket(_payload: {
  findingId: string;
  projectKey: string;
}): Promise<unknown> {
  return pending('open-remediation-ticket');
}
