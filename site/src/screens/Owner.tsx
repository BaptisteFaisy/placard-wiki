// Résolution de propriétaire (§12) — la cascade à 5 niveaux visualisée, avec
// la méthode toujours affichée, et la FILE D'ADOPTION avec assignation locale
// (état React, rien n'est envoyé). Libellés de méthode : table du domaine
// (OWNER_METHOD_LABELS), jamais recopiés ici.

import { useState } from 'react';
import { OWNER_METHOD_LABELS } from '@placard-wiki/domain';
import type { OwnerMethod } from '@placard-wiki/domain';
import type { OwnerResolution } from '@placard-wiki/domain';
import { useLang } from '../i18n.js';
import { usePlacardData } from '../data/placard-data.js';
import type { OrphanPage } from '../data/dataset.js';

/** Les 5 niveaux de la cascade, dans l'ordre du §12. */
const LEVELS: readonly OwnerMethod[] = ['declared-owner', 'last-editors', 'space-lead', 'teamwork-graph', 'adoption-queue'];

/** Personnes de la démo — références masquées, comme partout sur le site. */
const PEOPLE: readonly string[] = ['5f2a…dile', 'nick…lotti', 'nick…reira', 'cam…ndoye'];

/** Exemples concrets : les premières pages résolues du jeu courant. */
const EXAMPLE_PAGES_FALLBACK: readonly string[] = ['P-100', 'P-110', 'P-300'];

/** Un niveau de la cascade : libellé + pages résolues à ce niveau. */
function CascadeLevel({ level, index, owners, titles }: { level: OwnerMethod; index: number; owners: Record<string, OwnerResolution>; titles: Record<string, string> }): JSX.Element {
  const { t, pick } = useLang();
  const pages = Object.values(owners).filter((owner) => owner.method === level && owner.ownerRef !== undefined);
  return (
    <li className="cascade-level">
      <strong>
        {t('ownerLevel')} {index + 1} — {pick(OWNER_METHOD_LABELS[level])}
      </strong>
      {pages.length === 0 ? (
        <span className="muted small"> {t('ownerNone')}</span>
      ) : (
        <ul className="cascade-pages">
          {pages.map((owner) => (
            <li key={owner.pageId}>
              {titles[owner.pageId] ?? owner.pageId} <code>({owner.pageId})</code> → {owner.ownerRef}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Carte d'exemple : page, propriétaire résolu, méthode affichée, confiance. */
function ExampleCard({ pageId, owners, titles }: { pageId: string; owners: Record<string, OwnerResolution>; titles: Record<string, string> }): JSX.Element {
  const { t, pick } = useLang();
  const owner = owners[pageId];
  if (!owner) return <li>{pageId}</li>;
  return (
    <li className="owner-card">
      <strong>{titles[pageId] ?? pageId}</strong> <code>({pageId})</code>
      <dl>
        <dt>{t('ownerMethod')}</dt>
        <dd>{pick(OWNER_METHOD_LABELS[owner.method])}</dd>
        <dt>{t('ownerConfidence')}</dt>
        <dd>{owner.confidence}</dd>
        <dt>{t('ownerResolved')}</dt>
        <dd>{owner.ownerRef ?? '—'}</dd>
      </dl>
    </li>
  );
}

/** Une page de la file d'adoption : désignation locale ou état assigné. */
function AdoptionRow(props: {
  page: OrphanPage;
  assigned: string | undefined;
  draft: string;
  ownerCaveat: string | undefined;
  onDraft: (person: string) => void;
  onAssign: () => void;
}): JSX.Element {
  const { t } = useLang();
  const { page } = props;
  return (
    <li className="owner-card">
      <strong>{page.title}</strong> <code>({page.pageId})</code> — {page.spaceKey}
      <br />
      <span className="muted small">
        {t('ownerLastEditors')} : {page.lastEditors.join(', ')}
      </span>
      <br />
      <span className="muted small">{t('ownerCaveat')} : {props.ownerCaveat ?? '—'}</span>
      {props.assigned ? (
        <p className="badge state">
          {t('ownerAssigned')} → {props.assigned}
        </p>
      ) : (
        <p className="adoption-form">
          <label>
            {t('ownerPerson')}
            <select value={props.draft} onChange={(e) => props.onDraft(e.target.value)}>
              {PEOPLE.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </label>
          <button className="action" type="button" onClick={props.onAssign}>
            {t('ownerAssign')}
          </button>
        </p>
      )}
    </li>
  );
}

/** File d'adoption : désignation LOCALE par l'espace (§12, niveau 5). */
function AdoptionQueue(props: { orphanPages: readonly OrphanPage[]; owners: Record<string, OwnerResolution> }): JSX.Element {
  const { t } = useLang();
  const { orphanPages, owners } = props;
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(orphanPages.map((page) => [page.pageId, PEOPLE[0] ?? ''])),
  );
  return (
    <section aria-label={t('ownerAdoption')}>
      <h3>{t('ownerAdoption')}</h3>
      <p className="small muted">{t('ownerAdoptionNote')}</p>
      <ul className="adoption-list">
        {orphanPages.map((page) => (
          <AdoptionRow
            key={page.pageId}
            page={page}
            assigned={assigned[page.pageId]}
            draft={drafts[page.pageId] ?? ''}
            ownerCaveat={owners[page.pageId]?.caveat}
            onDraft={(person) => setDrafts((d) => ({ ...d, [page.pageId]: person }))}
            onAssign={() => setAssigned((a) => ({ ...a, [page.pageId]: drafts[page.pageId] ?? '' }))}
          />
        ))}
      </ul>
    </section>
  );
}

export function OwnerScreen(): JSX.Element {
  const { t } = useLang();
  const { dataset } = usePlacardData();
  const owners = dataset.owners;
  const titles = dataset.titles;
  const examplePages = Object.keys(owners).slice(0, 3);
  const examples = examplePages.length > 0 ? examplePages : EXAMPLE_PAGES_FALLBACK;
  return (
    <section className="screen">
      <h2>{t('ownerTitle')}</h2>
      <p className="small muted">{t('ownerIntro')}</p>
      <h3>{t('ownerCascade')}</h3>
      <ol className="cascade">
        {LEVELS.map((level, index) => (
          <CascadeLevel key={level} level={level} index={index} owners={owners} titles={titles} />
        ))}
      </ol>
      <h3>{t('ownerExamples')}</h3>
      <ul className="owner-examples">
        {examples.map((pageId) => (
          <ExampleCard key={pageId} pageId={pageId} owners={owners} titles={titles} />
        ))}
      </ul>
      <AdoptionQueue orphanPages={dataset.orphanPages} owners={owners} />
    </section>
  );
}
