/**
 * Macro certificat (cahier §18.8, PW-17) : la page datée et chiffrée, destinée
 * à un auditeur — chiffres, exposition résiduelle, angles morts déclarés et
 * empreinte du contenu. Aucun « propre » sans certificat (§23).
 *
 * Méthode du bridge : `certificate/generate` (par espace, ou `site` entier).
 * Règle absolue : le certificat ne contient jamais de valeur brute — que des
 * comptes, des fourchettes et une empreinte d'intégrité (§5, §20).
 */

import { Box, Button, Code, Heading, Inline, Stack, Text } from '@forge/react';
import type { Certificate } from '@placard-wiki/domain';
import { callBridge } from './bridge';
import { useSpaceKey } from './context';
import { useI18n } from './i18n';
import { EmptyNotice, Loading } from './widgets';
import { useCallback, useEffect, useState } from 'react';
import { mountScreen } from './mount';

/** Un chiffre du certificat, encadré (lisibilité, contraste AA). */
function Figure({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <Box backgroundColor="color.background.neutral.subtle" padding="space.100">
      <Stack space="space.025">
        <Text>{label}</Text>
        <Heading size="medium">{String(value)}</Heading>
      </Stack>
    </Box>
  );
}

/** Le certificat rendu : périmètre, date, chiffres, angles morts, empreinte. */
function CertificateView({ cert, t }: { cert: Certificate; t: (k: string) => string }): JSX.Element {
  return (
    <Stack space="space.150">
      <Inline space="space.200" shouldWrap>
        <Text>{t('certificate.scope') + ': ' + cert.scope}</Text>
        <Text>{t('certificate.issuedAt') + ': ' + cert.issuedAt}</Text>
      </Inline>
      <Inline space="space.100" shouldWrap>
        <Figure label={t('certificate.open')} value={cert.open} />
        <Figure label={t('certificate.rotated')} value={cert.rotated} />
        <Figure label={t('certificate.redacted')} value={cert.redacted} />
        <Figure label={t('certificate.purged')} value={cert.purged} />
      </Inline>
      <Stack space="space.025">
        <Heading size="xsmall">{t('certificate.residual')}</Heading>
        <Text>{cert.residualExposure}</Text>
      </Stack>
      <Stack space="space.050">
        <Heading size="xsmall">{t('certificate.blindSpots')}</Heading>
        {cert.blindSpots.length === 0 ? (
          <Text>{t('budget.blindSpots.empty')}</Text>
        ) : (
          cert.blindSpots.map((spot) => <Text key={spot}>{spot}</Text>)
        )}
      </Stack>
      <Stack space="space.025">
        <Heading size="xsmall">{t('certificate.contentHash')}</Heading>
        <Code>{cert.contentHash}</Code>
      </Stack>
    </Stack>
  );
}

/** La macro : génère le certificat du périmètre courant et l'affiche. */
export default function CertificateMacro(): JSX.Element {
  const { t } = useI18n();
  const spaceKey = useSpaceKey();
  const scope = spaceKey || 'site';
  const [cert, setCert] = useState<Certificate | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = useCallback((): void => {
    setBusy(true);
    void callBridge('certificate/generate', { scope }).then((outcome) => {
      setBusy(false);
      if (outcome.kind === 'ok') {
        setCert(outcome.data);
        setNote(null);
      } else {
        setCert(null);
        setNote(outcome.method);
      }
    });
  }, [scope]);

  useEffect(generate, [generate]);

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('certificate.title')}</Heading>
      <Text>{t('certificate.hint')}</Text>
      {note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note })} />
      ) : !cert ? (
        <Loading label={t('common.loading')} />
      ) : (
        <Stack space="space.150">
          <CertificateView cert={cert} t={t} />
          <Inline space="space.100" alignBlock="center">
            <Button appearance="subtle" onClick={generate} isDisabled={busy}>
              {t('certificate.generate')}
            </Button>
          </Inline>
        </Stack>
      )}
    </Stack>
  );
}

// Point d'entrée de la ressource `placard-certificate` (forme UI Kit
// actuelle) : Forge importe ce module et attend qu'il demande son rendu.
mountScreen(<CertificateMacro />);
