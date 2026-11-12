/**
 * Réglages d'espace (cahier §18.5, PW-24) : familles de détection actives,
 * seuil d'alerte, exclusions avec raison écrite, politique de purge,
 * propriétaire par défaut, mode démonstration.
 *
 * Méthodes du bridge : `settings/get` (chargement) et `settings/save`
 * (enregistrement, au nom de la personne connectée). Aucune valeur brute :
 * une exclusion porte une empreinte ou un motif, jamais le secret.
 */

import { Button, Heading, Inline, SectionMessage, Stack, Text } from '@forge/react';
import { FAMILY_LABELS, type SpaceSettings as SpaceSettingsData, type WikiFamily } from '@placard-wiki/domain';
import { callBridge } from './bridge.js';
import { useAccountId, useSpaceKey } from './context.js';
import { FilterRange, FilterSelect, FilterText, FilterToggle, type SelectOption } from './form-controls.js';
import { useI18n, type Lang } from './i18n.js';
import { EmptyNotice, Loading } from './widgets.js';
import { useCallback, useEffect, useState } from 'react';

/** Une exclusion en cours de saisie : motif + raison (raison obligatoire). */
interface ExclusionDraft {
  pattern: string;
  reason: string;
}

const EMPTY_EXCLUSION: ExclusionDraft = { pattern: '', reason: '' };

/** L'API du brouillon de réglages (état + mutations + sauvegarde). */
interface SettingsDraftApi {
  draft: SpaceSettingsData | null;
  note: string | null;
  saved: boolean;
  patch: (change: Partial<SpaceSettingsData>) => void;
  toggleFamily: (family: WikiFamily, checked: boolean) => void;
  addExclusion: (pattern: string, reason: string) => void;
  removeExclusion: (index: number) => void;
  save: () => void;
}

/** Charge les réglages d'un espace ; renvoie le cleanup d'effet. */
function loadSettings(
  spaceKey: string,
  onLoaded: (draft: SpaceSettingsData | null, note: string | null) => void,
): () => void {
  if (!spaceKey) return () => {};
  let alive = true;
  void callBridge('settings/get', { spaceKey }).then((outcome) => {
    if (!alive) return;
    if (outcome.kind === 'ok') onLoaded(outcome.data, null);
    else onLoaded(null, outcome.method);
  });
  return () => {
    alive = false;
  };
}

/** Charge les réglages de l'espace et expose les mutations du brouillon. */
function useSettingsDraft(spaceKey: string, accountId: string): SettingsDraftApi {
  const [draft, setDraft] = useState<SpaceSettingsData | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(
    () => loadSettings(spaceKey, (d, n) => { setDraft(d); setNote(n); }),
    [spaceKey],
  );

  const patch = useCallback(
    (change: Partial<SpaceSettingsData>) => setDraft((prev) => (prev ? { ...prev, ...change } : prev)),
    [],
  );

  const toggleFamily = useCallback((family: WikiFamily, checked: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = checked
        ? [...prev.familiesEnabled, family]
        : prev.familiesEnabled.filter((f) => f !== family);
      return { ...prev, familiesEnabled: next };
    });
  }, []);

  const addExclusion = useCallback((pattern: string, reason: string) => {
    setDraft((prev) => (prev ? { ...prev, exclusions: [...prev.exclusions, { pattern, reason }] } : prev));
  }, []);

  const removeExclusion = useCallback((index: number) => {
    setDraft((prev) => (prev ? { ...prev, exclusions: prev.exclusions.filter((_, i) => i !== index) } : prev));
  }, []);

  const save = useCallback(() => {
    if (!draft) return;
    setSaved(false);
    void callBridge('settings/save', { settings: draft, actorRef: accountId }).then((outcome) => {
      setSaved(outcome.kind === 'ok');
      if (outcome.kind !== 'ok') setNote(outcome.method);
    });
  }, [draft, accountId]);

  return { draft, note, saved, patch, toggleFamily, addExclusion, removeExclusion, save };
}

/** Les onze familles, en interrupteurs étiquetés (§7). */
function FamilyToggles({
  enabled,
  onToggle,
  lang,
}: {
  enabled: WikiFamily[];
  onToggle: (family: WikiFamily, checked: boolean) => void;
  lang: Lang;
}): JSX.Element {
  const families = Object.keys(FAMILY_LABELS) as WikiFamily[];
  return (
    <Stack space="space.050">
      {families.map((family) => (
        <FilterToggle
          key={family}
          id={'fam-' + family}
          label={FAMILY_LABELS[family][lang]}
          isChecked={enabled.includes(family)}
          onChange={(checked) => onToggle(family, checked)}
        />
      ))}
    </Stack>
  );
}

/** Les exclusions déjà posées : empreinte/motif + raison, avec retrait. */
function ExclusionList({
  exclusions,
  onRemove,
  t,
}: {
  exclusions: SpaceSettingsData['exclusions'];
  onRemove: (index: number) => void;
  t: (k: string) => string;
}): JSX.Element {
  if (exclusions.length === 0) return <Text>{t('settings.exclusions.empty')}</Text>;
  return (
    <Stack space="space.050">
      {exclusions.map((exclusion, index) => (
        <Inline key={index} space="space.100" alignBlock="center">
          <Text>{(exclusion.fingerprint ?? exclusion.pattern ?? '—') + ' — ' + exclusion.reason}</Text>
          <Button appearance="subtle" onClick={() => onRemove(index)}>
            {t('common.cancel')}
          </Button>
        </Inline>
      ))}
    </Stack>
  );
}

