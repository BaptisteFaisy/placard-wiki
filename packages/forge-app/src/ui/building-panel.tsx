/**
 * Le bâtiment (cahier §10, PW-25) : la carte visuelle où chaque élément porte
 * une donnée et rien d'autre — pas de décor gratuit.
 *
 * NOTE d'implémentation : le rendu natif UI Kit 2 n'expose pas d'élément SVG
 * brut (le réconciliateur ne sérialise que des composants UI Kit). Le bâtiment
 * est donc rendu avec les primitives du design system (Box colorée = lueur,
 * Stack/Inline = ailes et étages, Icon/Badge = portes, fenêtres, caves,
 * sceaux, rubans). L'encodage §10 est respecté à l'identique, et le registre
 * (onglet voisin) reste l'équivalent accessible complet — §28 fait du bâtiment
 * la seule partie sacrificiable, jamais de l'information.
 *
 * Encodage §10 :
 *   aile = espace · étage = profondeur · pièce = page (taille = audience)
 *   porte verrouillée = restreinte · fenêtre ouverte = partage public
 *   lueur sous la porte = danger max (couleur + intensité)
 *   cave = historique · trappe ouverte = secret encore lisible en version
 *   courant d'air = propagation · affiche = modèle · pièce murée = orpheline
 *   sceau de cire = foyer clos · ruban = faux positif écarté
 */

import { Badge, Box, Heading, Icon, Inline, Stack, Text } from '@forge/react';
import type { BuildingModel } from '@placard-wiki/domain';
import { callBridge, outcomeNote } from './bridge.js';
import { useI18n } from './i18n.js';
import { EmptyNotice, Loading, ScoreLozenge } from './widgets.js';
import { useEffect, useState, type ReactNode } from 'react';

type Wing = BuildingModel['wings'][number];
type Room = Wing['floors'][number]['rooms'][number];
type Draft = Wing['drafts'][number];

/** Glyphes d'icônes utilisés ici (sous-ensemble sûr du jeu UI Kit). */
type RoomGlyph = 'lock' | 'open' | 'archive' | 'image' | 'warning' | 'check-circle';

/** Les quatre teintes de lueur (tokens sémantiques, contraste AA sur texte). */
type DangerBackground =
  | 'color.background.accent.red.subtle'
  | 'color.background.accent.orange.subtle'
  | 'color.background.accent.yellow.subtle'
  | 'color.background.neutral.subtle';

/** Lueur sous la porte : couleur + intensité selon le danger max (§10). */
function dangerBackground(score: number): DangerBackground {
  if (score >= 70) return 'color.background.accent.red.subtle';
  if (score >= 40) return 'color.background.accent.orange.subtle';
  if (score > 0) return 'color.background.accent.yellow.subtle';
  return 'color.background.neutral.subtle';
}

/** Un indicateur icône + texte (nom accessible porté par le texte visible). */
function Indicator({ glyph, label }: { glyph: RoomGlyph; label: string }): JSX.Element {
  return (
    <Inline space="space.050" alignBlock="center">
      <Icon glyph={glyph} label={label} size="small" />
      <Text>{label}</Text>
    </Inline>
  );
}

/** Les indicateurs d'une pièce, dans l'ordre du §10 (absents = non rendus). */
function roomIndicators(room: Room, t: (k: string, v?: Record<string, string | number>) => string): ReactNode[] {
  const out: ReactNode[] = [
    <Text key="aud">{t('building.audience', { n: room.audience })}</Text>,
  ];
  if (room.locked) out.push(<Indicator key="lock" glyph="lock" label={t('building.door.locked')} />);
  if (room.openWindow) out.push(<Indicator key="win" glyph="open" label={t('building.window.open')} />);
  if (room.cellarOpen) out.push(<Indicator key="cellar" glyph="archive" label={t('building.cellar.open')} />);
  if (room.poster) out.push(<Indicator key="poster" glyph="image" label={t('building.poster')} />);
  if (room.walled) out.push(<Indicator key="walled" glyph="warning" label={t('building.walled')} />);
  if (room.sealCount > 0) {
    out.push(
      <Inline key="seal" space="space.050" alignBlock="center">
        <Icon glyph="check-circle" label={t('building.seal', { n: room.sealCount })} size="small" />
        <Badge appearance="success">{room.sealCount}</Badge>
        <Text>{t('building.seal', { n: room.sealCount })}</Text>
      </Inline>,
    );
  }
  if (room.ribbonCount > 0) {
    out.push(
      <Inline key="ribbon" space="space.050" alignBlock="center">
        <Badge appearance="neutral">{room.ribbonCount}</Badge>
        <Text>{t('building.ribbon', { n: room.ribbonCount })}</Text>
      </Inline>,
    );
  }
  return out;
}

