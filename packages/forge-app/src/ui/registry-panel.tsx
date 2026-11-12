/**
 * Le registre (cahier §10, §18.1, PW-15) : la vue tableau, équivalent exact du
 * bâtiment — même information, accessible. Table triable (DynamicTable pose
 * `aria-sort` sur les colonnes triables) et filtrable (espace, famille, état,
 * score minimum). Navigation clavier native, contraste AA via les tokens.
 *
 * Règle : zéro valeur brute. On n'affiche que l'empreinte de foyer, l'aperçu
 * masqué (`AKIA…(20)`) et des scores — les types du domaine le garantissent.
 */

import { Badge, Code, DynamicTable, Heading, Inline, Stack, Text } from '@forge/react';
import type { DynamicTableProps } from '@forge/react';
import {
  FAMILY_LABELS,
  OWNER_METHOD_LABELS,
  SHARING_LABELS,
  type FoyerState,
  type OwnerMethod,
  type RegistryRow,
  type SharingState,
  type WikiFamily,
} from '@placard-wiki/domain';
import { callBridge, outcomeNote } from './bridge';
import { FilterRange, FilterSelect, FilterText, type SelectOption } from './form-controls';
import { useI18n, type Lang } from './i18n';
import { EmptyNotice, Loading, ScoreLozenge, StateLozenge } from './widgets';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

type Head = NonNullable<DynamicTableProps['head']>;
type Rows = NonNullable<DynamicTableProps['rows']>;

/** L'état des filtres du registre. */
interface Filters {
  space: string;
  family: string;
  state: string;
  minScore: number;
}

const EMPTY_FILTERS: Filters = { space: '', family: '', state: '', minScore: 0 };

/** Les états de foyer, dans l'ordre du rituel (§9). */
const FOYER_STATES: readonly FoyerState[] = [
  'open', 'rotation-attested', 'redacted', 'purge-requested',
  'purged', 'purge-impossible', 'sealed', 'dismissed',
];

/** Libellé bilingue d'une famille, avec repli sur l'identifiant brut. */
function familyLabel(family: WikiFamily, lang: Lang): string {
  const entry = FAMILY_LABELS[family];
  return entry ? entry[lang] : family;
}

/** Libellé bilingue d'un partage (la ligne porte une chaîne libre). */
function sharingLabel(sharing: string, lang: Lang): string {
  const entry = SHARING_LABELS[sharing as SharingState];
  return entry ? entry[lang] : sharing;
}

/** Libellé bilingue d'une méthode de propriétaire (§12). */
function ownerLabel(row: RegistryRow, lang: Lang): string {
  if (!row.ownerRef) return '—';
  const entry = OWNER_METHOD_LABELS[row.ownerMethod as OwnerMethod];
  return entry ? row.ownerRef + ' · ' + entry[lang] : row.ownerRef;
}

/** Options du filtre « famille », libellées dans la langue courante. */
function familyOptions(lang: Lang): SelectOption[] {
  return (Object.keys(FAMILY_LABELS) as WikiFamily[]).map((f) => ({
    label: FAMILY_LABELS[f][lang],
    value: f,
  }));
}

/** Options du filtre « état », libellées via le dictionnaire. */
function stateOptions(t: (k: string) => string): SelectOption[] {
  return FOYER_STATES.map((s) => ({ label: t('state.' + s), value: s }));
}

/** Filtrage client : espace (contient), famille, état, score minimum. */
function applyFilters(rows: RegistryRow[], f: Filters): RegistryRow[] {
  const space = f.space.trim().toLowerCase();
  return rows.filter((r) => {
    if (space && !r.spaceKey.toLowerCase().includes(space)) return false;
    if (f.family && r.family !== f.family) return false;
    if (f.state && r.state !== f.state) return false;
    return r.score >= f.minScore;
  });
}

/** En-têtes du registre : chaque colonne triable porte sa clé de tri. */
function buildHead(t: (k: string) => string): Head {
  const col = (key: string, labelKey: string, width: number) => ({
    content: t(labelKey),
    key,
    isSortable: true,
    width,
  });
  return {
    cells: [
      col('space', 'registry.col.space', 8),
      col('page', 'registry.col.page', 16),
      col('family', 'registry.col.family', 13),
      col('preview', 'registry.col.preview', 11),
      col('score', 'registry.col.score', 6),
      col('state', 'registry.col.state', 11),
      col('locations', 'registry.col.locations', 6),
      col('readers', 'registry.col.readers', 8),
      col('sharing', 'registry.col.sharing', 11),
      col('ai', 'registry.col.ai', 8),
      col('owner', 'registry.col.owner', 12),
      col('lastSeen', 'registry.col.lastSeen', 10),
    ],
  };
}

