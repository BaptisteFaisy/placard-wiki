// Réglages d'espace (§18 écran 5, PW-24) — familles actives, seuils,
// exclusions, politique de purge, mode démo. Tout est modifiable LOCALEMENT
// (état React remonté dans App) ; l'effet est visible sur le registre, qui
// filtre ses lignes via `settingsAllow` (data/settings.ts).

import { useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { SpaceSettings, WikiFamily } from '@placard-wiki/domain';
import { ALL_FAMILIES } from '../data/settings.js';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';

/** Cases des familles actives — 11 identifiants pour 12 numéros (§7). */
function FamiliesField({
  enabled,
  onToggle,
}: {
  enabled: readonly WikiFamily[];
  onToggle: (family: WikiFamily) => void;
}): JSX.Element {
  const { t, pick } = useLang();
  return (
    <fieldset>
      <legend>{t('setFamilies')}</legend>
      <div className="families-grid">
        {ALL_FAMILIES.map((family) => (
          <label key={family} className="family-toggle">
            <input type="checkbox" checked={enabled.includes(family)} onChange={() => onToggle(family)} />
            {pick(FAMILY_LABELS[family])}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Liste des exclusions + formulaire d'ajout (raison obligatoire). */
function ExclusionsField({
  exclusions,
  onAdd,
  onRemove,
}: {
  exclusions: SpaceSettings['exclusions'];
  onAdd: (fingerprint: string, reason: string) => void;
  onRemove: (index: number) => void;
}): JSX.Element {
  const { t } = useLang();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const add = (): void => {
    onAdd(value.trim(), reason.trim());
    setValue('');
    setReason('');
  };
  return (
    <fieldset>
      <legend>{t('setExclusions')}</legend>
      {exclusions.length === 0 && <p className="muted small">{t('setNoExclusion')}</p>}
      <ul className="exclusions-list">
        {exclusions.map((exclusion, index) => (
          <li key={`${exclusion.fingerprint ?? exclusion.pattern ?? 'x'}-${String(index)}`}>
            <code>{exclusion.fingerprint ? `${exclusion.fingerprint.slice(0, 12)}…` : exclusion.pattern}</code> —{' '}
            {exclusion.reason}
            <button className="link-btn" type="button" onClick={() => onRemove(index)}>
              {t('setRemove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="exclusion-form">
        <label>
          {t('setExclusionValue')}
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          {t('setExclusionReason')}
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="action" type="button" disabled={value.trim() === '' || reason.trim() === ''} onClick={add}>
          {t('setExclusionAdd')}
        </button>
      </div>
    </fieldset>
  );
}

/** Politique de purge : deux issues honnêtes (§9, étape 3). */
function PurgeField({ value, onChange }: { value: SpaceSettings['purgePolicy']; onChange: (v: SpaceSettings['purgePolicy']) => void }): JSX.Element {
  const { t } = useLang();
  return (
    <fieldset>
      <legend>{t('setPurge')}</legend>
      <label>
        <input type="radio" name="purge-policy" checked={value === 'request-admin'} onChange={() => onChange('request-admin')} />{' '}
        {t('setPurgeAdmin')}
      </label>
      <label>
        <input type="radio" name="purge-policy" checked={value === 'api-if-possible'} onChange={() => onChange('api-if-possible')} />{' '}
        {t('setPurgeApi')}
      </label>
    </fieldset>
  );
}

/** Seuils, propriétaire par défaut et mode démo — champs simples. */
function MiscFields({ working, patch }: { working: SpaceSettings; patch: (p: Partial<SpaceSettings>) => void }): JSX.Element {
  const { t } = useLang();
  return (
    <>
      <label className="threshold-field">
        {t('setThreshold')}
        <input
          type="number"
          min={0}
          max={100}
          value={working.minScore}
          onChange={(e) => patch({ minScore: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
        />
      </label>
      <label className="threshold-field">
        {t('setDefaultOwner')}
        <input type="text" value={working.defaultOwnerRef ?? ''} onChange={(e) => patch({ defaultOwnerRef: e.target.value })} />
      </label>
      <label className="family-toggle">
        <input type="checkbox" checked={working.demoMode} onChange={(e) => patch({ demoMode: e.target.checked })} />
        {t('setDemoMode')}
      </label>
    </>
  );
}

/** Sélecteur d'espace — réinitialise le brouillon à chaque changement. */
function SpacePicker({ spaceKey, onChange, spaces }: { spaceKey: string; onChange: (key: string) => void; spaces: readonly { key: string; fr: string; en: string }[] }): JSX.Element {
  const { t, pick } = useLang();
  return (
    <>
      <label className="field-label" htmlFor="settings-space">
        {t('setSpace')}
      </label>
      <select id="settings-space" value={spaceKey} onChange={(e) => onChange(e.target.value)}>
        {spaces.map((space) => (
          <option key={space.key} value={space.key}>
            {space.key} — {pick(space)}
          </option>
        ))}
      </select>
    </>
  );
}

/** Tous les champs de réglage, regroupés. */
function SettingsForm({ working, patch }: { working: SpaceSettings; patch: (p: Partial<SpaceSettings>) => void }): JSX.Element {
  return (
    <div className="settings-form">
      <FamiliesField
        enabled={working.familiesEnabled}
        onToggle={(family) =>
          patch({
            familiesEnabled: working.familiesEnabled.includes(family)
              ? working.familiesEnabled.filter((f) => f !== family)
              : [...working.familiesEnabled, family],
          })
        }
      />
      <MiscFields working={working} patch={patch} />
      <ExclusionsField
        exclusions={working.exclusions}
        onAdd={(fingerprint, reason) => patch({ exclusions: [...working.exclusions, { fingerprint, reason }] })}
        onRemove={(index) => patch({ exclusions: working.exclusions.filter((_, i) => i !== index) })}
      />
      <PurgeField value={working.purgePolicy} onChange={(purgePolicy) => patch({ purgePolicy })} />
    </div>
  );
}

/** Barre d'enregistrement local + confirmation. */
function SaveBar({ saved, onSave, onGotoRegister }: { saved: boolean; onSave: () => void; onGotoRegister: () => void }): JSX.Element {
  const { t } = useLang();
  return (
    <>
      <p>
        <button className="action primary" type="button" onClick={onSave}>
          {t('setSave')}
        </button>{' '}
        <button className="action" type="button" onClick={onGotoRegister}>
          {t('setGotoRegister')}
        </button>
      </p>
      {saved && (
        <p className="badge state" role="status">
          {t('setSaved')}
        </p>
      )}
    </>
  );
}

interface SettingsScreenProps {
  settings: Record<string, SpaceSettings>;
  setSettings: (settings: Record<string, SpaceSettings>) => void;
  onGotoRegister: () => void;
}

export function SpaceSettingsScreen(props: SettingsScreenProps): JSX.Element {
  const { t } = useLang();
  const { dataset } = usePlacardData();
  const spaces = dataset.spaces;
  const [chosen, setChosen] = useState<string>('');
  const spaceKey = spaces.some((space) => space.key === chosen) ? chosen : spaces[0]?.key ?? '';
  const current = props.settings[spaceKey];
  const [draft, setDraft] = useState<SpaceSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const working = draft ?? current;

  const patch = (changes: Partial<SpaceSettings>): void => {
    if (!working) return;
    setDraft({ ...working, ...changes });
    setSaved(false);
  };

  const save = (): void => {
    if (!working) return;
    props.setSettings({ ...props.settings, [spaceKey]: working });
    setDraft(null);
    setSaved(true);
  };

  const pickSpace = (key: string): void => {
    setChosen(key);
    setDraft(null);
    setSaved(false);
  };

  if (!working) return <p>{t('noFoyer')}</p>;

  return (
    <section className="screen">
      <h2>{t('setTitle')}</h2>
      <p className="small muted">{t('setIntro')}</p>
      <SpacePicker spaceKey={spaceKey} onChange={pickSpace} spaces={spaces} />
      <SettingsForm working={working} patch={patch} />
      <SaveBar saved={saved} onSave={save} onGotoRegister={props.onGotoRegister} />
    </section>
  );
}
