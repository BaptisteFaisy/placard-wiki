/**
 * Budget et couverture (cahier §14, §19, PW-19) : ce qui a été balayé, ce qui
 * ne l'a pas été et pourquoi, les angles morts déclarés, les droits manquants.
 * Une couverture partielle est déclarée, jamais masquée — « pas de droit » est
 * distingué de « pas de données » (§19).
 *
 * Deux méthodes du bridge : `budget/get` (chiffres du jour) et `coverage/get`
 * (couverture par gîte, angles morts, droits). Aucune valeur brute ici.
 */

import { Box, Heading, Inline, Stack, Text } from '@forge/react';
import { GITES, type CoverageReport, type ScanBudget } from '@placard-wiki/domain';
import { callBridge } from './bridge.js';
import { useI18n, type Lang } from './i18n.js';
import { EmptyNotice, Loading } from './widgets.js';
import { useEffect, useState } from 'react';

/** Une statistique encadrée : libellé + valeur (lisable, contrastée). */
function Stat({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <Box backgroundColor="color.background.neutral.subtle" padding="space.100">
      <Stack space="space.025">
        <Text>{label}</Text>
        <Heading size="medium">{String(value)}</Heading>
      </Stack>
    </Box>
  );
}

/** Libellé bilingue d'un gîte (§6), avec repli sur l'identifiant brut. */
function giteLabel(gite: string, lang: Lang): string {
  const entry = GITES.find((g) => g.gite === gite);
  return entry ? entry[lang] : gite;
}

/** Durée lisible : millisecondes → secondes (une décimale). */
function formatMs(ms: number | undefined): string {
  if (ms === undefined) return '—';
  return (ms / 1000).toFixed(1) + ' s';
}

/** La grille des chiffres du budget du jour. */
function StatGrid({ budget, t }: { budget: ScanBudget; t: (k: string) => string }): JSX.Element {
  return (
    <Inline space="space.100" shouldWrap>
      <Stat label={t('budget.pagesScanned')} value={budget.pagesScanned} />
      <Stat label={t('budget.attachmentsRead')} value={budget.attachmentsRead} />
      <Stat label={t('budget.attachmentsSkipped')} value={budget.attachmentsSkipped} />
      <Stat label={t('budget.llmCalls')} value={budget.llmCalls} />
      <Stat label={t('budget.tokens')} value={budget.tokens} />
      <Stat label={t('budget.cost')} value={budget.costEstimate} />
      <Stat label={t('budget.lastPass')} value={formatMs(budget.lastPassMs)} />
    </Inline>
  );
}

/** Les fichiers non lus, et pourquoi — la couverture déclarée (§14). */
function SkippedList({ budget, t }: { budget: ScanBudget; t: (k: string, v?: Record<string, string | number>) => string }): JSX.Element {
  if (budget.skipped.length === 0) return <Text>{t('budget.blindSpots.empty')}</Text>;
  return (
    <Stack space="space.050">
      {budget.skipped.map((s) => (
        <Text key={s.kind + s.reason}>
          {t('budget.skipped.row', { kind: s.kind, reason: s.reason, count: s.count })}
        </Text>
      ))}
    </Stack>
  );
}

/** La couverture par gîte : lu / ignoré, avec la raison (§6, §19). */
function CoveragePerGite({ coverage, lang, t }: {
  coverage: CoverageReport;
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element {
  if (coverage.perGite.length === 0) return <Text>{t('empty.noData.body')}</Text>;
  return (
    <Stack space="space.050">
      {coverage.perGite.map((g) => (
        <Text key={g.gite}>
          {t('budget.coverage.row', { gite: giteLabel(g.gite, lang), scanned: g.scanned, skipped: g.skipped })}
          {g.reason ? ' — ' + g.reason : ''}
        </Text>
      ))}
    </Stack>
  );
}

/** Une liste de chaînes (angles morts, droits manquants), ou « aucun ». */
function StringList({ items, emptyLabel }: { items: string[]; emptyLabel: string }): JSX.Element {
  if (items.length === 0) return <Text>{emptyLabel}</Text>;
  return (
    <Stack space="space.025">
      {items.map((item) => (
        <Text key={item}>{item}</Text>
      ))}
    </Stack>
  );
}

/** Le contenu chargé : chiffres du budget + couverture, en deux sections. */
function BudgetContent({
  budget,
  coverage,
  lang,
  t,
}: {
  budget: ScanBudget | null;
  coverage: CoverageReport | null;
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element {
  return (
    <Stack space="space.200">
      {budget ? (
        <Stack space="space.100">
          <StatGrid budget={budget} t={t} />
          {budget.coverageNote ? (
            <Stack space="space.025">
              <Heading size="xsmall">{t('budget.coverageNote')}</Heading>
              <Text>{budget.coverageNote}</Text>
            </Stack>
          ) : null}
          <Stack space="space.050">
            <Heading size="xsmall">{t('budget.skipped.title')}</Heading>
            <SkippedList budget={budget} t={t} />
          </Stack>
        </Stack>
      ) : null}
      {coverage ? (
        <Stack space="space.150">
          <Stack space="space.050">
            <Heading size="xsmall">{t('budget.coverage.title')}</Heading>
            <CoveragePerGite coverage={coverage} lang={lang} t={t} />
          </Stack>
          <Stack space="space.050">
            <Heading size="xsmall">{t('budget.blindSpots.title')}</Heading>
            <StringList items={coverage.blindSpots} emptyLabel={t('budget.blindSpots.empty')} />
          </Stack>
          <Stack space="space.050">
            <Heading size="xsmall">{t('budget.missingRights.title')}</Heading>
            <StringList items={coverage.missingRights} emptyLabel={t('budget.missingRights.empty')} />
          </Stack>
          {coverage.lastPassAt ? <Text>{t('budget.lastPass') + ': ' + coverage.lastPassAt}</Text> : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** L'onglet Budget & couverture : charge les deux méthodes, rend les sections. */
export function BudgetPanel(): JSX.Element {
  const { t, lang } = useI18n();
  const [budget, setBudget] = useState<ScanBudget | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      callBridge('budget/get', {}),
      callBridge('coverage/get', {}),
    ]).then(([b, c]) => {
      if (!alive) return;
      if (b.kind === 'ok') setBudget(b.data);
      if (c.kind === 'ok') setCoverage(c.data);
      const failed = b.kind !== 'ok' ? b : c.kind !== 'ok' ? c : null;
      if (failed) setNote(failed.method);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pending = budget === null || coverage === null;

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('budget.title')}</Heading>
      {note && pending ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note })} />
      ) : pending ? (
        <Loading label={t('common.loading')} />
      ) : (
        <BudgetContent budget={budget} coverage={coverage} lang={lang} t={t} />
      )}
    </Stack>
  );
}
