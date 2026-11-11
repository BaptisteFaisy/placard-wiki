// Le bâtiment (§10) : carte SVG où chaque élément porte une donnée.
// Navigation clavier + pointeur : la lanterne (focus) suit la sélection.

import { useState } from 'react';
import { FOYERS } from '../data/demo.js';
import { BUILDING, TITLES } from '../data/demo-site.js';
import { useLang } from '../i18n.js';
import { layoutBuilding, ROOM_H } from '../building-layout.js';
import type { RoomBox, WingBox } from '../building-layout.js';

/** La couleur porte le danger ; un chiffre et un texte l'accompagnent toujours. */
function svgDanger(score: number): string {
  if (score < 35) return '#66bb6a';
  if (score < 70) return '#ffb74d';
  return '#ef5350';
}

/** Page → foyer : chaque emplacement du foyer pointe vers sa page. */
function buildPageFoyer(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const foyer of Object.values(FOYERS)) {
    for (const loc of foyer.locations) map[loc.pageId] = foyer.id;
  }
  return map;
}
const PAGE_FOYER = buildPageFoyer();

/** Tronque un titre trop long pour la pièce, sans casser la largeur. */
function trimTitle(title: string, width: number): string {
  const max = Math.floor((width - 12) / 6);
  return title.length <= max ? title : `${title.slice(0, Math.max(0, max - 1))}…`;
}

/** Corps de la pièce : murs, titre, audience, briques si orpheline. */
function RoomBody({ box }: { box: RoomBox }): JSX.Element {
  const { room } = box;
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={4} fill={room.walled ? '#5c606d' : '#d8d3c3'} stroke="#0f1117" strokeWidth="1.5" />
      {room.walled && (
        <g stroke="#0f1117" strokeWidth="1" opacity="0.5" aria-hidden="true">
          <line x1={box.x} y1={box.y + 14} x2={box.x + box.w} y2={box.y + 14} />
          <line x1={box.x} y1={box.y + 28} x2={box.x + box.w} y2={box.y + 28} />
          <line x1={box.x + box.w / 3} y1={box.y} x2={box.x + box.w / 3} y2={box.y + 14} />
          <line x1={box.x + (2 * box.w) / 3} y1={box.y + 14} x2={box.x + (2 * box.w) / 3} y2={box.y + 28} />
        </g>
      )}
      <text x={box.x + 6} y={box.y + 18} fontSize="10" fontWeight="600" fill="#14161f">
        {trimTitle(TITLES[room.pageId] ?? room.title, box.w)}
      </text>
      <text x={box.x + 6} y={box.y + 32} fontSize="9" fill="#33363f">
        {room.audience}
      </text>
    </g>
  );
}

/** Porte : pleine si verrouillée, trou de serrure selon l'état. */
function DoorIcon({ box }: { box: RoomBox }): JSX.Element {
  const locked = box.room.locked;
  return (
    <g aria-hidden="true">
      <rect x={box.cx - 8} y={box.y + box.h - 24} width={16} height={24} rx={2} fill={locked ? '#3b2f22' : '#f1ede1'} stroke="#14161f" strokeWidth="1" />
      <circle cx={box.cx + (locked ? 4 : 0)} cy={box.y + box.h - 12} r="2" fill={locked ? '#f1ede1' : '#3b2f22'} />
    </g>
  );
}

/** Fenêtre ouverte : partage public / « anyone with the link ». */
function WindowIcon({ box }: { box: RoomBox }): JSX.Element {
  if (!box.room.openWindow) return <></>;
  return (
    <g aria-hidden="true">
      <rect x={box.x + box.w - 16} y={box.y + 4} width={12} height={12} fill="#a9d5f5" stroke="#14161f" strokeWidth="1" />
      <line x1={box.x + box.w - 10} y1={box.y + 4} x2={box.x + box.w - 10} y2={box.y + 16} stroke="#14161f" strokeWidth="1" />
    </g>
  );
}

