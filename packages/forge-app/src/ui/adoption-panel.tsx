/**
 * File d'adoption (cahier §12, PW-14) : les pages sans propriétaire résolu.
 * L'espace désigne quelqu'un — jamais un classement de personnes (§23). La
 * méthode de résolution en cascade est rappelée ; ici, aucune n'a abouti, donc
 * la page attend une adoption explicite.
 *
 * Méthodes du bridge : `adoption/list` (pages orphelines) et `adoption/assign`
 * (désignation, au nom de la personne connectée). Aucune valeur brute.
 */

import { Box, Button, Heading, Inline, SectionMessage, Stack, Text, Textfield } from '@forge/react';
import { useProductContext } from '@forge/react';
import type { BridgeResults } from '@placard-wiki/domain';
import { callBridge } from './bridge';
import { FilterText } from './form-controls';
import { useI18n } from './i18n';
import { EmptyNotice, Loading } from './widgets';
import { useEffect, useState } from 'react';

type AdoptionPage = BridgeResults['adoption/list']['pages'][number];

/** L'état d'une désignation d'adoption (une carte, une page). */
interface AssignState {
  owner: string;
  setOwner: (value: string) => void;
  busy: boolean;
  feedback: string | null;
  assign: () => void;
}

/**
 * Logique de désignation d'une page orpheline : champ propriétaire, appel au
 * bridge `adoption/assign` au nom de la personne connectée, retour honnête.
 */
function useAssign(
  pageId: string,
  actorRef: string,
  onAssigned: (pageId: string) => void,
  t: (k: string) => string,
): AssignState {
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const assign = (): void => {
    const ownerRef = owner.trim();
    if (!ownerRef || !actorRef || busy) return;
    setBusy(true);
    void callBridge('adoption/assign', { pageId, ownerRef, actorRef }).then((outcome) => {
      setBusy(false);
      if (outcome.kind === 'ok') {
        setFeedback(t('adoption.assigned'));
        onAssigned(pageId);
      } else {
        setFeedback(outcome.kind === 'pending' ? outcome.honesty : outcome.message);
      }
    });
  };

  return { owner, setOwner, busy, feedback, assign };
}

/** Une carte d'adoption : info de la page + champ de désignation. */
function AdoptionCard({
  page,
  actorRef,
  onAssigned,
  t,
}: {
  page: AdoptionPage;
  actorRef: string;
  onAssigned: (pageId: string) => void;
  t: (k: string) => string;
}): JSX.Element {
  const { owner, setOwner, busy, feedback, assign } = useAssign(page.pageId, actorRef, onAssigned, t);
  const editors = page.lastEditors.length > 0 ? page.lastEditors.join(', ') : '—';

  return (
    <Box backgroundColor="color.background.neutral.subtle" padding="space.150" testId={'adoption-' + page.pageId}>
      <Stack space="space.100">
        <Heading size="xsmall">{page.title}</Heading>
        <Text>{t('adoption.col.space') + ': ' + page.spaceKey}</Text>
        <Text>{t('adoption.col.editors') + ': ' + editors}</Text>
        <Inline space="space.100" alignBlock="end">
          <FilterText
            id={'owner-' + page.pageId}
            label={t('adoption.assignTo')}
            value={owner}
            onChange={setOwner}
            placeholder={t('adoption.assignTo')}
          />
          <Button appearance="primary" onClick={assign} isDisabled={busy || owner.trim() === ''}>
            {t('adoption.col.assign')}
          </Button>
        </Inline>
        {feedback ? <SectionMessage appearance="information">{feedback}</SectionMessage> : null}
      </Stack>
    </Box>
  );
}

/** L'onglet Adoption : charge les pages orphelines, permet la désignation. */
export function AdoptionPanel(): JSX.Element {
  const { t } = useI18n();
  const context = useProductContext();
  const actorRef = context?.accountId ?? '';
  const [pages, setPages] = useState<AdoptionPage[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void callBridge('adoption/list', {}).then((outcome) => {
      if (!alive) return;
      if (outcome.kind === 'ok') {
        setPages(outcome.data.pages);
        setNote(null);
      } else {
        setPages(null);
        setNote(outcome.method);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const removeAssigned = (pageId: string): void =>
    setPages((prev) => (prev ? prev.filter((p) => p.pageId !== pageId) : prev));

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('adoption.title')}</Heading>
      <Text>{t('adoption.hint')}</Text>
      {note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note })} />
      ) : pages === null ? (
        <Loading label={t('common.loading')} />
      ) : pages.length === 0 ? (
        <EmptyNotice title={t('empty.noData.title')} body={t('adoption.empty')} appearance="success" />
      ) : (
        <Stack space="space.100">
          {pages.map((page) => (
            <AdoptionCard key={page.pageId} page={page} actorRef={actorRef} onAssigned={removeAssigned} t={t} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
