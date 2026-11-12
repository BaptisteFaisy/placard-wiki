// Surface IA / pré-activation (§13) — « Si on active l'assistant sur l'espace
// X, que verra-t-il ? ». Le rapport est produit par le VRAI paquet
// `@placard-wiki/exposure` (`preActivationReport`, importable navigateur :
// aucune dépendance node:crypto). Le site n'ajoute que la présentation et les
// traductions des angles morts (le paquet les rédige en français).

import { useMemo, useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import { preActivationReport } from '@placard-wiki/exposure';
import type { PreActivationReport } from '@placard-wiki/exposure';
import { BASE_BLIND_SPOT_EN, COVERAGE, SPACE_BLIND_SPOT_EN } from '../data/coverage.js';
import { EXPOSURES, FOYERS, SPACES } from '../data/demo.js';
import { CERTIFICATE } from '../data/demo-site.js';
import { useLang } from '../i18n.js';
import { DangerBadge } from '../ui.js';

/** Horodatage figé de la démo — rapports déterministes (§20). */
const DEMO_NOW = '2026-11-10T10:00:00Z';

/** Construit le VRAI rapport de pré-activation pour un espace. */
function reportFor(spaceKey: string): PreActivationReport {
  const foyers = Object.values(FOYERS)
    .filter((foyer) => foyer.spaceKey === spaceKey)
    .map((foyer) => ({
      id: foyer.id,
      family: foyer.family,
      score: foyer.score,
      state: foyer.state,
      presumedIndexed: EXPOSURES[foyer.primaryPageId ?? '']?.aiSurface.presumedIndexed ?? false,
    }));
  return preActivationReport({ spaceKey, foyers, now: DEMO_NOW });
}

/** Chiffres clés du rapport — jamais de contenu de foyer (§23). */
function Figures({ report }: { report: PreActivationReport }): JSX.Element {
  const { t } = useLang();
  return (
    <dl className="figures">
      <dt>{t('preactScanned')}</dt>
      <dd>{report.scannedFoyers}</dd>
      <dt>{t('preactExposed')}</dt>
      <dd>{report.exposedFoyers}</dd>
      <dt>{t('preactIndexed')}</dt>
      <dd>{report.presumedIndexedFoyers}</dd>
    </dl>
  );
}

/** Agrégats par famille : compte, danger max, coût de remise en état. */
function FamilyTable({ report }: { report: PreActivationReport }): JSX.Element {
  const { t, lang } = useLang();
  return (
    <table className="registry">
      <caption>{t('preactFamilies')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('preactFamily')}</th>
          <th scope="col">{t('preactCount')}</th>
          <th scope="col">{t('preactMaxScore')}</th>
          <th scope="col">{t('preactCost')}</th>
        </tr>
      </thead>
      <tbody>
        {report.byFamily.map((aggregate) => (
          <tr key={aggregate.family}>
            <td>{lang === 'fr' ? aggregate.labelFr : aggregate.labelEn} ({FAMILY_LABELS[aggregate.family].numbers.join(', ')})</td>
            <td>{aggregate.count}</td>
            <td>
              <DangerBadge score={aggregate.maxScore} />
            </td>
            <td>
              {aggregate.hoursLow}–{aggregate.hoursHigh} h
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Angles morts : ceux du paquet (FR, traduits) + ceux de l'espace. */
function BlindSpots({ report }: { report: PreActivationReport }): JSX.Element {
  const { t, lang } = useLang();
  return (
    <>
      <h3>{t('preactBlind')}</h3>
      <ul>
        {report.blindSpots.map((spot) => (
          <li key={spot}>{lang === 'en' ? (BASE_BLIND_SPOT_EN[spot] ?? spot) : spot}</li>
        ))}
      </ul>
      <p className="small muted">{t('preactFrNote')}</p>
      <h3>{t('preactBlindSpace')}</h3>
      <ul>
        {COVERAGE.blindSpots.map((spot, index) => (
          <li key={spot}>{lang === 'en' ? (SPACE_BLIND_SPOT_EN[index] ?? spot) : spot}</li>
        ))}
      </ul>
    </>
  );
}

/** Le certificat correspondant — chiffres uniquement, jamais de valeur. */
function MatchingCertificate({ onOpenCertificate }: { onOpenCertificate: () => void }): JSX.Element {
  const { t } = useLang();
  return (
    <section className="cert-mini" aria-label={t('preactCert')}>
      <h3>{t('preactCert')}</h3>
      <p className="small muted">{t('preactCertNote')}</p>
      <p>
        <code>{CERTIFICATE.id}</code> — {CERTIFICATE.scope} — {CERTIFICATE.issuedAt}
      </p>
      <p>
        {t('certOpen')}: {CERTIFICATE.open} · {t('certRotated')}: {CERTIFICATE.rotated} · {t('certRedacted')}:{' '}
        {CERTIFICATE.redacted} · {t('certPurged')}: {CERTIFICATE.purged}
      </p>
      <button className="action" type="button" onClick={onOpenCertificate}>
        {t('preactOpenCert')}
      </button>
    </section>
  );
}

export function PreActivationScreen({ onOpenCertificate }: { onOpenCertificate: () => void }): JSX.Element {
  const { t, pick, lang } = useLang();
  const [spaceKey, setSpaceKey] = useState<string>('DEMO');
  const report = useMemo(() => reportFor(spaceKey), [spaceKey]);

  return (
    <section className="screen">
      <h2>{t('preactTitle')}</h2>
      <p className="small muted">{t('preactIntro')}</p>
      <label className="field-label" htmlFor="preact-space">
        {t('preactSpace')}
      </label>
      <select id="preact-space" value={spaceKey} onChange={(e) => setSpaceKey(e.target.value)}>
        {SPACES.map((space) => (
          <option key={space.key} value={space.key}>
            {space.key} — {pick(space)}
          </option>
        ))}
      </select>
      <p className="tool-note">
        {t('preactQuestion')} : « {report.question} »
        {lang === 'en' ? ` — “${t('preactQuestionEn')}”` : ''}
      </p>
      <Figures report={report} />
      {report.maxExposure && (
        <p>
          <strong>{t('preactMax')}</strong> : {report.maxExposure.foyerId} (
          {lang === 'fr' ? FAMILY_LABELS[report.maxExposure.family].fr : FAMILY_LABELS[report.maxExposure.family].en}) —{' '}
          <DangerBadge score={report.maxExposure.score} />
        </p>
      )}
      <FamilyTable report={report} />
      <BlindSpots report={report} />
      <MatchingCertificate onOpenCertificate={onOpenCertificate} />
    </section>
  );
}
