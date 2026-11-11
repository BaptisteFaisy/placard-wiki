// Rituel en démo LOCALE (§9, §27) : 5 étapes dans l'ordre, avec verrous.
// État local uniquement — aucun backend. Le caviardage reste verrouillé tant
// qu'une PERSONNE n'a pas attesté la rotation ; un agent est refusé (§17).

import { useState } from 'react';
import { RITUAL_STEP_LABELS } from '@placard-wiki/domain';
import type { Foyer } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import { DangerBadge } from '../ui.js';

type Actor = 'human' | 'agent';
type PurgeChoice = 'none' | 'requested' | 'impossible';

interface RitualState {
  actor: Actor;
  attested: boolean;
  redacted: boolean;
  purge: PurgeChoice;
  prevented: boolean;
  sealed: boolean;
  refusal: boolean;
}

const INITIAL: RitualState = {
  actor: 'human',
  attested: false,
  redacted: false,
  purge: 'none',
  prevented: false,
  sealed: false,
  refusal: false,
};

interface RitualProps {
  foyer: Foyer;
}

export function RitualScreen({ foyer }: RitualProps): JSX.Element {
  const { t } = useLang();
  const [state, setState] = useState<RitualState>(INITIAL);
  const set = (patch: Partial<RitualState>): void => setState((s) => ({ ...s, ...patch }));

  const attest = (): void => {
    if (state.actor === 'agent') {
      set({ refusal: true });
      return;
    }
    set({ refusal: false, attested: true });
  };

  return (
    <section className="screen">
      <h2>{t('ritualTitle')}</h2>
      <p>
        {t('foyerTerms')}: <DangerBadge score={foyer.score} /> · {foyer.id} — {foyer.family}
      </p>
      <p className="muted small">{t('ritualIntro')}</p>
      <label className="muted small">
        {t('actorLabel')}
        <select
          value={state.actor}
          onChange={(e) => set({ actor: e.target.value as Actor, refusal: false })}
        >
          <option value="human">{t('actorHuman')}</option>
          <option value="agent">{t('actorAgent')}</option>
        </select>
      </label>
      <ol className="ritual">
        <StepRotate state={state} onAttest={attest} />
        <StepRedact state={state} onRedact={() => set({ redacted: true })} />
        <StepPurge state={state} onPurge={(p) => set({ purge: p })} />
        <StepPrevent state={state} onPrevent={() => set({ prevented: true })} />
        <StepVerify state={state} onSeal={() => set({ sealed: true })} />
      </ol>
      {state.refusal && <p className="refusal" role="alert">{t('agentRefusal')}</p>}
      {state.sealed && <p className="badge state">{t('stateSealed')} 🔏</p>}
      <button className="action" type="button" onClick={() => setState(INITIAL)}>
        {t('resetBtn')}
      </button>
    </section>
  );
}

/** Étape 1 — tourner : attestation humaine requise. */
function StepRotate({ state, onAttest }: { state: RitualState; onAttest: () => void }): JSX.Element {
  const { t, pick } = useLang();
  return (
    <li data-state={state.attested ? 'done' : 'pending'}>
      {pick(RITUAL_STEP_LABELS.rotate)} — {t('rotateNote')}
      <br />
      <button className="action" type="button" disabled={state.attested} onClick={onAttest}>
        {t('attestBtn')}
      </button>
      {state.attested && <span className="badge state"> {t('done')}</span>}
    </li>
  );
}

/** Étape 2 — caviarder : verrouillée sans attestation humaine. */
function StepRedact({ state, onRedact }: { state: RitualState; onRedact: () => void }): JSX.Element {
  const { t, pick } = useLang();
  const locked = !state.attested;
  return (
    <li data-state={state.redacted ? 'done' : locked ? 'locked' : 'pending'}>
      {pick(RITUAL_STEP_LABELS.redact)} — {t('redactNote')}
      <br />
      <button className="action" type="button" disabled={locked || state.redacted} onClick={onRedact}>
        {t('redactBtn')}
      </button>
      {locked && <span className="muted small"> {t('locked')}</span>}
      {state.redacted && <span className="badge state"> {t('done')}</span>}
    </li>
  );
}

/** Étape 3 — purger l'historique : l'étape honnête, deux issues affichées. */
function StepPurge({ state, onPurge }: { state: RitualState; onPurge: (p: PurgeChoice) => void }): JSX.Element {
  const { t, pick } = useLang();
  const locked = !state.redacted;
  return (
    <li data-state={state.purge === 'impossible' ? 'impossible' : state.purge !== 'none' ? 'done' : locked ? 'locked' : 'pending'}>
      {pick(RITUAL_STEP_LABELS.purge)} — {t('purgeNote')}
      <br />
      <button className="action" type="button" disabled={locked || state.purge !== 'none'} onClick={() => onPurge('requested')}>
        {t('purgeBtn')}
      </button>{' '}
      <button className="action" type="button" disabled={locked || state.purge !== 'none'} onClick={() => onPurge('impossible')}>
        {t('purgeImpossibleBtn')}
      </button>
      {state.purge === 'impossible' && <span className="badge danger-mid"> {t('statePurgeImpossible')}</span>}
      {locked && <span className="muted small"> {t('locked')}</span>}
    </li>
  );
}

/** Étape 4 — empêcher : bannière temps réel vers l'auteur. */
function StepPrevent({ state, onPrevent }: { state: RitualState; onPrevent: () => void }): JSX.Element {
  const { t, pick } = useLang();
  const locked = state.purge === 'none';
  return (
    <li data-state={state.prevented ? 'done' : locked ? 'locked' : 'pending'}>
      {pick(RITUAL_STEP_LABELS.prevent)} — {t('preventNote').replace('{score}', '74')}
      <br />
      <button className="action" type="button" disabled={locked || state.prevented} onClick={onPrevent}>
        {t('tabRitual')}
      </button>
      {locked && <span className="muted small"> {t('locked')}</span>}
      {state.prevented && <span className="badge state"> {t('done')}</span>}
    </li>
  );
}

/** Étape 5 — vérifier : re-balayage et sceau de cire. */
function StepVerify({ state, onSeal }: { state: RitualState; onSeal: () => void }): JSX.Element {
  const { t, pick } = useLang();
  const locked = !state.prevented;
  return (
    <li data-state={state.sealed ? 'done' : locked ? 'locked' : 'pending'}>
      {pick(RITUAL_STEP_LABELS.verify)} — {t('verifyNote')}
      <br />
      <button className="action" type="button" disabled={locked || state.sealed} onClick={onSeal}>
        {t('verifyBtn')}
      </button>
      {locked && <span className="muted small"> {t('locked')}</span>}
    </li>
  );
}