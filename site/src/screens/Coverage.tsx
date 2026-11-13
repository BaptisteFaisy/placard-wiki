// Couverture & angles morts (§14, PW-19) — ce qui est lu, ce qui ne l'est pas,
// et POURQUOI. Les whiteboards et bases Confluence sont déclarés angles morts ;
// les DROITS MANQUANTS sont distingués de « pas de données ». Données typées
// `CoverageReport` du domaine ; l'écran n'ajoute que la présentation bilingue.

import { NO_DATA_VS_NO_RIGHT } from '../data/coverage.js';
import type { CoverageReportAffichee, GiteCoverageState } from '../data/coverage.js';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import { formatDate, GiteLabel } from '../ui.js';

/** L'état d'un gîte, en clair, dans la langue courante. */
function StateLabel({ state }: { state: GiteCoverageState }): JSX.Element {
  const { t } = useLang();
  const key = state === 'read' ? 'stateRead'
    : state === 'unread' ? 'stateUnread'
      : state === 'inaccessible' ? 'stateInaccessible'
        : 'stateNotAttempted';
  return <span className={`gite-state gite-${state}`}>{t(key)}</span>;
}

/**
 * Un nombre avec séparateur de milliers (espace), stable quelle que soit la
 * locale du navigateur : la méthode du rapport écrit « 13 471 », la ligne du
 * haut doit écrire pareil.
 */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** La couverture réelle, en grand : un pourcentage, jamais un 0 % muet. */
function CoverageBig({ coverage }: { coverage: CoverageReportAffichee }): JSX.Element {
  const { t } = useLang();
  if (coverage.coveragePercent === null) {
    return (
      <p className="coverage-big coverage-indeterminate">
        <strong>{t('covIndeterminate')}</strong>
      </p>
    );
  }
  // Numérateur et dénominateur du pourcentage, dans la MÊME unité : `pagesRead`
  // compte des lectures (page × gîte), `pagesTargeted` des pages. Afficher
  // « 81 pages lues · 16 pages visées » laissait croire à un ratio impossible ;
  // on montre donc le produit visé (gîtes × pages), celui de la méthode.
  const read = coverage.pagesRead;
  const pages = coverage.pagesTargeted;
  const gites = coverage.gitesTotal;
  const readsLine = read !== undefined && pages !== undefined && pages > 0 && gites > 0
    ? t('covReadsTargeted')
      .replace('{read}', groupThousands(read))
      .replace('{targeted}', groupThousands(pages * gites))
      .replace('{pages}', groupThousands(pages))
      .replace('{gites}', groupThousands(gites))
    : null;
  return (
    <p className="coverage-big">
      <strong className="coverage-percent">{coverage.coveragePercent.toLocaleString(undefined, { maximumFractionDigits: 1 })} %</strong>
      <span className="coverage-sub">
        {' '}{coverage.gitesCovered}/{coverage.gitesTotal} {t('covHidingPlacesCovered')}
        {readsLine !== null ? <> · {readsLine}</> : null}
      </span>
    </p>
  );
}

/** La méthode : le chiffre sans sa méthode ne vaut rien. */
function MethodBlock({ coverage }: { coverage: CoverageReportAffichee }): JSX.Element {
  const { t } = useLang();
  if (coverage.method === '') return <></>;
  return (
    <section aria-label={t('covMethodLabel')} className="coverage-method">
      <h3>{t('covMethodLabel')}</h3>
      <p className="method-text">{coverage.method}</p>
    </section>
  );
}

/** Table de couverture par gîte : lu / non lu / inaccessible / raison. */
function PerGiteTable({ coverage }: { coverage: CoverageReportAffichee }): JSX.Element {
  const { t } = useLang();
  return (
    <table className="registry">
      <caption>{t('covPerGite')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('covGite')}</th>
          <th scope="col">{t('covScannedCol')}</th>
          <th scope="col">{t('covSkippedCol')}</th>
          <th scope="col">{t('covInaccessibleCol')}</th>
          <th scope="col">{t('covReasonCol')}</th>
        </tr>
      </thead>
      <tbody>
        {coverage.perGite.map((entry) => (
          <tr key={entry.gite}>
            <td>
              <GiteLabel gite={entry.gite} />
            </td>
            <td>{entry.pagesRead}</td>
            <td>{entry.pagesUnread > 0 ? <strong>{entry.pagesUnread}</strong> : entry.pagesUnread}</td>
            <td>{entry.pagesInaccessible > 0 ? <strong>{entry.pagesInaccessible}</strong> : entry.pagesInaccessible}</td>
            <td className="small">
              <StateLabel state={entry.state} />
              {entry.reason !== undefined ? <span className="gite-reason"> — {entry.reason}</span> : null}
            </td>
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
      <h3>{t('covCoverageTitle')}</h3>
      <CoverageBig coverage={coverage} />
      <MethodBlock coverage={coverage} />
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
