/**
 * Bannière temps réel (cahier §9 étape 4, §18.3, PW-12).
 *
 * But : prévenir l'auteur **juste après publication**, avant que le secret
 * ne soit recopié, indexé par Rovo, ou lu — avec un bouton « caviarder » en
 * un clic. C'est la différence avec un scanner nocturne.
 *
 * ── API « à valider en semaine 1 » (cahier §22) ──────────────────────────
 * Le ciblage d'un utilisateur précis sur une page donnée via Forge Realtime
 * est le point à valider la première semaine. Solution de repli documentée :
 * commentaire automatique sur la page + notification. Ce fichier isole tout
 * l'accès au canal temps réel derrière `useRealtimeBanner` : si l'API bouge,
 * seul ce module change, pas les écrans.
 *
 * Côté frontend, l'abonnement se fait via le module `realtime` de
 * `@forge/bridge` (`realtime.subscribe`). Côté backend, la publication
 * utilise `@forge/events` (appEvents) ou `realtime.publish` — hors périmètre
 * de ce lot « écrans », mais le contrat de payload ci-dessous est partagé.
 *
 * Règle : le payload ne transporte jamais de valeur brute — famille, score,
 * empreinte de foyer et aperçu masqué seulement (types du domaine).
 */

import { useCallback, useEffect, useState } from 'react';
import type { WikiFamily } from '@placard-wiki/domain';
import { callBridge, type BridgeOutcome } from './bridge';

/**
 * Le payload de la bannière, poussé par le backend à l'auteur de la page.
 * Hérite de `Record<string, unknown>` car `realtime.subscribe<T>` impose cette
 * contrainte ; les champs utiles sont typés, le reste ignoré.
 */
export interface RealtimeBannerPayload extends Record<string, unknown> {
  /** Identifiant du foyer ouvert (pour « voir » et « caviarder »). */
  foyerId: string;
  /** Famille de détection — affichée, jamais la valeur. */
  family: WikiFamily;
  /** Score de danger 0-100 (§8), affiché avec ses termes côté fiche. */
  score: number;
  /** Page concernée (celle que l'auteur vient de publier). */
  pageId: string;
  /** Aperçu masqué (`AKIA…(20)`) — la famille est visible, la valeur non. */
  maskedPreview: string;
}

/** Résultat d'une action de caviardage déclenchée depuis la bannière. */
export type RedactOutcome = BridgeOutcome<{
  applied: number;
  versionComment: string;
  asUser: string;
}>;

/** L'état exposé par le hook : bannière courante + actions. */
export interface RealtimeBanner {
  /** `null` tant qu'aucune bannière n'a été poussée sur cette page. */
  banner: RealtimeBannerPayload | null;
  /** L'abonnement est actif (le canal écoute). */
  subscribed: boolean;
  /** Caviarde le foyer de la bannière au nom de la personne (PW-10). */
  redact: (approvedBy: string, comment: string) => Promise<RedactOutcome | null>;
  /** Ferme la bannière localement (sans toucher au foyer). */
  dismiss: () => void;
}

/** Nom du canal Realtime d'une page — convention « à valider semaine 1 ». */
export function bannerChannel(pageId: string): string {
  return 'placard-banner:' + pageId;
}

/**
 * Normalise le payload reçu : `realtime.subscribe` livre `string | T`. Une
 * chaîne est un JSON sérialisé — on la parse prudemment, sans jamais lever.
 */
function normalizePayload(raw: string | RealtimeBannerPayload): RealtimeBannerPayload | null {
  if (typeof raw !== 'string') return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'foyerId' in parsed) {
      return parsed as RealtimeBannerPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ouvre l'abonnement au canal temps réel d'une page et renvoie la fonction de
 * désabonnement. `pageId` vide → aucun abonnement. Toute erreur est avalée :
 * l'écran reste honnête (bannière absente), jamais cassé.
 *
 * `@forge/bridge` est chargé à l'appel, jamais à l'importation : il lève hors
 * d'un produit Atlassian. Même convention que l'app sœur `tickets-pieges`.
 */
function openSubscription(
  pageId: string,
  onBanner: (banner: RealtimeBannerPayload) => void,
  onSubscribed: (ok: boolean) => void,
): () => void {
  if (!pageId) {
    onSubscribed(false);
    return () => {};
  }
  let alive = true;
  let unsubscribe: (() => Promise<void>) | null = null;

  void import('@forge/bridge')
    .then(({ realtime }) =>
      realtime.subscribe<RealtimeBannerPayload>(bannerChannel(pageId), (payload) => {
        if (!alive) return;
        const normalized = normalizePayload(payload);
        if (normalized) onBanner(normalized);
      }),
    )
    .then((subscription) => {
      if (!alive) {
        void subscription.unsubscribe();
        return;
      }
      unsubscribe = () => subscription.unsubscribe();
      onSubscribed(true);
    })
    .catch(() => {
      if (alive) onSubscribed(false);
    });

  return () => {
    alive = false;
    if (unsubscribe) void unsubscribe();
  };
}

/**
 * S'abonne à la bannière temps réel d'une page et expose les actions.
 * `pageId` vide → aucun abonnement (écran hors contexte de page).
 */
export function useRealtimeBanner(pageId: string): RealtimeBanner {
  const [banner, setBanner] = useState<RealtimeBannerPayload | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => openSubscription(pageId, setBanner, setSubscribed), [pageId]);

  const redact = useCallback(
    async (approvedBy: string, comment: string): Promise<RedactOutcome | null> => {
      if (!banner) return null;
      const outcome = await callBridge('ritual/redaction-apply', {
        foyerId: banner.foyerId,
        approvedBy,
        comment,
      });
      if (outcome.kind === 'ok') setBanner(null);
      return outcome;
    },
    [banner],
  );

  const dismiss = useCallback(() => setBanner(null), []);

  return { banner, subscribed, redact, dismiss };
}