/** Formulaire d'ajout d'une exclusion (motif + raison, raison obligatoire). */
function ExclusionEditor({
  exclusions,
  onAdd,
  onRemove,
  t,
}: {
  exclusions: SpaceSettingsData['exclusions'];
  onAdd: (pattern: string, reason: string) => void;
  onRemove: (index: number) => void;
  t: (k: string) => string;
}): JSX.Element {
  const [draft, setDraft] = useState<ExclusionDraft>(EMPTY_EXCLUSION);
  const canAdd = draft.pattern.trim() !== '' && draft.reason.trim() !== '';
  const add = (): void => {
    if (!canAdd) return;
    onAdd(draft.pattern.trim(), draft.reason.trim());
    setDraft(EMPTY_EXCLUSION);
  };
  return (
    <Stack space="space.100">
      <ExclusionList exclusions={exclusions} onRemove={onRemove} t={t} />
      <Inline space="space.100" alignBlock="end" shouldWrap>
        <FilterText
          id="excl-pattern"
          label={t('settings.exclusion.pattern')}
          value={draft.pattern}
          onChange={(pattern) => setDraft((d) => ({ ...d, pattern }))}
        />
        <FilterText
          id="excl-reason"
          label={t('settings.exclusion.reason')}
          value={draft.reason}
          onChange={(reason) => setDraft((d) => ({ ...d, reason }))}
        />
        <Button appearance="primary" onClick={add} isDisabled={!canAdd}>
          {t('common.save')}
        </Button>
      </Inline>
    </Stack>
  );
}

/** Options de la politique de purge (§9, étape 3). */
function purgeOptions(t: (k: string) => string): SelectOption[] {
  return [
    { label: t('settings.purge.requestAdmin'), value: 'request-admin' },
    { label: t('settings.purge.apiIfPossible'), value: 'api-if-possible' },
  ];
}

/** Purge, propriétaire par défaut, mode démo, et bouton d'enregistrement. */
function SettingsControls({ api, t }: { api: SettingsDraftApi; t: (k: string) => string }): JSX.Element {
  const { draft, saved, patch, save } = api;
  if (!draft) return <Loading label={t('common.loading')} />;
  return (
    <Stack space="space.200">
      <FilterSelect
        id="purge-policy"
        label={t('settings.purgePolicy')}
        options={purgeOptions(t)}
        value={draft.purgePolicy}
        onChange={(purgePolicy) => patch({ purgePolicy: purgePolicy as SpaceSettingsData['purgePolicy'] })}
      />
      <FilterText
        id="default-owner"
        label={t('settings.defaultOwner')}
        value={draft.defaultOwnerRef ?? ''}
        onChange={(defaultOwnerRef) => patch({ defaultOwnerRef })}
      />
      <FilterToggle
        id="demo-mode"
        label={t('settings.demoMode')}
        isChecked={draft.demoMode}
        onChange={(demoMode) => patch({ demoMode })}
      />
      <Text>{t('settings.demoMode.help')}</Text>
      <Inline space="space.100" alignBlock="center">
        <Button appearance="primary" onClick={save}>
          {t('settings.save')}
        </Button>
        {saved ? <SectionMessage appearance="success">{t('common.saved')}</SectionMessage> : null}
      </Inline>
    </Stack>
  );
}

/** Le formulaire de réglages (rendu quand le brouillon est chargé). */
function SettingsForm({ api, lang, t }: { api: SettingsDraftApi; lang: Lang; t: (k: string) => string }): JSX.Element {
  const { draft, patch, toggleFamily, addExclusion, removeExclusion } = api;
  if (!draft) return <Loading label={t('common.loading')} />;
  return (
    <Stack space="space.200">
      <Stack space="space.050">
        <Heading size="small">{t('settings.families')}</Heading>
        <FamilyToggles enabled={draft.familiesEnabled} onToggle={toggleFamily} lang={lang} />
      </Stack>
      <FilterRange
        id="min-score"
        label={t('settings.minScore')}
        value={draft.minScore}
        min={0}
        max={100}
        step={5}
        onChange={(minScore) => patch({ minScore })}
      />
      <Text>{t('settings.minScore.help')}</Text>
      <Stack space="space.050">
        <Heading size="small">{t('settings.exclusions')}</Heading>
        <ExclusionEditor exclusions={draft.exclusions} onAdd={addExclusion} onRemove={removeExclusion} t={t} />
      </Stack>
      <SettingsControls api={api} t={t} />
    </Stack>
  );
}

/** Écran de réglages d'espace : contexte, chargement, formulaire. */
export default function SpaceSettings(): JSX.Element {
  const { t, lang } = useI18n();
  const spaceKey = useSpaceKey();
  const accountId = useAccountId();
  const api = useSettingsDraft(spaceKey, accountId);

  return (
    <Stack space="space.200">
      <Heading size="large">{t('settings.title')}</Heading>
      <Text>{t('settings.hint')}</Text>
      {!spaceKey ? (
        <EmptyNotice title={t('empty.noData.title')} body={t('action.noPage')} />
      ) : api.note && !api.draft ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: api.note })} />
      ) : (
        <SettingsForm api={api} lang={lang} t={t} />
      )}
    </Stack>
  );
}
