/**
 * Détection à la publication (§19) : un contenu créé ou mis à jour, ou un
 * commentaire ajouté, déclenche une détection en quelques secondes et, si un
 * motif est trouvé, une bannière Forge Realtime à l'auteur (PW-12).
 *
 * Règle : rien de brut dans les journaux — l'événement est journalisé par
 * identifiants, jamais par contenu.
 */

interface ContentEvent {
  id?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}

/** Journalise sans contenu : identifiants seulement. */
function logEvent(name: string, event: ContentEvent): void {
  console.info(`[placard] ${name} id=${event.id ?? '?'} type=${event.eventType ?? '?'}`);
}

export async function contentCreated(event: ContentEvent): Promise<void> {
  logEvent('content-created', event);
  // Lot « chaîne temps réel » : scan du corps + bannière Realtime à l'auteur.
}

export async function contentUpdated(event: ContentEvent): Promise<void> {
  logEvent('content-updated', event);
  // Lot « chaîne temps réel » : re-scan, revalidation des rubans de la page.
}

export async function commentCreated(event: ContentEvent): Promise<void> {
  logEvent('comment-created', event);
  // Lot « chaîne temps réel » : scan du commentaire (gîte « commentaires »).
}