/** Affiche au mur : modèle de page qui recopie son contenu. */
function PosterIcon({ box }: { box: RoomBox }): JSX.Element {
  if (!box.room.poster) return <></>;
  return (
    <g aria-hidden="true">
      <rect x={box.x + 4} y={box.y + 4} width={12} height={12} fill="#e5a9c0" stroke="#14161f" strokeWidth="1" />
      <line x1={box.x + 4} y1={box.y + 8} x2={box.x + 16} y2={box.y + 8} stroke="#14161f" strokeWidth="1" />
    </g>
  );
}

/** Sceau de cire : foyer clos. */
function SealIcon({ box }: { box: RoomBox }): JSX.Element {
  if (box.room.sealCount <= 0) return <></>;
  return (
    <g aria-hidden="true">
      <circle cx={box.x + box.w - 8} cy={box.y + box.h - 8} r="6" fill="#8f1d1d" stroke="#f1ede1" strokeWidth="1" />
      <text x={box.x + box.w - 11} y={box.y + box.h - 4.5} fontSize="8" fill="#f1ede1">S</text>
    </g>
  );
}

/** Ruban : faux positif écarté, avec raison. */
function RibbonIcon({ box }: { box: RoomBox }): JSX.Element {
  if (box.room.ribbonCount <= 0) return <></>;
  return (
    <g aria-hidden="true">
      <path d={`M ${box.x + 4} ${box.y + box.h - 6} l 6 -4 l 6 4 z`} fill="#9c6ade" stroke="#14161f" strokeWidth="0.7" />
      <circle cx={box.x + 10} cy={box.y + box.h - 6} r="1.6" fill="#14161f" />
    </g>
  );
}

/** Cave : historique de versions ; trappe ouverte = secret lisible en ancienne version. */
function CellarIcon({ box }: { box: RoomBox }): JSX.Element {
  if (!box.room.cellarOpen) return <></>;
  return (
    <g aria-hidden="true">
      <rect x={box.x} y={box.y + box.h + 8} width={box.w} height={20} rx={3} fill="#323540" stroke="#0f1117" strokeWidth="1.2" />
      <line x1={box.cx - 8} y1={box.y + box.h + 28} x2={box.cx + 8} y2={box.y + box.h + 28} stroke="#d8d3c3" strokeWidth="2" />
      <text x={box.cx} y={box.y + box.h + 22} fontSize="7" fill="#d8d3c3" textAnchor="middle">trappe</text>
    </g>
  );
}

interface RoomProps {
  box: RoomBox;
  selected: boolean;
  onSelect: (pageId: string) => void;
  onOpen: (foyerId: string) => void;
}

/** Une pièce interactive : lueur, corps, porte, fenêtre, affiche, sceau, ruban, cave. */
function RoomNode({ box, selected, onSelect, onOpen }: RoomProps): JSX.Element {
  const { room } = box;
  const foyerId = PAGE_FOYER[room.pageId];
  const glow = svgDanger(room.maxDanger);
  const label = `${TITLES[room.pageId] ?? room.title} — ${room.audience} viewers — ${room.maxDanger}/100`;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onMouseEnter={() => onSelect(room.pageId)}
      onFocus={() => onSelect(room.pageId)}
      onClick={() => foyerId && onOpen(foyerId)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && foyerId) {
          e.preventDefault();
          onOpen(foyerId);
        }
      }}
    >
      {selected && <circle cx={box.cx} cy={box.cy} r={box.w / 2} fill="#ffe082" opacity="0.12" aria-hidden="true" />}
      {room.maxDanger > 0 && (
        <rect x={box.x + 6} y={box.y + box.h - 4} width={box.w - 12} height={10} rx={5} fill={glow} opacity="0.85" aria-hidden="true" />
      )}
      <g stroke={selected ? '#ffe082' : undefined} strokeWidth={selected ? 3 : undefined}>
        <RoomBody box={box} />
      </g>
      <DoorIcon box={box} />
      <WindowIcon box={box} />
      <PosterIcon box={box} />
      <SealIcon box={box} />
      <RibbonIcon box={box} />
      <CellarIcon box={box} />
    </g>
  );
}

