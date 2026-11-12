/**
 * Fiche de foyer (cahier §18.4) et flux de caviardage (§9 étape 2, PW-10).
 * Rendue depuis l'encart de page (« voir ») : termes du score avec leur
 * méthode (§8 — aucun score sans ses termes), exposition et sa méthode, état
 * du rituel (§9). Le caviardage propose le diff masqué avant application,
 * appliquée `asUser()` au nom de la personne qui approuve.
 *
 * Règle absolue : zéro valeur brute. Empreintes, aperçus masqués et diffs
 * masqués seulement (le contexte est montré, la valeur jamais).
 */

import { Box, Button, Code, Heading, Inline, SectionMessage, Stack, Text } from '@forge/react';
import {
  RITUAL_STEP_LABELS,
  SCORE_TERM_BY_ID,
  SHARING_LABELS,
  type AppliedScoreTerm,
  type Foyer,
  type PageExposure,
  type RedactionDiff,
  type RitualStep,
  type RitualStepState,
  type ScoreTermId,
  type SharingState,
} from '@placard-wiki/domain';
import { callBridge } from './bridge';
import { useI18n, type Lang } from './i18n';
import { EmptyNotice, Loading, StateLozenge } from './widgets';
import { useEffect, useState } from 'react';

/** Libellé bilingue d'un terme du score : catalogue §8 d'abord, repli sinon. */
function termLabel(term: AppliedScoreTerm, lang: Lang): string {
  const spec = SCORE_TERM_BY_ID.get(term.id as ScoreTermId);
  return spec ? spec[lang] : term.label;
}

/** Méthode bilingue d'un terme du score (§8 : la méthode, pas la conclusion). */
function termMethod(term: AppliedScoreTerm, lang: Lang): string {
  const spec = SCORE_TERM_BY_ID.get(term.id as ScoreTermId);
  if (!spec) return term.method;
  return lang === 'fr' ? spec.methodFr : spec.methodEn;
}