/** Une pièce : Box colorée par la lueur (danger max), titre + indicateurs. */
function RoomBox({ room, t }: { room: Room; t: (k: string, v?: Record<string, string | number>) => string }): JSX.Element {
  return (
    <Box backgroundColor={dangerBackground(room.maxDanger)} padding="space.100" testId={'room-' + room.pageId}>
      <Stack space="space.050">
        <Inline space="space.100" alignBlock="center">
          <Text weight="bold">{room.title}</Text>
          <ScoreLozenge score={room.maxDanger} />
        </Inline>
        <Inline space="space.100" shouldWrap alignBlock="center">
          {roomIndicators(room, t)}
        </Inline>
      </Stack>
    </Box>
  );
}

/** Les courants d'air d'une aile : la même empreinte à deux endroits (§10). */
function DraftList({ drafts, titleOf, t }: {
  drafts: Draft[];
  titleOf: (pageId: string) => string;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element | null {
  if (drafts.length === 0) return null;
  return (
    <Stack space="space.050">
      {drafts.map((d) => (
        <Text key={d.fromPageId + d.toPageId + d.fingerprint}>
          {t('building.draft', { a: titleOf(d.fromPageId), b: titleOf(d.toPageId) })}
        </Text>
      ))}
    </Stack>
  );
}

/** Une aile (espace) : ses étages (profondeur) et ses courants d'air. */
function WingView({ wing, t }: { wing: Wing; t: (k: string, v?: Record<string, string | number>) => string }): JSX.Element {
  const titles = new Map<string, string>();
  for (const floor of wing.floors) {
    for (const room of floor.rooms) titles.set(room.pageId, room.title);
  }
  const titleOf = (pageId: string): string => titles.get(pageId) ?? pageId;

  return (
    <Box padding="space.200" backgroundColor="color.background.neutral.subtle" testId={'wing-' + wing.spaceKey}>
      <Stack space="space.150">
        <Heading size="small">{t('building.wing', { key: wing.spaceKey })}</Heading>
        {wing.floors.map((floor) => (
          <Stack key={floor.depth} space="space.050">
            <Text weight="bold">{t('building.floor', { depth: floor.depth })}</Text>
            <Inline space="space.100" shouldWrap>
              {floor.rooms.map((room) => (
                <RoomBox key={room.pageId} room={room} t={t} />
              ))}
            </Inline>
          </Stack>
        ))}
        <DraftList drafts={wing.drafts} titleOf={titleOf} t={t} />
      </Stack>
    </Box>
  );
}

/** L'onglet Bâtiment : charge le modèle, rend les ailes ou un état vide honnête. */
export function BuildingPanel(): JSX.Element {
  const { t } = useI18n();
  const [model, setModel] = useState<BuildingModel | null>(null);
  const [note, setNote] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void callBridge('building/get', {}).then((outcome) => {
      if (!alive) return;
      if (outcome.kind === 'ok') {
        setModel(outcome.data);
        setNote(null);
      } else {
        setModel(null);
        setNote(outcomeNote(outcome));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Stack space="space.200">
      <Heading size="medium">{t('building.title')}</Heading>
      <Text>{t('building.hint')}</Text>
      {note ? (
        <EmptyNotice title={t('empty.pending.title')} body={t('empty.pending.body', { method: note.title })} />
      ) : model === null ? (
        <Loading label={t('common.loading')} />
      ) : model.wings.length === 0 ? (
        <EmptyNotice title={t('empty.noData.title')} body={t('empty.noData.body')} />
      ) : (
        <Stack space="space.200">
          {model.wings.map((wing) => (
            <WingView key={wing.spaceKey} wing={wing} t={t} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
