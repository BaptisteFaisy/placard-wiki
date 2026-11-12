// Skill `before-sharing-a-page` (§17) — démonstration du garde-fou des agents :
// un texte « sur le point d'être publié », une vérification LOCALE (vrai
// calcul : motifs légers du site + empreinte WebCrypto — écart documenté :
// le moteur réel @placard-wiki/detectors importe node:crypto), et la
// suggestion du skill : un lien vers le gestionnaire de secrets, jamais la
// valeur.

import { useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { WikiFamily } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import { checkText } from '../lib/check-text.js';
import { hmacFingerprint } from '../lib/fingerprint.js';

/** Un résultat de vérification : empreinte locale + aperçu masqué. */
interface VerifiedHit {
  family: WikiFamily;
  maskedPreview: string;
  knownFake: boolean;
  fingerprint: string;
}

/** Texte d'exemple — valeurs 100 % synthétiques, aucune donnée réelle. */
const SAMPLE_TEXT = [
  'Runbook — déploiement staging (brouillon rédigé par un agent)',
  '',
  'Clé d’accès prod : AKIAZ3XYW5VUTSRQ9876',
  'Base : postgres://svc_demo:chouchou27@db.internal:5432/app',
  'Contact : équipe OPS — canal #deploiement',
].join('\n');

/** Vérification locale : motifs légers + empreinte HMAC WebCrypto. */
async function verify(text: string): Promise<VerifiedHit[]> {
  const hits = checkText(text);
  return Promise.all(
    hits.map(async (hit) => ({
      family: hit.family,
      maskedPreview: hit.maskedPreview,
      knownFake: hit.knownFake,
      fingerprint: await hmacFingerprint(`${hit.family}:${String(hit.start)}:${hit.maskedPreview}`),
    })),
  );
}

/** Table des empreintes détectées — jamais la valeur brute (PW-04). */
function HitTable({ hits }: { hits: readonly VerifiedHit[] }): JSX.Element {
  const { t, pick } = useLang();
  return (
    <table className="registry skill-results">
      <caption>{t('skillHits')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('skillResultFamily')}</th>
          <th scope="col">{t('skillResultFp')}</th>
          <th scope="col">{t('skillResultPreview')}</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.fingerprint}>
            <td>{pick(FAMILY_LABELS[hit.family])}</td>
            <td>
              <code>{hit.fingerprint.slice(0, 16)}…</code>
              {hit.knownFake && <span className="badge state"> {t('skillFake')}</span>}
            </td>
            <td>
              <code>{hit.maskedPreview}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkillCheckScreen(): JSX.Element {
  const { t } = useLang();
  const [text, setText] = useState<string>(SAMPLE_TEXT);
  const [hits, setHits] = useState<VerifiedHit[] | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async (): Promise<void> => {
    setChecking(true);
    setHits(await verify(text));
    setChecking(false);
  };

  return (
    <section className="screen">
      <h2>{t('skillTitle')}</h2>
      <p className="small muted">{t('skillIntro')}</p>
      <ol className="skill-rules">
        <li>{t('skillStep1')}</li>
        <li>{t('skillStep2')}</li>
        <li>{t('skillStep3')}</li>
      </ol>
      <label className="field-label" htmlFor="skill-text">
        {t('skillField')}
      </label>
      <textarea id="skill-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <p>
        <button className="action" type="button" onClick={() => void run()} disabled={checking}>
          {checking ? '…' : t('skillVerify')}
        </button>
      </p>
      <div aria-live="polite">
        {hits !== null && hits.length === 0 && <p className="badge state">{t('skillClean')}</p>}
        {hits !== null && hits.length > 0 && (
          <>
            <HitTable hits={hits} />
            <p className="tool-note">{t('skillSuggestion')}</p>
          </>
        )}
      </div>
      <p className="small muted">{t('skillGap')}</p>
    </section>
  );
}
