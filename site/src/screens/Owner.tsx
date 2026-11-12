// Résolution de propriétaire (§12) — la cascade à 5 niveaux visualisée, avec
// la méthode toujours affichée, et la FILE D'ADOPTION avec assignation locale
// (état React, rien n'est envoyé). Libellés de méthode : table du domaine
// (OWNER_METHOD_LABELS), jamais recopiés ici.

import { useState } from 'react';
import { OWNER_METHOD_LABELS } from '@placard-wiki/domain';
import type { OwnerMethod } from '@placard-wiki/domain';
import { ORPHAN_PAGES, OWNERS } from '../data/demo.js';
import { TITLES } from '../data/demo-site.js';
import { useLang } from '../i18n.js';

/** Les 5 niveaux de la cascade, dans l'ordre du §12. */
const LEVELS: readonly OwnerMethod[] = ['declared-owner', 'last-editors', 'space-lead', 'teamwork-graph', 'adoption-queue'];

/** Personnes de la démo — références masquées, comme partout sur le site. */
const PEOPLE: readonly string[] = ['5f2a…dile', 'nick…lotti', 'nick…reira', 'cam…ndoye'];

/** Exemples concrets : déclaré, derniers éditeurs, graphe (+ adoption plus bas). */
const EXAMPLE_PAGES: readonly string[] = ['P-100', 'P-110', 'P-300'];

/** Un niveau de la cascade : libellé + pages de la démo résolues là. */
function CascadeLevel({ level, index }: { level: OwnerMethod; index: number }): JSX.Element {
  const { t, pick } = useLang();
  const pages = Object.values(OWNERS).filter((owner) => owner.method === level && owner.ownerRef !== undefined);
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
              {TITLES[owner.pageId] ?? owner.pageId} <code>({owner.pageId})</code> → {owner.ownerRef}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Carte d'exemple : page, propriétaire résolu, méthode affichée, confiance. */
function ExampleCard({ pageId }: { pageId: string }): JSX.Element {
  const { t, pick } = useLang();
  const owner = OWNERS[pageId];
  if (!owner) return <li>{pageId}</li>;
  return (
    <li className="owner-card">
      <strong>{TITLES[pageId] ?? pageId}</strong> <code>({pageId})</code>
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
  page: (typeof ORPHAN_PAGES)[number];
  assigned: string | undefined;
  draft: string;
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
      <span className="muted small">{t('ownerCaveat')} : {OWNERS[page.pageId]?.caveat}</span>
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
function AdoptionQueue(): JSX.Element {
  const { t } = useLang();
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(ORPHAN_PAGES.map((page) => [page.pageId, PEOPLE[0] ?? ''])),
  );
  return (
    <section aria-label={t('ownerAdoption')}>
      <h3>{t('ownerAdoption')}</h3>
      <p className="small muted">{t('ownerAdoptionNote')}</p>
      <ul className="adoption-list">
        {ORPHAN_PAGES.map((page) => (
          <AdoptionRow
            key={page.pageId}
            page={page}
            assigned={assigned[page.pageId]}
            draft={drafts[page.pageId] ?? ''}
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
  return (
    <section className="screen">
      <h2>{t('ownerTitle')}</h2>
      <p className="small muted">{t('ownerIntro')}</p>
      <h3>{t('ownerCascade')}</h3>
      <ol className="cascade">
        {LEVELS.map((level, index) => (
          <CascadeLevel key={level} level={level} index={index} />
        ))}
      </ol>
      <h3>{t('ownerExamples')}</h3>
      <ul className="owner-examples">
        {EXAMPLE_PAGES.map((pageId) => (
          <ExampleCard key={pageId} pageId={pageId} />
        ))}
      </ul>
      <AdoptionQueue />
    </section>
  );
}