/** Les termes appliqués au score, chacun avec sa méthode (§8). */
function ScoreTermList({ terms, lang }: { terms: AppliedScoreTerm[]; lang: Lang }): JSX.Element {
  if (terms.length === 0) return <Text>—</Text>;
  return (
    <Stack space="space.050">
      {terms.map((term) => (
        <Box key={term.id} padding="space.050" backgroundColor="color.background.neutral.subtle">
          <Stack space="space.025">
            <Inline space="space.100" alignBlock="center">
              <Text weight="bold">{(term.points >= 0 ? '+' : '') + String(term.points)}</Text>
              <Text>{termLabel(term, lang)}</Text>
            </Inline>
            <Text>{termMethod(term, lang)}</Text>
            {term.evidence ? <Code>{term.evidence}</Code> : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/** L'exposition d'une page : fourchette de lecteurs + méthode, partage, IA. */
function ExposureView({ exposure, lang, t }: {
  exposure: PageExposure;
  lang: Lang;
  t: (k: string) => string;
}): JSX.Element {
  const sharing = SHARING_LABELS[exposure.sharing as SharingState];
  const sharingLabel = sharing ? sharing[lang] : exposure.sharing;
  return (
    <Stack space="space.050">
      <Heading size="xsmall">{t('registry.col.readers')}</Heading>
      <Text>{exposure.readers.low + '–' + exposure.readers.high + ' · ' + exposure.readers.method}</Text>
      <Text>{t('registry.col.sharing') + ': ' + sharingLabel}</Text>
      <Text>
        {t('registry.col.ai') + ': ' +
          (exposure.aiSurface.presumedIndexed ? t('registry.ai.yes') : t('registry.ai.no')) +
          ' · ' + exposure.aiSurface.method}
      </Text>
    </Stack>
  );
}

/** L'état du rituel, étape par étape, avec la raison quand c'est verrouillé. */
function RitualList({ steps, lang }: { steps: RitualStepState[]; lang: Lang }): JSX.Element {
  if (steps.length === 0) return <Text>—</Text>;
  return (
    <Stack space="space.050">
      {steps.map((step) => {
        const label = RITUAL_STEP_LABELS[step.step as RitualStep];
        const done = step.state === 'done';
        return (
          <Inline key={step.step} space="space.100" alignBlock="center">
            <StateLozenge state={done ? 'sealed' : 'open'} />
            <Text weight="bold">{label ? label[lang] : step.step}</Text>
            <Text>{step.state}</Text>
            {step.note ? <Text>{' — ' + step.note}</Text> : null}
          </Inline>
        );
      })}
    </Stack>
  );
}

/** Un diff de caviardage masqué : contexte avant/après, jamais la valeur. */
function DiffView({ diff }: { diff: RedactionDiff }): JSX.Element {
  return (
    <Box padding="space.050" backgroundColor="color.background.neutral.subtle">
      <Stack space="space.025">
        <Text>{diff.containerType + (diff.versionNumber ? ' · v' + String(diff.versionNumber) : '')}</Text>
        <Code>{diff.maskedBefore}</Code>
        <Text>{'→ ' + diff.after}</Text>
      </Stack>
    </Box>
  );
}

/** L'état du flux de caviardage : aperçu, application, retour honnête. */
interface RedactApi {
  diffs: RedactionDiff[] | null;
  templateFirst: string[];
  result: string | null;
  busy: boolean;
  preview: () => void;
  apply: () => void;
}

/** Aperçu du diff masqué puis application `asUser()` (PW-10, §9 étape 2). */
function useRedact(foyerId: string, accountId: string, comment: string): RedactApi {
  const [diffs, setDiffs] = useState<RedactionDiff[] | null>(null);
  const [templateFirst, setTemplateFirst] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = (): void => {
    setBusy(true);
    void callBridge('ritual/redaction-preview', { foyerId }).then((outcome) => {
      setBusy(false);
      if (outcome.kind === 'ok') {
        setDiffs(outcome.data.diffs);
        setTemplateFirst(outcome.data.templateFirst);
      } else {
        setResult(outcome.kind === 'pending' ? outcome.honesty : outcome.message);
      }
    });
  };

  const apply = (): void => {
    setBusy(true);
    void callBridge('ritual/redaction-apply', { foyerId, approvedBy: accountId, comment }).then((outcome) => {
      setBusy(false);
      setResult(
        outcome.kind === 'ok'
          ? outcome.data.versionComment + ' (' + outcome.data.asUser + ')'
          : outcome.kind === 'pending'
            ? outcome.honesty
            : outcome.message,
      );
    });
  };

  return { diffs, templateFirst, result, busy, preview, apply };
}

/** Flux de caviardage : aperçu du diff masqué, puis application `asUser()`. */
export function RedactFlow({ foyerId, accountId }: { foyerId: string; accountId: string }): JSX.Element {
  const { t } = useI18n();
  const { diffs, templateFirst, result, busy, preview, apply } = useRedact(
    foyerId,
    accountId,
    t('action.redactComment'),
  );
  return (
    <Stack space="space.100">
      <Inline space="space.100">
        <Button appearance="primary" onClick={preview} isDisabled={busy}>
          {t('common.redact')}
        </Button>
        {diffs && diffs.length > 0 ? (
          <Button onClick={apply} isDisabled={busy}>
            {t('action.apply')}
          </Button>
        ) : null}
      </Inline>
      {templateFirst.length > 0 ? (
        <SectionMessage appearance="information" title={t('action.preview')}>
          <Text>{templateFirst.join(', ')}</Text>
        </SectionMessage>
      ) : null}
      {diffs ? (
        <Stack space="space.050">
          {diffs.map((diff) => (
            <DiffView key={diff.locationId} diff={diff} />
          ))}
        </Stack>
      ) : null}
      {result ? <SectionMessage appearance="information">{result}</SectionMessage> : null}
    </Stack>
  );
}

/** La fiche d'un foyer : chargée au montage (« voir »), jamais de valeur. */
export function FoyerDetail({ foyerId }: { foyerId: string }): JSX.Element {
  const { t, lang } = useI18n();
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [exposure, setExposure] = useState<PageExposure | null>(null);
  const [ritual, setRitual] = useState<RitualStepState[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void callBridge('finding/get', { foyerId }).then((outcome) => {
      if (!alive) return;
      if (outcome.kind === 'ok') {
        setFoyer(outcome.data.foyer);
        setExposure(outcome.data.exposure ?? null);
        setRitual(outcome.data.ritual);
      } else {
        setNote(outcome.method);
      }
    });
    return () => {
      alive = false;
    };
  }, [foyerId]);

  return (
    <Stack space="space.150">
      {note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note })} />
      ) : !foyer ? (
        <Loading label={t('common.loading')} />
      ) : (
        <Stack space="space.150">
          <Stack space="space.050">
            <Heading size="xsmall">{t('action.scoreTerms')}</Heading>
            <ScoreTermList terms={foyer.scoreTerms} lang={lang} />
          </Stack>
          {exposure ? <ExposureView exposure={exposure} lang={lang} t={t} /> : null}
          <Stack space="space.050">
            <Heading size="xsmall">{t('action.ritualSteps')}</Heading>
            {ritual ? <RitualList steps={ritual} lang={lang} /> : null}
          </Stack>
          <Text>{t('action.locations', { n: foyer.locations.length })}</Text>
        </Stack>
      )}
    </Stack>
  );
}
