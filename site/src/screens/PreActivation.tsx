// Surface IA / pré-activation (§13) — « Si on active l'assistant sur l'espace
// X, que verra-t-il ? ». Le rapport est produit par le VRAI paquet
// `@placard-wiki/exposure` (`preActivationReport`, importable navigateur :
// aucune dépendance node:crypto). Le site n'ajoute que la présentation et les
// traductions des angles morts (le paquet les rédige en français).

import { useMemo, useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import { preActivationReport } from '@placard-wiki/exposure';
import type { PreActivationReport } from '@placard-wiki/exposure';
import { BASE_BLIND_SPOT_EN } from '../data/coverage.js';
import type { Certificate } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import type { PlacardDataset } from '../data/dataset.js';
import { DangerBadge } from '../ui.js';

/** Horodatage figé de la démo — rapports déterministes (§20). */
const DEMO_NOW = '2026-11-10T10:00:00Z';

/** Construit le VRAI rapport de pré-activation pour un espace. */
function reportFor(spaceKey: string, data: PlacardDataset): PreActivationReport {
  const foyers = Object.values(data.foyers)
    .filter((foyer) => foyer.spaceKey === spaceKey)
    .map((foyer) => ({
      id: foyer.id,
      family: foyer.family,
      score: foyer.score,
      state: foyer.state,
      presumedIndexed: data.exposures[foyer.primaryPageId ?? '']?.aiSurface.presumedIndexed ?? false,
    }));
  return preActivationReport({ spaceKey, foyers, now: data.generatedAt ?? DEMO_NOW });
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
function BlindSpots({ report, spaceBlindSpots, spaceBlindSpotsEn }: { report: PreActivationReport; spaceBlindSpots: readonly string[]; spaceBlindSpotsEn?: readonly string[] }): JSX.Element {
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
        {spaceBlindSpots.map((spot, index) => (
          <li key={spot}>{lang === 'en' ? (spaceBlindSpotsEn?.[index] ?? spot) : spot}</li>
        ))}
      </ul>
    </>
  );
}

/** Le certificat correspondant — chiffres uniquement, jamais de valeur. */
function MatchingCertificate({ onOpenCertificate, certificate }: { onOpenCertificate: () => void; certificate: Certificate }): JSX.Element {
  const { t } = useLang();
  return (
    <section className="cert-mini" aria-label={t('preactCert')}>
      <h3>{t('preactCert')}</h3>
      <p className="small muted">{t('preactCertNote')}</p>
      <p>
        <code>{certificate.id}</code> — {certificate.scope} — {certificate.issuedAt}
      </p>
      <p>
        {t('certOpen')}: {certificate.open} · {t('certRotated')}: {certificate.rotated} · {t('certRedacted')}:{' '}
        {certificate.redacted} · {t('certPurged')}: {certificate.purged}
      </p>
      <button className="action" type="button" onClick={onOpenCertificate}>
        {t('preactOpenCert')}
      </button>
    </section>
  );
}

export function PreActivationScreen({ onOpenCertificate }: { onOpenCertificate: () => void }): JSX.Element {
  const { t, pick, lang } = useLang();
  const { dataset } = usePlacardData();
  const spaces = dataset.spaces;
  const [chosen, setChosen] = useState<string>('');
  // L'espace retenu : celui choisi s'il existe encore, sinon le premier connu
  // (le jeu live peut ne pas porter les mêmes espaces que la démo).
  const spaceKey = spaces.some((space) => space.key === chosen) ? chosen : spaces[0]?.key ?? '';
  const report = useMemo(() => reportFor(spaceKey, dataset), [spaceKey, dataset]);

  return (
    <section className="screen">
      <h2>{t('preactTitle')}</h2>
      <p className="small muted">{t('preactIntro')}</p>
      <label className="field-label" htmlFor="preact-space">
        {t('preactSpace')}
      </label>
      <select id="preact-space" value={spaceKey} onChange={(e) => setChosen(e.target.value)}>
        {spaces.map((space) => (
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
      <BlindSpots report={report} spaceBlindSpots={dataset.coverage.blindSpots} spaceBlindSpotsEn={dataset.coverageBlindSpotsEn} />
      <MatchingCertificate onOpenCertificate={onOpenCertificate} certificate={dataset.certificate} />
    </section>
  );
}
