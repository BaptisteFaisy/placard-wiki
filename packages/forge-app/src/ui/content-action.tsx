/**
 * Encart sur la page (cahier §18.2, `confluence:contentAction`, PW-12) :
 * « N foyers, danger max 74 », l'état du rituel, et les actions (voir,
 * caviarder). Réponse en moins de 2 s depuis le cache de détection.
 *
 * La bannière temps réel (§9 étape 4, §18.3) est rendue ici, juste après
 * publication, avec son bouton « caviarder » — avant que le secret ne soit
 * recopié, indexé par Rovo, ou lu.
 *
 * Règle : zéro valeur brute — famille, aperçu masqué, score et état seulement.
 */

import { Button, Code, Heading, Inline, SectionMessage, Stack, Text } from '@forge/react';
import { FAMILY_LABELS, type RegistryRow } from '@placard-wiki/domain';
import { callBridge } from './bridge.js';
import { useAccountId, usePageId } from './context.js';
import { FoyerDetail, RedactFlow } from './foyer-detail.js';
import { useI18n, type Lang } from './i18n.js';
import { useRealtimeBanner } from './realtime.js';
import { EmptyNotice, Loading, ScoreLozenge, StateLozenge } from './widgets.js';
import { useEffect, useState } from 'react';

/** Charge les foyers d'une page (registre filtré sur le pageId courant). */
function usePageFoyers(pageId: string): { rows: RegistryRow[] | null; note: string | null } {
  const [rows, setRows] = useState<RegistryRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!pageId) {
      setRows([]);
      return;
    }
    let alive = true;
    void callBridge('registry/list', { limit: 500, sort: 'score' }).then((outcome) => {
      if (!alive) return;
      if (outcome.kind === 'ok') {
        setRows(outcome.data.rows.filter((r) => r.pageId === pageId));
        setNote(null);
      } else {
        setRows(null);
        setNote(outcome.method);
      }
    });
    return () => {
      alive = false;
    };
  }, [pageId]);

  return { rows, note };
}

/** Bannière temps réel : poussée à l'auteur juste après publication (§9). */
function RealtimeBannerView({ pageId, accountId }: { pageId: string; accountId: string }): JSX.Element | null {
  const { t, lang } = useI18n();
  const { banner, subscribed, redact, dismiss } = useRealtimeBanner(pageId);
  const [busy, setBusy] = useState(false);

  if (!banner) {
    return subscribed ? <Text>{t('action.listening')}</Text> : null;
  }

  const familyLabel = FAMILY_LABELS[banner.family] ? FAMILY_LABELS[banner.family][lang] : banner.family;
  const onRedact = (): void => {
    setBusy(true);
    void redact(accountId, t('action.redactComment')).then(() => setBusy(false));
  };

  return (
    <SectionMessage
      appearance="warning"
      title={t('realtime.banner.title', { family: familyLabel, score: banner.score })}
    >
      <Stack space="space.100">
        <Code>{banner.maskedPreview}</Code>
        <Text>{t('realtime.banner.hint')}</Text>
        <Inline space="space.100">
          <Button appearance="primary" onClick={onRedact} isDisabled={busy}>
            {t('common.redact')}
          </Button>
          <Button appearance="subtle" onClick={dismiss}>
            {t('common.close')}
          </Button>
        </Inline>
        <Text>{t('realtime.banner.api')}</Text>
      </Stack>
    </SectionMessage>
  );
}

/** Un foyer de la page : résumé, état du rituel, actions voir / caviarder. */
function FoyerCard({ row, accountId, lang, t }: {
  row: RegistryRow;
  accountId: string;
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element {
  const [showDetail, setShowDetail] = useState(false);
  const [showRedact, setShowRedact] = useState(false);
  const familyLabel = FAMILY_LABELS[row.family] ? FAMILY_LABELS[row.family][lang] : row.family;

  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text weight="bold">{familyLabel}</Text>
        <Code>{row.maskedPreview}</Code>
        <ScoreLozenge score={row.score} />
        <StateLozenge state={row.state} />
        <Text>{t('action.locations', { n: row.locationCount })}</Text>
      </Inline>
      <Inline space="space.100">
        <Button appearance="subtle" onClick={() => setShowDetail((v) => !v)}>
          {t('common.view')}
        </Button>
        <Button appearance="subtle" onClick={() => setShowRedact((v) => !v)}>
          {t('common.redact')}
        </Button>
      </Inline>
      {showDetail ? <FoyerDetail foyerId={row.foyerId} /> : null}
      {showRedact ? <RedactFlow foyerId={row.foyerId} accountId={accountId} /> : null}
    </Stack>
  );
}

/** L'encart de page : bannière temps réel + résumé + foyers et actions. */
export default function ContentAction(): JSX.Element {
  const { t, lang } = useI18n();
  const pageId = usePageId();
  const accountId = useAccountId();
  const { rows, note } = usePageFoyers(pageId);

  const maxDanger = rows && rows.length > 0 ? Math.max(...rows.map((r) => r.score)) : 0;
  const count = rows ? rows.length : 0;

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('action.title')}</Heading>
      <RealtimeBannerView pageId={pageId} accountId={accountId} />
      {!pageId ? (
        <EmptyNotice title={t('empty.noData.title')} body={t('action.noPage')} />
      ) : note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note })} />
      ) : rows === null ? (
        <Loading label={t('common.loading')} />
      ) : (
        <Stack space="space.150">
          <Heading size="small">
            {count === 0 ? t('action.summary.zero') : t('action.summary', { n: count, max: maxDanger })}
          </Heading>
          {rows.map((row) => (
            <FoyerCard key={row.foyerId} row={row} accountId={accountId} lang={lang} t={t} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
