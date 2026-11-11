/**
 * Détection à la publication (§9 étape 4, §19) : un contenu créé ou mis à
 * jour, ou un commentaire ajouté, déclenche un balayage à la demande de la
 * page concernée. Si un foyer est trouvé, une bannière Forge Realtime est
 * poussée à l'auteur encore sur la page (PW-12).
 *
 * Règle : rien de brut dans les journaux ni dans la bannière — identifiants,
 * empreintes, aperçus masqués et scores seulement.
 *
 * ⚠ L'API Realtime exacte (canal, ciblage d'un utilisateur sur une page) est
 * **à valider semaine 1** (§22) — voir `runtime/context.ts` (`createRealtime`).
 */

import { getServiceContext } from './runtime/context.js';
import { runSweep } from './services/index.js';
import type { ServiceContext } from './services/ports.js';

interface ContentEvent {
  id?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}

/** Extrait l'identifiant de page d'un événement de contenu (formes variées). */
function pageIdOf(event: ContentEvent): string | undefined {
  const direct = event.id ?? event.payload?.['id'];
  if (typeof direct === 'string' && direct !== '') return direct;
  const content = event.payload?.['content'] as Record<string, unknown> | undefined;
  const nested = content?.['id'];
  return typeof nested === 'string' ? nested : undefined;
}

/** Journalise sans contenu : identifiants seulement (§23). */
function logEvent(name: string, event: ContentEvent): void {
  console.info(`[placard] ${name} id=${event.id ?? '?'} type=${event.eventType ?? '?'}`);
}

/** Canal Realtime ciblé sur l'auteur d'une page (forme à valider, §22). */
function bannerChannel(pageId: string, authorId?: string): string {
  return authorId === undefined ? `pw:page:${pageId}` : `pw:user:${authorId}:page:${pageId}`;
}

/** Publie la bannière à l'auteur si un foyer est présent sur la page. */
async function emitBanner(ctx: ServiceContext, pageId: string, authorId?: string): Promise<void> {
  const foyers = await ctx.store.listFoyers({ limit: 50 });
  const onPage = foyers.filter((f) => f.locations.some((l) => l.pageId === pageId && l.status === 'present'));
  if (onPage.length === 0) return;
  const maxScore = Math.max(...onPage.map((f) => f.score));
  const families = [...new Set(onPage.map((f) => f.family))];
  await ctx.realtime.publish(bannerChannel(pageId, authorId), {
    kind: 'placard-banner',
    pageId,
    foyerCount: onPage.length,
    maxDanger: maxScore,
    families,
    // Aucune valeur brute : familles + scores + empreintes seulement (§23).
    fingerprints: onPage.map((f) => f.fingerprint),
  });
}

/** Balaye une page à la demande puis prévient l'auteur (chaîne temps réel). */
async function scanAndNotify(event: ContentEvent, name: string): Promise<void> {
  logEvent(name, event);
  const pageId = pageIdOf(event);
  if (pageId === undefined) {
    console.info('[placard] événement sans identifiant de page : ignoré (déclaré, pas masqué).');
    return;
  }
  const ctx = getServiceContext();
  await runSweep(ctx, { mode: 'on-demand', scope: pageId, maxPages: 1 });
  const authorId = typeof event.payload?.['authorId'] === 'string' ? event.payload['authorId'] : undefined;
  await emitBanner(ctx, pageId, authorId);
}

export async function contentCreated(event: ContentEvent): Promise<void> {
  await scanAndNotify(event, 'content-created');
}

export async function contentUpdated(event: ContentEvent): Promise<void> {
  await scanAndNotify(event, 'content-updated');
}

export async function commentCreated(event: ContentEvent): Promise<void> {
  await scanAndNotify(event, 'comment-created');
}