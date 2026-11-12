// Registre : table triable, filtrable, navigable au clavier, WCAG AA (§10).
// C'est exactement la même information que le bâtiment, mais accessible.
// Les réglages d'espace (onglet « Réglages d'espace », PW-24) filtrent les
// lignes : familles actives, seuil, exclusions — effet local, rien n'est envoyé.

import { useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { FoyerState, RegistryRow, SpaceSettings, WikiFamily } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import type { DictKey } from '../i18n-dict.js';
import { STATE_KEYS } from '../data/labels.js';
import { settingsAllow } from '../data/settings.js';
import { usePlacardData } from '../data/placard-data.js';
import { DangerBadge, FamilyLabel, StateBadge } from '../ui.js';

type SortKey = 'spaceKey' | 'family' | 'state' | 'score' | 'readersHigh' | 'pageTitle';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
interface Filters {
  space: string;
  family: string;
  state: string;
  minScore: number;
}

const FAMILY_LIST = Object.keys(FAMILY_LABELS) as WikiFamily[];
const STATE_LIST: FoyerState[] = ['open', 'rotation-attested', 'redacted', 'purge-requested', 'purged', 'purge-impossible', 'sealed', 'dismissed'];
const EMPTY_FILTERS: Filters = { space: '', family: '', state: '', minScore: 0 };

/** Applique les filtres (vacuité = neutre) à l'ensemble des lignes. */
function filterRows(rows: readonly RegistryRow[], f: Filters): RegistryRow[] {
  return rows.filter(
    (r) =>
      (f.space === '' || r.spaceKey === f.space) &&
      (f.family === '' || r.family === f.family) &&
      (f.state === '' || r.state === f.state) &&
      r.score >= f.minScore,
  );
}

/** Filtre les lignes selon les réglages de chaque espace (PW-24). */
function applySettings(
  rows: readonly RegistryRow[],
  settings: Record<string, SpaceSettings> | undefined,
  foyers: Record<string, { fingerprint: string }>,
): RegistryRow[] {
  if (!settings) return [...rows];
  const fpOf = (foyerId: string): string => foyers[foyerId]?.fingerprint ?? '';
  return rows.filter((row: RegistryRow) => settingsAllow(settings[row.spaceKey], row, fpOf));
}

/** Trie une copie stable des lignes selon la colonne et la direction. */
function sortRows(rows: readonly RegistryRow[], sort: SortState): RegistryRow[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[sort.key];
    const vb = b[sort.key];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

/** En-tête de colonne triable, avec aria-sort et indicateur visible. */
function HeaderCell(props: {
  col: SortKey;
  sort: SortState;
  onSort: (col: SortKey) => void;
  label: string;
}): JSX.Element {
  const active = props.sort.key === props.col;
  const arrow = active ? (props.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th scope="col" aria-sort={active ? (props.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => props.onSort(props.col)}>
        {props.label}
        <span aria-hidden="true">{arrow}</span>
      </button>
    </th>
  );
}

/** Note de réglages : registre filtré + espaces en mode démo (§15). */
function SettingsNote({ settings }: { settings: Record<string, SpaceSettings> }): JSX.Element {
  const { t } = useLang();
  const demoSpaces = Object.values(settings)
    .filter((s) => s.demoMode)
    .map((s) => s.spaceKey)
    .join(', ');
  return <p className="small muted">{t('registerSettingsNote').replace('{spaces}', demoSpaces)}</p>;
}

/** La table elle-même — mêmes colonnes qu'avant, extraites pour la lisibilité. */
function RegistryTable(props: {
  visible: RegistryRow[];
  sort: SortState;
  toggleSort: (col: SortKey) => void;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { t } = useLang();
  return (
    <table className="registry">
      <caption>
        {t('resultsCount').replace('{n}', String(props.visible.length))} · {t('sortHelp')}
      </caption>
      <thead>
        <tr>
          <HeaderCell col="spaceKey" sort={props.sort} onSort={props.toggleSort} label={t('colSpace')} />
          <HeaderCell col="pageTitle" sort={props.sort} onSort={props.toggleSort} label={t('colPage')} />
          <HeaderCell col="family" sort={props.sort} onSort={props.toggleSort} label={t('colFamily')} />
          <HeaderCell col="state" sort={props.sort} onSort={props.toggleSort} label={t('colState')} />
          <HeaderCell col="score" sort={props.sort} onSort={props.toggleSort} label={t('colScore')} />
          <th scope="col">{t('colGite')}</th>
          <HeaderCell col="readersHigh" sort={props.sort} onSort={props.toggleSort} label={t('colReaders')} />
          <th scope="col">{t('colAction')}</th>
        </tr>
      </thead>
      <tbody>
        {props.visible.length === 0 && (
          <tr>
            <td colSpan={8}>{t('noFoyer')}</td>
          </tr>
        )}
        {props.visible.map((row) => (
          <Row key={row.foyerId} row={row} onOpen={props.onOpen} />
        ))}
      </tbody>
    </table>
  );
}

interface RegisterProps {
  onOpenFoyer: (id: string) => void;
  /** Réglages d'espace partagés (onglet « Réglages d'espace ») — optionnels. */
  settings?: Record<string, SpaceSettings>;
}

export function RegisterScreen({ onOpenFoyer, settings }: RegisterProps): JSX.Element {
  const { t } = useLang();
  const { dataset } = usePlacardData();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: 'score', dir: 'desc' });
  const rows = applySettings(dataset.registryRows, settings, dataset.foyers);
  const visible = sortRows(filterRows(rows, filters), sort);
  const toggleSort = (col: SortKey): void => setSort((s) => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <section className="screen">
      <h2>{t('tabRegister')}</h2>
      <p className="small muted">{t('registerCaption')}</p>
      {settings && <SettingsNote settings={settings} />}
      <FilterBar filters={filters} setFilters={setFilters} spaces={dataset.spaces} />
      <RegistryTable visible={visible} sort={sort} toggleSort={toggleSort} onOpen={onOpenFoyer} />
    </section>
  );
}

/** Barre de filtres : espace, famille, état, score minimal. */
function FilterBar({
  filters,
  setFilters,
  spaces,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  spaces: readonly { key: string; fr: string; en: string }[];
}): JSX.Element {
  const { t, pick } = useLang();
  return (
    <div className="filter-bar" role="group" aria-label={t('filterCaption')}>
      <FilterSelect
        label={t('filterSpace')}
        value={filters.space}
        onChange={(space) => setFilters({ ...filters, space })}
        options={spaces.map((s) => ({ value: s.key, label: pick(s) }))}
        allLabel={t('filterAll')}
      />
      <FilterSelect
        label={t('filterFamily')}
        value={filters.family}
        onChange={(family) => setFilters({ ...filters, family })}
        options={FAMILY_LIST.map((f) => ({ value: f, label: pick(FAMILY_LABELS[f]) }))}
        allLabel={t('filterAll')}
      />
      <FilterSelect
        label={t('filterState')}
        value={filters.state}
        onChange={(state) => setFilters({ ...filters, state })}
        options={STATE_LIST.map((s) => ({ value: s, label: t(STATE_KEYS[s] as DictKey) }))}
        allLabel={t('filterAll')}
      />
      <label>
        {t('filterScore')}
        <input type="number" min={0} max={100} value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) || 0 })} />
      </label>
    </div>
  );
}

/** Un filtre « liste + toutes les valeurs » — même balisage pour les trois. */
function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  allLabel: string;
}): JSX.Element {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">{props.allLabel}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Ligne du registre : une cellule quand la donnée est inconnue → « — ». */
function Row({ row, onOpen }: { row: RegistryRow; onOpen: (id: string) => void }): JSX.Element {
  const { t } = useLang();
  return (
    <tr>
      <td>{row.spaceKey}</td>
      <td>{row.pageTitle}</td>
      <td>
        <FamilyLabel family={row.family} />
      </td>
      <td>
        <StateBadge state={row.state} />
      </td>
      <td>
        <DangerBadge score={row.score} />
      </td>
      <td>{row.inCurrentVersion ? t('locPresent') : row.inHistory ? t('inHistory') : '—'}</td>
      <td>{row.readersLow === 0 && row.readersHigh === 0 ? '—' : `${row.readersLow}–${row.readersHigh}`}</td>
      <td>
        <button className="link-btn" type="button" onClick={() => onOpen(row.foyerId)}>
          {t('viewSheet')}
        </button>
      </td>
    </tr>
  );
}
