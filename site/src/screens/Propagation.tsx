// Propagation (§11) — une empreinte, plusieurs emplacements. La timeline et
// l'ordre du lot de caviardage sont calculés par le VRAI paquet
// `@placard-wiki/propagation` (compatible navigateur). Le site n'ajoute que la
// présentation : traduction des mois et mise en forme du graphe.

import { useMemo, useState } from 'react';
import { propagationTimeline, redactionOrder } from '@placard-wiki/propagation';
import type { PropagationTimeline } from '@placard-wiki/propagation';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import type { PropagationEntry } from '../data/dataset.js';
import { formatDate, GiteLabel } from '../ui.js';

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Titre d'une page (registre,Propagation ou étude de cas PROP-1). */
function titleOf(pageId: string, titles: Record<string, string>, propTitles: Record<string, string>): string {
  return titles[pageId] ?? propTitles[pageId] ?? pageId;
}

/** Mois lisible d'une date ISO, dans la langue courante. */
function monthOf(iso: string, lang: 'en' | 'fr'): string {
  const index = Number(iso.slice(5, 7)) - 1;
  return (lang === 'fr' ? MOIS_FR : MOIS_EN)[index] ?? iso.slice(0, 7);
}

/** Phrase-résumé bilingue, bâtie depuis les comptes du VRAI paquet. */
function Summary({ timeline }: { timeline: PropagationTimeline }): JSX.Element {
  const { t, lang } = useLang();
  if (timeline.copyCount === 0) return <p className="tool-note">{t('propCopied0')}</p>;
  const first = timeline.copies[0]?.copiedAt ?? '';
  const last = timeline.copies[timeline.copies.length - 1]?.copiedAt ?? '';
  const m1 = monthOf(first, lang);
  const m2 = monthOf(last, lang);
  const key = m1 === m2 ? 'propCopiedSame' : 'propCopiedN';
  const sentence = t(key)
    .replace('{n}', String(timeline.copyCount))
    .replace('{k}', String(timeline.duplicationCount))
    .replace('{m1}', m1)
    .replace('{m2}', m2);
  return <p className="tool-note">{sentence}</p>;
}

