// Couverture & angles morts (§14, PW-19) — ce qui est lu, ce qui ne l'est pas,
// et POURQUOI. Les whiteboards et bases Confluence sont déclarés angles morts ;
// les DROITS MANQUANTS sont distingués de « pas de données ». Données typées
// `CoverageReport` du domaine ; l'écran n'ajoute que la présentation bilingue.

import { NO_DATA_VS_NO_RIGHT } from '../data/coverage.js';
import type { CoverageReport } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import { formatDate, GiteLabel } from '../ui.js';

/** Table de couverture par gîte : balayé / non lu / raison. */
function PerGiteTable({ coverage }: { coverage: CoverageReport }): JSX.Element {
  const { t } = useLang();
  return (
    <table className="registry">
      <caption>{t('covPerGite')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('covGite')}</th>
          <th scope="col">{t('covScannedCol')}</th>
          <th scope="col">{t('covSkippedCol')}</th>
          <th scope="col">{t('covReasonCol')}</th>
        </tr>
      </thead>
      <tbody>
        {coverage.perGite.map((entry) => (
          <tr key={entry.gite}>
            <td>
              <GiteLabel gite={entry.gite} />
            </td>
            <td>{entry.scanned}</td>
            <td>{entry.skipped > 0 ? <strong>{entry.skipped}</strong> : entry.skipped}</td>
            <td className="small">{entry.reason ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Angles morts déclarés : whiteboards, bases, captures — jamais tus. */
function BlindSpots(props: { blindSpots: readonly string[]; blindSpotsEn?: readonly string[] }): JSX.Element {
  const { t, lang } = useLang();
  const { blindSpots, blindSpotsEn } = props;
  return (
    <section aria-label={t('covBlind')}>
      <h3>{t('covBlind')}</h3>
      <ul>
        {blindSpots.map((spot, index) => (
          <li key={spot}>{lang === 'en' ? (blindSpotsEn?.[index] ?? spot) : spot}</li>
        ))}
      </ul>
    </section>
  );
}

/** Droits manquants — distingués de « pas de données ». */
function MissingRights(props: { missingRights: readonly string[]; missingRightsEn?: readonly string[] }): JSX.Element {
  const { t, lang } = useLang();
  const { missingRights, missingRightsEn } = props;
  return (
    <section aria-label={t('covRights')}>
      <h3>{t('covRights')}</h3>
      <ul className="rights-list">
        {missingRights.map((right, index) => (
          <li key={right}>{lang === 'en' ? (missingRightsEn?.[index] ?? right) : right}</li>
        ))}
      </ul>
      <p className="tool-note">
        <strong>{t('covContrast')}</strong> — {lang === 'fr' ? NO_DATA_VS_NO_RIGHT.fr : NO_DATA_VS_NO_RIGHT.en}
      </p>
    </section>
  );
}

export function CoverageScreen({ onGotoBudget }: { onGotoBudget: () => void }): JSX.Element {
  const { t, lang } = useLang();
  const { dataset } = usePlacardData();
  const coverage = dataset.coverage;
  return (
    <section className="screen">
      <h2>{t('covTitle')}</h2>
      <p className="small muted">{t('covIntro')}</p>
      <p className="muted">
        {t('covLastPass')} : {coverage.lastPassAt ? formatDate(coverage.lastPassAt, lang) : '—'}
      </p>
      <PerGiteTable coverage={coverage} />
      <BlindSpots blindSpots={coverage.blindSpots} blindSpotsEn={dataset.coverageBlindSpotsEn} />
      <MissingRights missingRights={coverage.missingRights} missingRightsEn={dataset.missingRightsEn} />
      <p className="small muted">{t('covBudgetLink')}</p>
      <p>
        <button className="action" type="button" onClick={onGotoBudget}>
          {t('covOpenBudget')}
        </button>
      </p>
    </section>
  );
}
