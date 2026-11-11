// Budget & couverture (§14, §18 écran 6) : pages balayées, pièces jointes
// non lues ET pourquoi, angles morts, appels LLM. Couverture déclarée.

import { BUDGET, COVERAGE_BLIND_SPOTS } from '../data/demo-site.js';
import { useLang } from '../i18n.js';

/** Formate une durée en millisecondes pour l'affichage (lisible). */
function formatMs(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} min ${sec % 60} s`;
}

export function BudgetScreen(): JSX.Element {
  const { t } = useLang();
  return (
    <section className="screen">
      <h2>{t('budgetTitle')}</h2>
      <p className="muted small">{t('budgetIntro')}</p>
      <p className="small">{t('sweepModes')}</p>
      <BudgetKpis />
      <SkippedTable />
      <BlindSpots />
      <p className="small muted">
        <strong>{t('coverageNote')}:</strong> {BUDGET.coverageNote}
      </p>
    </section>
  );
}

/** Indicateurs chiffrés du dernier balayage. */
function BudgetKpis(): JSX.Element {
  const { t } = useLang();
  const b = BUDGET;
  return (
    <div>
      <Kpi label={t('pagesScanned')} value={String(b.pagesScanned)} />
      <Kpi label={t('attachmentsRead')} value={String(b.attachmentsRead)} />
      <Kpi label={t('attachmentsSkipped')} value={String(b.attachmentsSkipped)} />
      <Kpi label={t('llmCalls')} value={String(b.llmCalls)} />
      <Kpi label={t('tokens')} value={String(b.tokens)} />
      <Kpi label={t('costEstimate')} value={`$${b.costEstimate.toFixed(2)}`} />
      <Kpi label={t('lastPass')} value={formatMs(b.lastPassMs ?? 0)} />
    </div>
  );
}

/** Fichiers non lus — et pourquoi (la couverture déclarée, jamais masquée). */
function SkippedTable(): JSX.Element {
  const { t } = useLang();
  return (
    <section>
      <h3>{t('skippedTitle')}</h3>
      <table className="registry">
        <thead>
          <tr>
            <th scope="col">{t('skippedKind')}</th>
            <th scope="col">{t('skippedReason')}</th>
            <th scope="col">{t('skippedCount')}</th>
          </tr>
        </thead>
        <tbody>
          {BUDGET.skipped.map((s) => (
            <tr key={s.kind}>
              <td>{s.kind}</td>
              <td>{s.reason}</td>
              <td>{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Angles morts déclarés (§24), jamais ignorés en silence. */
function BlindSpots(): JSX.Element {
  const { t } = useLang();
  return (
    <section>
      <h3>{t('blindSpotsTitle')}</h3>
      <ul className="small">
        {COVERAGE_BLIND_SPOTS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}

/** Indicateur chiffré simple. */
function Kpi({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="badge" style={{ margin: '0 0.4rem 0.4rem 0' }}>
      {label}: <strong>{value}</strong>
    </span>
  );
}