// Indicateur d'honnêteté — visible en permanence, en tête de page.
//
// Il dit la VRAIE source des données : LIVE (balayage réel, quand l'API
// répond) ou SNAPSHOT (jeu embarqué, avec la raison de l'échec). Jamais de
// couleur seule : un mot, une couleur, et l'explication.

import { useEffect, useState } from 'react';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import type { LiveReason } from '../lib/live.js';
import type { DictKey } from '../i18n-dict.js';

/** Raison d'un échec → clé de dictionnaire (bilingue, défaut anglais). */
const REASON_KEYS: Record<LiveReason, DictKey> = {
  'not-configured': 'liveReasonNotConfigured',
  timeout: 'liveReasonTimeout',
  network: 'liveReasonNetwork',
  http: 'liveReasonHttp',
  'invalid-shape': 'liveReasonInvalidShape',
};

/** Minutes écoulées depuis l'horodatage du balayage (null si illisible). */
function minutesSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((Date.now() - at) / 60000));
}

/** Période de rechargement de l'indicateur (l'âge affiché doit vieillir). */
const TICK_MS = 30000;

/**
 * Bandeau d'état de la source : vert en live, gris en snapshot, avec le
 * bouton de rafraîchissement. `aria-live` poli : la lecture à voix haute suit
 * le changement de source sans interrompre l'utilisateur.
 */
export function LiveStatusBanner(): JSX.Element {
  const { t } = useLang();
  const { dataset, status, reason, generatedAt, refresh, refreshing } = usePlacardData();
  const [, setTick] = useState(0);

  // L'horloge du bandeau : « balayé il y a N min » vieillit tout seul.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const live = status === 'live';
  const age = minutesSince(generatedAt);
  const reasonKey = reason !== undefined ? REASON_KEYS[reason] : undefined;

  let text: string;
  if (live) {
    const site = t('liveSiteLabel');
    const when = age === null ? t('liveScannedUnknown') : age <= 0 ? t('liveScannedNow') : t('liveScannedAgo').replace('{n}', String(age));
    text = `${t('liveBadge')} — ${site} ${dataset.siteName}, ${when}`;
  } else if (status === 'loading') {
    text = `${t('liveBadgeLoading')} — ${t('liveSnapshotNote')}`;
  } else {
    const why = reasonKey ? t(reasonKey) : t('liveReasonUnknown');
    text = `${t('snapshotBadge')} — ${t('liveSnapshotNote')} (${why})`;
  }

  return (
    <div className={`live-status ${live ? 'live-status-live' : 'live-status-snapshot'}`} aria-live="polite">
      <span className="live-status-text">{text}</span>
      <span className="live-status-extra">{live ? t('liveDemoSiteWarning') : t('liveAutoRefreshNote')}</span>
      <button type="button" className="live-refresh" onClick={refresh} disabled={refreshing}>
        {refreshing ? t('liveRefreshing') : t('liveRefresh')}
      </button>
    </div>
  );
}