/** Courant d'air : même empreinte à deux endroits (propagation). */
function DraftEdges({ wing }: { wing: WingBox }): JSX.Element {
  const byPage = (id: string): RoomBox | undefined => wing.rooms.find((r) => r.room.pageId === id);
  return (
    <g>
      {wing.rooms.map((box) => {
        const draft = wing.drafts.find((d) => d.fromPageId === box.room.pageId);
        if (!draft) return null;
        const to = byPage(draft.toPageId);
        if (!to) return null;
        return (
          <path
            key={draft.toPageId}
            d={`M ${box.cx} ${box.y + ROOM_H / 2} Q ${(box.cx + to.cx) / 2} ${box.y - 30} ${to.cx} ${to.y + ROOM_H / 2}`}
            fill="none"
            stroke="#e6c07a"
            strokeWidth="2"
            strokeDasharray="5 4"
            aria-label="courant d'air (propagation)"
          />
        );
      })}
    </g>
  );
}

const LEGEND_ITEMS: Array<{ key: string; swatch: string }> = [
  { key: 'legendFloor', swatch: 'transparent' },
  { key: 'legendRoom', swatch: '#d8d3c3' },
  { key: 'legendDoor', swatch: '#3b2f22' },
  { key: 'legendWindow', swatch: '#a9d5f5' },
  { key: 'legendGlow', swatch: '#ef5350' },
  { key: 'legendCellar', swatch: '#323540' },
  { key: 'legendDraft', swatch: '#e6c07a' },
  { key: 'legendPoster', swatch: '#e5a9c0' },
  { key: 'legendWalled', swatch: '#5c606d' },
  { key: 'legendSeal', swatch: '#8f1d1d' },
  { key: 'legendRibbon', swatch: '#9c6ade' },
];

interface BuildingProps {
  onOpenFoyer: (id: string) => void;
}

export function BuildingScreen({ onOpenFoyer }: BuildingProps): JSX.Element {
  const { t } = useLang();
  const [selected, setSelected] = useState<string>('');
  const layout = layoutBuilding(BUILDING);

  return (
    <section className="screen">
      <h2>{t('tabBuilding')}</h2>
      <p className="small muted">{t('buildingIntro')}</p>
      <div className="building-wrap">
        <svg role="img" aria-label={t('tabBuilding')} viewBox={`0 0 ${layout.width} ${layout.height}`} className="building-svg">
          {layout.wings.map((wing) => (
            <WingGroup key={wing.spaceKey} wing={wing} selected={selected} onSelect={setSelected} onOpen={onOpenFoyer} />
          ))}
          {layout.wings.map((wing) => (
            <DraftEdges key={wing.spaceKey} wing={wing} />
          ))}
        </svg>
      </div>
      <p className="small muted">{t('buildingHelp')}</p>
      <ul className="legend" aria-label={t('buildingIntro')}>
        {LEGEND_ITEMS.map((item) => (
          <LegendItem key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** Légende : un carré de couleur + son texte (jamais de couleur seule). */
function LegendItem({ item }: { item: { key: string; swatch: string } }): JSX.Element {
  const { t } = useLang();
  return (
    <li>
      {item.swatch !== 'transparent' && (
        <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, background: item.swatch, border: '1px solid #14161f', borderRadius: 3 }} />
      )}
      {t(item.key as Parameters<typeof t>[0])}
    </li>
  );
}

/** Groupe d'une aile : titre d'espace + pièces. */
function WingGroup(props: {
  wing: WingBox;
  selected: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { wing, selected, onSelect, onOpen } = props;
  return (
    <g>
      <text x={wing.x + 8} y={2} fontSize="11" fontWeight="700" fill="#e8e6df">
        {wing.spaceKey}
      </text>
      {wing.rooms.map((box) => (
        <RoomNode key={box.room.pageId} box={box} selected={selected === box.room.pageId} onSelect={onSelect} onOpen={onOpen} />
      ))}
    </g>
  );
}