/** Une ligne du registre : cellules dans l'ordre des en-têtes, clés de tri. */
function toTableRow(row: RegistryRow, lang: Lang, t: (k: string) => string): Rows[number] {
  const cell = (key: string | number, content: ReactNode) => ({ key, content });
  return {
    key: row.foyerId,
    cells: [
      cell(row.spaceKey, <Text>{row.spaceKey}</Text>),
      cell(row.pageTitle, <Text>{row.pageTitle}</Text>),
      cell(row.family, <Text>{familyLabel(row.family, lang)}</Text>),
      cell(row.maskedPreview, <Code>{row.maskedPreview}</Code>),
      cell(row.score, <ScoreLozenge score={row.score} />),
      cell(row.state, <StateLozenge state={row.state} />),
      cell(row.locationCount, <Badge>{row.locationCount}</Badge>),
      cell(row.readersHigh, <Text>{row.readersLow + '–' + row.readersHigh}</Text>),
      cell(row.sharing, <Text>{sharingLabel(row.sharing, lang)}</Text>),
      cell(row.aiSurface ? 1 : 0, <Text>{row.aiSurface ? t('registry.ai.yes') : t('registry.ai.no')}</Text>),
      cell(row.ownerRef ?? '', <Text>{ownerLabel(row, lang)}</Text>),
      cell(row.lastSeenAt, <Text>{row.lastSeenAt}</Text>),
    ],
  };
}

/** Le registre : charge les foyers, filtre, affiche la table triable. */
export function RegistryPanel(): JSX.Element {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<RegistryRow[] | null>(null);
  const [note, setNote] = useState<{ title: string; body: string } | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    let alive = true;
    void callBridge('registry/list', { limit: 500, sort: 'score' }).then((outcome) => {
      if (!alive) return;
      if (outcome.kind === 'ok') {
        setRows(outcome.data.rows);
        setNote(null);
      } else {
        setRows(null);
        setNote(outcomeNote(outcome));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(
    () => (rows ? applyFilters(rows, filters) : []),
    [rows, filters],
  );

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]): void =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('global.tab.registry')}</Heading>
      <RegistryFilters filters={filters} setFilter={setFilter} lang={lang} t={t} />
      <Text>{t('registry.sortHint')}</Text>
      {note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note.title })} />
      ) : rows === null ? (
        <Loading label={t('common.loading')} />
      ) : (
        <RegistryTable rows={visible} lang={lang} t={t} caption={t('registry.caption')} />
      )}
      {rows !== null && !note ? (
        <Text>{t('registry.rows', { n: visible.length })}</Text>
      ) : null}
    </Stack>
  );
}

/** Les quatre filtres du registre (espace, famille, état, score minimum). */
function RegistryFilters({
  filters,
  setFilter,
  lang,
  t,
}: {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element {
  return (
    <Inline space="space.200" shouldWrap>
      <FilterText
        id="reg-space"
        label={t('registry.filter.space')}
        value={filters.space}
        onChange={(v) => setFilter('space', v)}
        placeholder={t('registry.filter.any')}
      />
      <FilterSelect
        id="reg-family"
        label={t('registry.filter.family')}
        options={familyOptions(lang)}
        value={filters.family}
        onChange={(v) => setFilter('family', v)}
        placeholder={t('registry.filter.any')}
      />
      <FilterSelect
        id="reg-state"
        label={t('registry.filter.state')}
        options={stateOptions(t)}
        value={filters.state}
        onChange={(v) => setFilter('state', v)}
        placeholder={t('registry.filter.any')}
      />
      <FilterRange
        id="reg-minscore"
        label={t('registry.filter.minScore')}
        value={filters.minScore}
        min={0}
        max={100}
        step={5}
        onChange={(v) => setFilter('minScore', v)}
      />
    </Inline>
  );
}

/** La table triable : `aria-sort` posé par DynamicTable sur les colonnes. */
function RegistryTable({
  rows,
  lang,
  t,
  caption,
}: {
  rows: RegistryRow[];
  lang: Lang;
  t: (k: string) => string;
  caption: string;
}): JSX.Element {
  const tableRows: Rows = rows.map((r) => toTableRow(r, lang, t));
  return (
    <DynamicTable
      head={buildHead(t)}
      rows={tableRows}
      caption={caption}
      defaultSortKey="score"
      defaultSortOrder="DESC"
      rowsPerPage={20}
      emptyView={<Text>{t('empty.noData.body')}</Text>}
    />
  );
}
