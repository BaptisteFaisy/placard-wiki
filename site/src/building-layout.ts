// Disposition SVG du bâtiment (§10) : ailes = espaces, étages = profondeur,
// pièces = pages (taille = audience). Rendu volontairement schématique ;
// toute donnée a un élément, aucun décor gratuit. Fonctions pures, sans JSX.

import type { BuildingModel } from '@placard-wiki/domain';

export type RoomShape = BuildingModel['wings'][number]['floors'][number]['rooms'][number];
export interface RoomBox {
  room: RoomShape;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}
export interface WingBox {
  spaceKey: string;
  rooms: RoomBox[];
  drafts: BuildingModel['wings'][number]['drafts'];
  width: number;
  height: number;
  x: number;
}

export const ROOM_H = 56;
const GAP_X = 14;
const FLOOR_GAP = 56;

/** Largeur d'une pièce proportionnelle à son audience (taille = audience). */
export function roomWidth(audience: number): number {
  return 68 + Math.round(Math.sqrt(Math.max(0, audience)) * 3);
}

/** Étend une aile en boîtes positionnées : le sqrt modère les écarts. */
export function layoutWing(
  wing: BuildingModel['wings'][number],
  x0: number,
): WingBox {
  const rooms: RoomBox[] = [];
  let y = 20;
  for (const floor of wing.floors) {
    let x = x0 + 8;
    const roomHs = floor.rooms.map((room) => roomWidth(room.audience));
    for (let i = 0; i < floor.rooms.length; i += 1) {
      const room = floor.rooms[i];
      if (!room) continue;
      const w = roomHs[i] ?? 80;
      rooms.push({
        room,
        x,
        y,
        w,
        h: ROOM_H,
        cx: x + w / 2,
        cy: y + ROOM_H / 2,
      });
      x += w + GAP_X;
    }
    y += ROOM_H + FLOOR_GAP;
  }
  const width = rooms.reduce((m, b) => Math.max(m, b.x + b.w), 0) - x0;
  return { spaceKey: wing.spaceKey, rooms, drafts: wing.drafts, width, height: y, x: x0 };
}

/** Positionne toutes les ailes côte à côte, renvoie aussi les marges. */
export function layoutBuilding(building: BuildingModel): {
  wings: WingBox[];
  width: number;
  height: number;
} {
  let x = 20;
  const wings: WingBox[] = [];
  let maxH = 0;
  for (const wing of building.wings) {
    const box = layoutWing(wing, x);
    wings.push(box);
    x += box.width + 40;
    maxH = Math.max(maxH, box.height);
  }
  return { wings, width: x + 20, height: maxH + 40 };
}