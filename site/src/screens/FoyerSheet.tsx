// Fiche de foyer (§8, §18 écran 4) : emplacements avec gîte, TOUS les termes
// du score et leurs méthodes, exposition et méthode, surface IA, historique.

import {
  OWNER_METHOD_LABELS,
  REMEDIATION_COST_METHOD,
  RITUAL_STEP_LABELS,
  SCORE_TERMS,
  SCORE_TERM_BY_ID,
  SHARING_LABELS,
} from '@placard-wiki/domain';
import type { AppliedScoreTerm, Foyer, OwnerResolution, PageExposure, ScoreTermId } from '@placard-wiki/domain';
import { EXPOSURES, FOYERS, OWNERS, RITUALS, remediationHours } from '../data/demo.js';
import { useLang } from '../i18n.js';
import { DangerBadge, FamilyLabel, GiteLabel, StateBadge, formatDate } from '../ui.js';

/** Libellé d'un état de partage, dans la langue courante. */
function sharingLabel(sharing: string, pick: (b: { fr: string; en: string }) => string): string {
  const entry = SHARING_LABELS[sharing as keyof typeof SHARING_LABELS];
  return entry ? pick(entry) : sharing;
}

interface SheetProps {
  foyer: Foyer;
  onSelectFoyer: (id: string) => void;
}

export function FoyerSheetScreen({ foyer, onSelectFoyer }: SheetProps): JSX.Element {
  const { t, pick } = useLang();
  const exposure = foyer.primaryPageId ? EXPOSURES[foyer.primaryPageId] : undefined;
  const owner = foyer.primaryPageId ? OWNERS[foyer.primaryPageId] : undefined;
  const ritual = RITUALS[foyer.id] ?? [];

  return (
    <section className="screen">
      <h2>{t('tabFoyer')}</h2>
      <p>
        <label>
          {t('tabFoyer')} :{' '}
          <select value={foyer.id} onChange={(e) => onSelectFoyer(e.target.value)}>
            {Object.values(FOYERS).map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} — {f.family}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <FamilyLabel family={foyer.family} /> — <StateBadge state={foyer.state} /> <DangerBadge score={foyer.score} />
      </p>
      {foyer.state === 'dismissed' && <DismissedNote foyer={foyer} />}
      <LocationList foyer={foyer} />
      <TermsList foyer={foyer} />
      <TermCatalogue foyer={foyer} />
      {exposure && (
        <ExposureSection exposure={exposure} owner={owner} sharingText={sharingLabel(exposure.sharing, pick)} />
      )}
      <RemediationSection foyer={foyer} exposure={exposure} />
      <RitualHistory ritual={ritual} />
    </section>
  );
}

/** Ruban : raison écrite (jamais vide) et date de revalidation (§9, §24). */
function DismissedNote({ foyer }: { foyer: Foyer }): JSX.Element {
  const { t, lang } = useLang();
  return (
    <p className="refusal small" role="note">
      <strong>{t('dismissedReason')}:</strong> {foyer.dismissedReason}
      {foyer.dismissedReviewAt && (
        <>
          <br />
          {t('dismissedReview')} {formatDate(foyer.dismissedReviewAt, lang)}
        </>
      )}
    </p>
  );
}

