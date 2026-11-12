// Certificat (§9, §18 écran 8) : daté, chiffré, scellé par empreinte.
// Jamais de valeur brute — chiffres et angles morts déclarés seulement.

import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import { formatDate } from '../ui.js';

export function CertificateScreen(): JSX.Element {
  const { t, lang } = useLang();
  const { dataset } = usePlacardData();
  const c = dataset.certificate;
  return (
    <section className="screen">
      <h2>{t('certTitle')}</h2>
      <p className="muted small">{t('certIntro')}</p>
      <article className="certificate">
        <h3>{t('appTitle')}</h3>
        <p>
          <strong>{t('certIssued')}:</strong> {formatDate(c.issuedAt, lang)}
          <br />
          <strong>{t('certScope')}:</strong> {c.scope}
        </p>
        <table>
          <tbody>
            <FigureRow label={t('certOpen')} value={c.open} accent />
            <FigureRow label={t('certRotated')} value={c.rotated} />
            <FigureRow label={t('certRedacted')} value={c.redacted} />
            <FigureRow label={t('certPurged')} value={c.purged} />
          </tbody>
        </table>
        <p>
          <strong>{t('certResidual')}:</strong> {c.residualExposure}
        </p>
        <p>
          <strong>{t('certBlind')}:</strong>
        </p>
        <ul className="small">
          {c.blindSpots.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="small">
          <strong>{t('certHash')}:</strong> <code>{c.contentHash}</code>
        </p>
      </article>
    </section>
  );
}

/** Ligne de chiffre du certificat, en évidence pour le compteur principal. */
function FigureRow({ label, value, accent }: { label: string; value: number; accent?: boolean }): JSX.Element {
  return (
    <tr>
      <th scope="row" style={accent ? { fontWeight: 800 } : undefined}>
        {label}
      </th>
      <td style={accent ? { fontWeight: 800 } : undefined}>{value}</td>
    </tr>
  );
}