/** Timeline datée : source présumée, puis chaque recopie et son heuristique. */
function Timeline({ timeline, titles, propTitles }: { timeline: PropagationTimeline; titles: Record<string, string>; propTitles: Record<string, string> }): JSX.Element {
  const { t, lang } = useLang();
  const source = timeline.sourcePageId ?? '';
  return (
    <ol className="prop-timeline">
      <li className="prop-source">
        <strong>{t('propSource')}</strong> — {titleOf(source, titles, propTitles)} <code>({source})</code>
      </li>
      {timeline.copies.map((copy) => (
        <li key={copy.pageId} className={copy.byPageDuplication ? 'prop-copy prop-dup' : 'prop-copy'}>
          {titleOf(copy.pageId, titles, propTitles)} <code>({copy.pageId})</code> — {formatDate(copy.copiedAt, lang)}
          {copy.heuristique && (
            <span className="badge state" title={t('propHeuristic')}>
              {' '}
              {copy.heuristique}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Graphe simple des emplacements : la source, puis ses recopies. */
function LocationGraph({ timeline, titles, propTitles }: { timeline: PropagationTimeline; titles: Record<string, string>; propTitles: Record<string, string> }): JSX.Element {
  const { t } = useLang();
  const source = timeline.sourcePageId ?? '';
  return (
    <div className="prop-graph" role="img" aria-label={`${t('propGraph')} : ${source} → ${timeline.copies.map((c) => c.pageId).join(', ')}`}>
      <div className="prop-node prop-node-source">
        {titleOf(source, titles, propTitles)}
        <br />
        <code>{source}</code>
      </div>
      <div className="prop-edges" aria-hidden="true">
        {timeline.copies.map((copy) => (
          <div key={copy.pageId} className={copy.byPageDuplication ? 'prop-edge prop-edge-dup' : 'prop-edge'}>
            →
          </div>
        ))}
      </div>
      <ul className="prop-leaves">
        {timeline.copies.map((copy) => (
          <li key={copy.pageId} className="prop-node">
            {titleOf(copy.pageId, titles, propTitles)}
            <br />
            <code>{copy.pageId}</code>
            {copy.byPageDuplication && <span className="badge state"> dup</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lot de caviardage : ordre du VRAI `redactionOrder`, modèle en premier. */
function BatchOrder(props: { foyerId: string; entries: readonly PropagationEntry[]; exposure: ReadonlyMap<string, number>; titles: Record<string, string>; propTitles: Record<string, string> }): JSX.Element {
  const { t, lang } = useLang();
  const { foyerId, entries, exposure, titles, propTitles } = props;
  const entry = entries.find((candidate) => candidate.id === foyerId);
  if (!entry) return <p>{t('noFoyer')}</p>;
  const order = redactionOrder(entry.foyer, exposure);
  return (
    <section aria-label={t('propBatch')}>
      <h3>{t('propBatch')}</h3>
      <ol className="prop-batch">
        {order.orderedLocations.map((location, index) => (
          <li key={location.id}>
            <strong>{String(index + 1)}.</strong> <GiteLabel gite={location.gite} /> — {titleOf(location.pageId, titles, propTitles)}{' '}
            <code>({location.pageId})</code>
            {location.versionNumber !== undefined && (
              <span className="muted"> · {t('historyVersion').replace('{v}', String(location.versionNumber))}</span>
            )}
            {index === 0 && order.templateFirst && <span className="badge danger-high"> {t('propTemplateFirst')}</span>}
            <span className="muted small"> · {formatDate(location.detectedAt, lang)}</span>
          </li>
        ))}
      </ol>
      {order.exclus.length > 0 && (
        <p className="small muted">
          {t('propExcluded')} : {order.exclus.map((location) => location.id).join(', ')}
        </p>
      )}
    </section>
  );
}

export function PropagationScreen(): JSX.Element {
  const { t } = useLang();
  const { dataset } = usePlacardData();
  const entries = dataset.propagationFoyers;
  const [chosen, setChosen] = useState<string>('');
  const foyerId = entries.some((candidate) => candidate.id === chosen) ? chosen : entries[0]?.id ?? '';
  const entry = entries.find((candidate) => candidate.id === foyerId);
  const timeline = useMemo(
    () => (entry ? propagationTimeline(entry.foyer, dataset.pagesMeta) : null),
    [entry, dataset.pagesMeta],
  );

  return (
    <section className="screen">
      <h2>{t('propTitle')}</h2>
      <p className="small muted">{t('propIntro')}</p>
      <label className="field-label" htmlFor="prop-select">
        {t('propSelect')}
      </label>
      <select id="prop-select" value={foyerId} onChange={(e) => setChosen(e.target.value)}>
        {entries.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.id} — {candidate.foyer.family} — {candidate.foyer.fingerprint.slice(0, 12)}…
          </option>
        ))}
      </select>
      {entry && (
        <>
          <h3>{t('propSummary')}</h3>
          {timeline && <Summary timeline={timeline} />}
          {timeline && <Timeline timeline={timeline} titles={dataset.titles} propTitles={dataset.propTitles} />}
          {timeline && <LocationGraph timeline={timeline} titles={dataset.titles} propTitles={dataset.propTitles} />}
          <details>
            <summary>{t('propPackageOut')}</summary>
            <pre className="json-out">{timeline ? JSON.stringify(timeline, null, 2) : ''}</pre>
          </details>
          <BatchOrder foyerId={foyerId} entries={entries} exposure={dataset.propExposure} titles={dataset.titles} propTitles={dataset.propTitles} />
          <p className="small muted">{t('propNoActor')}</p>
        </>
      )}
    </section>
  );
}