/** Emplacements : le même foyer, N endroits, chacun avec son gîte et son aperçu. */
function LocationList({ foyer }: { foyer: Foyer }): JSX.Element {
  const { t, lang } = useLang();
  return (
    <section>
      <h3>{t('foyerLocations')}</h3>
      <ul className="locations">
        {foyer.locations.map((loc) => (
          <li key={loc.id}>
            <strong>
              <GiteLabel gite={loc.gite} />
            </strong>{' '}
            <code>{loc.maskedPreview}</code> · {loc.containerType}
            {loc.versionNumber !== undefined && ` · ${t('historyVersion').replace('{v}', String(loc.versionNumber))}`}
            <br />
            <span className="small muted">
              {t('stateLabel')}: {statusLabel(loc.status, t)} · {formatDate(loc.detectedAt, lang)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Libellé de statut d'un emplacement. */
function statusLabel(status: 'present' | 'redacted' | 'vanished', t: (k: 'locPresent' | 'locRedacted' | 'locVanished') => string): string {
  return t(status === 'present' ? 'locPresent' : status === 'redacted' ? 'locRedacted' : 'locVanished');
}

/** Termes appliqués au score : points + méthode + preuve (§8). */
function TermsList({ foyer }: { foyer: Foyer }): JSX.Element {
  const { t, pick } = useLang();
  return (
    <section>
      <h3>{t('foyerTerms')}</h3>
      <dl className="terms">
        {foyer.scoreTerms.map((term) => (
          <TermRow key={term.id} term={term} pick={pick} />
        ))}
      </dl>
    </section>
  );
}

/** Une ligne de terme : libellé, points, méthode, preuve. */
function TermRow({ term, pick }: { term: AppliedScoreTerm; pick: (b: { fr: string; en: string }) => string }): JSX.Element {
  const spec = SCORE_TERM_BY_ID.get(term.id as ScoreTermId);
  const label = spec ? pick(spec) : term.label;
  const method = spec ? pick({ fr: spec.methodFr, en: spec.methodEn }) : term.method;
  return (
    <>
      <dt>
        {label} ({term.points >= 0 ? '+' : ''}{term.points})
      </dt>
      <dd>
        <span className="muted small">{method}</span>
        {term.evidence && <span className="small"> · {term.evidence}</span>}
      </dd>
    </>
  );
}

/** Catalogue complet des termes du score, appliqués ou non. */
function TermCatalogue({ foyer }: { foyer: Foyer }): JSX.Element {
  const { t, pick } = useLang();
  const applied = new Map(foyer.scoreTerms.map((a) => [a.id, a.points]));
  return (
    <details>
      <summary>{t('foyerAllTerms')}</summary>
      <ul className="small">
        {SCORE_TERMS.map((term) => {
          const pts = applied.get(term.id as ScoreTermId);
          return (
            <li key={term.id}>
              <strong>{pick(term)}</strong> ({term.points === null ? '—' : `${term.points >= 0 ? '+' : ''}${term.points}`}) —{' '}
              <span className="muted">{pick({ fr: term.methodFr, en: term.methodEn })}</span>
              {pts !== undefined && ` — ${t('applied')} ${pts > 0 ? '+' : ''}${pts}`}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Exposition : fourchette avec méthode, partage, restrictions, surface IA (§8, §13). */
function ExposureSection(props: {
  exposure: PageExposure;
  owner: OwnerResolution | undefined;
  sharingText: string;
}): JSX.Element {
  const { t, pick } = useLang();
  const { exposure, owner, sharingText } = props;
  return (
    <section>
      <h3>{t('foyerExposure')}</h3>
      <p>
        {exposure.readers.low} – {exposure.readers.high} · {sharingText}
      </p>
      <p className="small muted">{exposure.readers.method}</p>
      {exposure.readers.caveats.length > 0 && (
        <ul className="small muted">
          {exposure.readers.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <p className="small">
        <strong>{t('foyerAi')}:</strong>{' '}
        {exposure.aiSurface.presumedIndexed ? t('aiIndexed') : t('aiNotIndexed')} —{' '}
        <span className="muted">{exposure.aiSurface.method}</span>
      </p>
      {owner && (
        <p className="small">
          <strong>{t('ownerMethod')}:</strong>{' '}
          {owner.method ? pick(OWNER_METHOD_LABELS[owner.method]) : t('orphanOwner')}
          {owner.ownerRef && ` (${owner.ownerRef})`}
        </p>
      )}
    </section>
  );
}

/** Coût de remise en état : fourchette en heures, méthode affichée (§8). */
function RemediationSection({ foyer, exposure }: { foyer: Foyer; exposure: PageExposure | undefined }): JSX.Element {
  const { t, pick } = useLang();
  const cost = remediationHours(foyer.family);
  return (
    <section>
      <h3>{t('foyerRemediation')}</h3>
      <p>
        {cost.low} – {cost.high} h · <span className="muted">{pick(REMEDIATION_COST_METHOD)}</span>
      </p>
    </section>
  );
}

/** Historique du rituel : étapes et leurs états, horodatées. */
function RitualHistory({ ritual }: { ritual: Array<{ step: string; state: string; at?: string }> }): JSX.Element {
  const { t, pick, lang } = useLang();
  return (
    <section>
      <h3>{t('foyerRitualHistory')}</h3>
      {ritual.length === 0 && <p className="muted small">—</p>}
      <ul className="small">
        {ritual.map((step) => {
          const spec = RITUAL_STEP_LABELS[step.step as keyof typeof RITUAL_STEP_LABELS];
          return (
            <li key={step.step}>
              {spec ? pick(spec) : step.step}: {step.state}
              {step.at && ` · ${formatDate(step.at, lang)}`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}