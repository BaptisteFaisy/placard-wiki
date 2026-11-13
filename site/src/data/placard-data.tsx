// Contexte de données du site — le SEUL point d'entrée des écrans.
//
// `usePlacardData()` sert le jeu LIVE quand l'API répond, le jeu SNAPSHOT
// (embarqué) sinon. L'écran ne sait jamais d'où viennent les données ; seule
// l'indicateur d'honnêteté le dit — et il le dit toujours.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { snapshotDataset } from './dataset.js';
import type { PlacardDataset } from './dataset.js';
import { buildLiveDataset } from './live-dataset.js';
import { fetchLive, getLiveState, resetLiveCache, subscribeLive } from '../lib/live.js';
import type { LiveReason, LiveStatus } from '../lib/live.js';
import { LIVE_REFRESH_MS, liveApiUrl } from '../lib/live-config.js';

/** Ce que voit un écran : les données + l'état de la source. */
export interface PlacardData {
  readonly dataset: PlacardDataset;
  /** `live` : données réelles ; `snapshot` : jeu embarqué. */
  readonly status: LiveStatus;
  /** Pourquoi le snapshot est servi (injoignable, délai dépassé, forme invalide…). */
  readonly reason?: LiveReason;
  /** Horodatage du balayage live (null en snapshot). */
  readonly generatedAt?: string;
  /** Force un nouveau fetch (bouton « rafraîchir »). */
  readonly refresh: () => void;
  /** Un rafraîchissement est-il en cours ? */
  readonly refreshing: boolean;
}

const PlacardDataContext = createContext<PlacardData | null>(null);

/** Fournisseur : charge le live au montage, rafraîchit à la cadence `LIVE_REFRESH_MS`. */
export function PlacardDataProvider({ children }: { children: ReactNode }): ReactNode {
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState(getLiveState());

  useEffect(() => subscribeLive(() => setState(getLiveState())), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void fetchLive({ force: true }).finally(() => setRefreshing(false));
  }, []);

  // Premier chargement + auto-refresh (cadence `LIVE_REFRESH_MS`) — seulement
  // si l'URL est configurée : sans réseau, le site reste 100 % statique.
  useEffect(() => {
    if (liveApiUrl() === '') return;
    void fetchLive();
    const timer = window.setInterval(() => void fetchLive({ force: true }), LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const value = useMemo<PlacardData>(() => {
    const dataset = state.status === 'live' && state.data ? buildLiveDataset(state.data) : snapshotDataset();
    return {
      dataset,
      status: state.status === 'live' ? 'live' : 'snapshot',
      ...(state.reason !== undefined ? { reason: state.reason } : {}),
      ...(state.generatedAt !== undefined ? { generatedAt: state.generatedAt } : {}),
      refresh,
      refreshing,
    };
  }, [state, refresh, refreshing]);

  return <PlacardDataContext.Provider value={value}>{children}</PlacardDataContext.Provider>;
}

/** Données du site — live si disponible, snapshot sinon. */
export function usePlacardData(): PlacardData {
  const value = useContext(PlacardDataContext);
  if (!value) throw new Error('usePlacardData doit être utilisé sous <PlacardDataProvider>');
  return value;
}

/** Vide le cache live (tests) — nixe pas les données du site. */
export function clearLiveCache(): void {
  resetLiveCache();
}
