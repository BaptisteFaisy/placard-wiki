// Registre : table triable, filtrable, navigable au clavier, WCAG AA (§10).
// C'est exactement la même information que le bâtiment, mais accessible.

import { useState } from 'react';
import { FAMILY_LABELS } from '@placard-wiki/domain';
import type { FoyerState, RegistryRow, WikiFamily } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import type { DictKey } from '../i18n-dict.js';
import { SPACES, STATE_KEYS } from '../data/demo.js';
import { REGISTRY_ROWS } from '../data/demo-site.js';
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
function filterRows(rows: RegistryRow[], f: Filters): RegistryRow[] {
  return rows.filter(
    (r) =>
      (f.space === '' || r.spaceKey === f.space) &&
      (f.family === '' || r.family === f.family) &&
      (f.state === '' || r.state === f.state) &&
      r.score >= f.minScore,
  );
}

/** Trie une copie stable des lignes selon la colonne et la direction. */
function sortRows(rows: RegistryRow[], sort: SortState): RegistryRow[] {
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

interface RegisterProps {
  onOpenFoyer: (id: string) => void;
}

export function RegisterScreen({ onOpenFoyer }: RegisterProps): JSX.Element {
  const { t } = useLang();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: 'score', dir: 'desc' });
  const visible = sortRows(filterRows(REGISTRY_ROWS, filters), sort);
  const toggleSort = (col: SortKey): void => setSort((s) => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <section className="screen">
      <h2>{t('tabRegister')}</h2>
      <p className="small muted">{t('registerCaption')}</p>
      <FilterBar filters={filters} setFilters={setFilters} />
      <table className="registry">
        <caption>
          {t('resultsCount').replace('{n}', String(visible.length))} · {t('sortHelp')}
        </caption>
        <thead>
          <tr>
            <HeaderCell col="spaceKey" sort={sort} onSort={toggleSort} label={t('colSpace')} />
            <HeaderCell col="pageTitle" sort={sort} onSort={toggleSort} label={t('colPage')} />
            <HeaderCell col="family" sort={sort} onSort={toggleSort} label={t('colFamily')} />
            <HeaderCell col="state" sort={sort} onSort={toggleSort} label={t('colState')} />
            <HeaderCell col="score" sort={sort} onSort={toggleSort} label={t('colScore')} />
            <th scope="col">{t('colGite')}</th>
            <HeaderCell col="readersHigh" sort={sort} onSort={toggleSort} label={t('colReaders')} />
            <th scope="col">{t('colAction')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={8}>{t('noFoyer')}</td>
            </tr>
          )}
          {visible.map((row) => (
            <Row key={row.foyerId} row={row} onOpen={onOpenFoyer} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Barre de filtres : espace, famille, état, score minimal. */
function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }): JSX.Element {
  const { t, pick } = useLang();
  return (
    <div className="filter-bar" role="group" aria-label={t('registerCaption')}>
      <label>
        {t('filterSpace')}
        <select value={filters.space} onChange={(e) => setFilters({ ...filters, space: e.target.value })}>
          <option value="">{t('filterAll')}</option>
          {SPACES.map((s) => (
            <option key={s.key} value={s.key}>
              {pick(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('filterFamily')}
        <select value={filters.family} onChange={(e) => setFilters({ ...filters, family: e.target.value })}>
          <option value="">{t('filterAll')}</option>
          {FAMILY_LIST.map((f) => (
            <option key={f} value={f}>
              {pick(FAMILY_LABELS[f])}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('filterState')}
        <select value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
          <option value="">{t('filterAll')}</option>
          {STATE_LIST.map((s) => (
            <option key={s} value={s}>
              {t(STATE_KEYS[s] as DictKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('filterScore')}
        <input type="number" min={0} max={100} value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) || 0 })} />
      </label>
    </div>
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