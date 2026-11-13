// Indicateur d'honnêteté — visible en permanence, en tête de page.
//
// Il dit la VRAIE source des données : LIVE (balayage réel, quand l'API
// répond) ou SNAPSHOT (jeu embarqué, avec la raison de l'échec). Jamais de
// couleur seule : un mot, une couleur, et l'explication.

import { useEffect, useState } from 'react';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import type { LiveReason } from '../lib/live.js';
import { EXPECTED_CONTRACT_VERSION } from '../lib/contract.js';
import type { DictKey } from '../i18n-dict.js';

/** Raison d'un échec → clé de dictionnaire (bilingue, défaut anglais). */
const REASON_KEYS: Record<LiveReason, DictKey> = {
  'not-configured': 'liveReasonNotConfigured',
  timeout: 'liveReasonTimeout',
  network: 'liveReasonNetwork',
  http: 'liveReasonHttp',
  'invalid-shape': 'liveReasonInvalidShape',
  'contract-mismatch': 'liveReasonContractMismatch',
};

/** Secondes écoulées depuis l'horodatage du balayage (null si illisible). */
function secondsSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((Date.now() - at) / 1000));
}

/** Minutes écoulées depuis l'horodatage du balayage (null si illisible). */
function minutesSince(iso: string | undefined): number | null {
  const secs = secondsSince(iso);
  return secs === null ? null : Math.floor(secs / 60);
}

/** Période de rechargement de l'horloge (« il y a N s » doit bouger). */
const TICK_MS = 10_000;

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
  const reasonKey = reason !== undefined ? REASON_KEYS[reason] : undefined;

  let text: string;
  if (live) {
    const site = t('liveSiteLabel');
    const secs = secondsSince(generatedAt);
    const when = secs === null
      ? t('liveScannedUnknown')
      : secs < 60
        ? (secs <= 5 ? t('liveScannedNow') : t('liveScannedSecsAgo').replace('{n}', String(secs)))
        : t('liveScannedAgo').replace('{n}', String(minutesSince(generatedAt)));
    text = `${t('liveBadge')} — ${site} ${dataset.siteName}, ${when}`;
  } else if (status === 'loading') {
    text = `${t('liveBadgeLoading')} — ${t('liveSnapshotNote')}`;
  } else if (reason === 'contract-mismatch') {
    // Cas particulier : l'API a répondu, mais plus dans la langue du contrat.
    text = `${t('snapshotBadge')} — ${t('liveContractMismatch').replace('{version}', EXPECTED_CONTRACT_VERSION)}`;
  } else {
    const why = reasonKey ? t(reasonKey) : t('liveReasonUnknown');
    text = `${t('snapshotBadge')} — ${t('liveSnapshotNote')} (${t('liveSnapshotReason').replace('{reason}', why)})`;
  }

  return (
    <div className={`live-status ${live ? 'live-status-live' : 'live-status-snapshot'}`} aria-live="polite">
      <span className="live-status-text">{text}</span>
      {live && (
        <span className="live-status-extra">
          {t('liveAutoRefreshNote')} — {t('liveDemoSiteWarning')}
        </span>
      )}
      <button type="button" className="live-refresh" onClick={refresh} disabled={refreshing}>
        {refreshing ? t('liveRefreshing') : t('liveRefresh')}
      </button>
    </div>
  );
}
