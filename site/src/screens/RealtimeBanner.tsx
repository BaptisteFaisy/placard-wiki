// Bannière temps réel (§9.4, PW-12) — SIMULATION du push Forge Realtime :
// publication d'une page → détection en moins de 10 secondes simulées →
// bannière à l'auteur encore sur la page, avec [voir] [caviarder]. Le compteur
// est visible ; 1 seconde simulée = 200 ms réelles. Aucune écriture réelle :
// l'état est local à cette page.

import { useEffect, useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import { FOYERS } from '../data/demo.js';
import { useLang } from '../i18n.js';

/** Vitesse de la simulation : 1 seconde simulée = 200 ms réelles. */
const TICK_MS = 200;

/** La bannière arrive à t + 6 s simulées — sous la barre des 10 s (§9.4). */
const BANNER_AT = 6;

/** Brouillon synthétique — faux motif de clé AWS, aucune donnée réelle. */
const DRAFT_TEXT = [
  'Runbook — déploiement staging (brouillon)',
  '',
  'Clé d’accès prod : AKIAZ3XYW5VUTSRQ9876',
  'Après publication : prévenir #deploiement.',
].join('\n');

/** La bannière poussée à l'auteur : motif, danger, [voir] [caviarder]. */
function RealtimeBanner({ onView, onRedact }: { onView: () => void; onRedact: () => void }): JSX.Element {
  const { t, pick } = useLang();
  const foyer = FOYERS['F-1']!;
  const text = t('bannerText')
    .replace('{family}', pick(FAMILY_LABELS[foyer.family]))
    .replace('{score}', String(foyer.score));
  return (
    <div className="realtime-banner" role="alert">
      <span>{text}</span>
      <button type="button" onClick={onView}>
        [{t('bannerView')}]
      </button>
      <button type="button" onClick={onRedact}>
        [{t('bannerRedact')}]
      </button>
    </div>
  );
}

/** Brouillon en lecture seule + boutons publier / réinitialiser. */
function PublishControls({
  published,
  onPublish,
  onReset,
}: {
  published: boolean;
  onPublish: () => void;
  onReset: () => void;
}): JSX.Element {
  const { t } = useLang();
  return (
    <>
      <label className="field-label" htmlFor="banner-text">
        {t('bannerDraft')}
      </label>
      <textarea id="banner-text" rows={5} value={DRAFT_TEXT} readOnly aria-readonly="true" />
      <p>
        <button className="action primary" type="button" disabled={published} onClick={onPublish}>
          {t('bannerPublish')}
        </button>{' '}
        <button className="action" type="button" onClick={onReset}>
          {t('resetBtn')}
        </button>
      </p>
    </>
  );
}

export function RealtimeBannerScreen({ onOpenFoyer }: { onOpenFoyer: (id: string) => void }): JSX.Element {
  const { t } = useLang();
  const [published, setPublished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [redacted, setRedacted] = useState(false);

  // Chaîne de timeouts : le compteur avance jusqu'à l'apparition de la bannière.
  useEffect(() => {
    if (!published || elapsed >= BANNER_AT) return;
    const timer = window.setTimeout(() => setElapsed((n) => n + 1), TICK_MS);
    return () => window.clearTimeout(timer);
  }, [published, elapsed]);

  const reset = (): void => {
    setPublished(false);
    setElapsed(0);
    setRedacted(false);
  };

  const showBanner = published && elapsed >= BANNER_AT && !redacted;

  return (
    <section className="screen">
      <h2>{t('bannerTitle')}</h2>
      <p className="small muted">{t('bannerIntro')}</p>
      <PublishControls published={published} onPublish={() => setPublished(true)} onReset={reset} />
      {published && elapsed < BANNER_AT && (
        <p className="banner-counter" role="status">
          {t('bannerCounter').replace('{n}', String(elapsed))}
        </p>
      )}
      {showBanner && (
        <>
          <p className="banner-counter">
            {t('bannerPushed')} t + {String(elapsed)} s
          </p>
          <RealtimeBanner onView={() => onOpenFoyer('F-1')} onRedact={() => setRedacted(true)} />
        </>
      )}
      {redacted && (
        <p className="tool-note" role="status">
          {t('bannerRedacted')}
        </p>
      )}
    </section>
  );
}
