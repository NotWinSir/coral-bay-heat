// city.js — Coral Bay itself: a 16 x 12 block grid in 8 districts, generated
// from a seed. Roads run between the blocks; each block holds buildings, a
// park or a parking lot, and a few blocks hold the story's named places:
// Cafe Castellan, the Marina cash office, Reyes Auto, Motel Brisa, the
// Hillside hideout, Coral Heights Hospital and the CBPD station.

import { Rng } from './rng.js';

export const BLOCK_COLS = 16;
export const BLOCK_ROWS = 12;
export const PITCH = 264; // block pitch: road + block interior
export const ROAD_W = 76; // width of every street
export const BLOCK_SIZE = PITCH - ROAD_W; // 188 px of buildable block
export const WORLD_W = BLOCK_COLS * PITCH + ROAD_W;
export const WORLD_H = BLOCK_ROWS * PITCH + ROAD_W;
export const SIDEWALK = 16; // pavement frame inside each block

export const DISTRICTS = [
  { name: 'Old Town', ground: '#b8a888', roofs: ['#a4553f', '#8f6b4a', '#b0704f', '#7d5a41'], walls: ['#d9c39a', '#cdb488', '#e2cfa5', '#c9ae7f'] },
  { name: 'Downtown', ground: '#9aa0a4', roofs: ['#5d6a72', '#6e7a80', '#54626b', '#77828a'], walls: ['#b9c2c7', '#aeb8bf', '#c6ced3', '#9fb0ba'] },
  { name: 'Coral Heights', ground: '#a8b09a', roofs: ['#7a8a5f', '#8a9a6d', '#6d7f56', '#97a87c'], walls: ['#e3e0cd', '#dcd8c2', '#eae6d2', '#d5d0b8'] },
  { name: 'Hillside', ground: '#a39a7d', roofs: ['#96604a', '#a8704f', '#87563f', '#b3815c'], walls: ['#e6d3ae', '#dcc69e', '#efe0ba', '#d8bd94'] },
  { name: 'Portside', ground: '#96938a', roofs: ['#6b6f66', '#7c7a6e', '#5d6259', '#87837a'], walls: ['#c4beb0', '#b5b0a2', '#cfc9ba', '#aaa495'] },
  { name: 'Marina', ground: '#a7b3a4', roofs: ['#4f7d86', '#5d8a94', '#447079', '#6b99a2'], walls: ['#dcebe6', '#cfe2da', '#e8f2ec', '#c2d8cd'] },
  { name: 'Palm District', ground: '#b3a37e', roofs: ['#b0623f', '#c07a4a', '#a5573a', '#cd8a58'], walls: ['#f0dcb2', '#e8d2a2', '#f6e4bc', '#e2c48f'] },
  { name: 'Airport Flats', ground: '#a5a094', roofs: ['#7d7f78', '#8b8a80', '#6f7268', '#99968c'], walls: ['#d2ccc0', '#c6c0b2', '#ddd7ca', '#bab3a4'] },
];

/** District index for a block: 4 district columns x 2 district rows. */
export function districtIndexAt(bx, by) {
  const dcol = Math.min(3, Math.floor(bx / 4));
  const drow = Math.min(1, Math.floor(by / 6));
  return drow * 4 + dcol;
}

/** World-space rect of a block's interior (inside its surrounding roads). */
export function blockRect(bx, by) {
  return {
    x: ROAD_W + bx * PITCH,
    y: ROAD_W + by * PITCH,
    w: BLOCK_SIZE,
    h: BLOCK_SIZE,
  };
}

/** Named story locations, placed on fixed blocks. */
const SPECIAL_BLOCKS = {
  cafe: { bx: 5, by: 2, name: 'Cafe Castellan', color: '#8a4b3a', roof: '#5f3125' },
  policeStation: { bx: 6, by: 1, name: 'CBPD Central', color: '#5d6a72', roof: '#39434a' },
  hospital: { bx: 10, by: 2, name: 'Coral Heights Hospital', color: '#cfd6d2', roof: '#8fa39b' },
  hillsideHideout: { bx: 14, by: 1, name: 'Hillside Villa', color: '#a8704f', roof: '#6e4530' },
  chopShop: { bx: 2, by: 8, name: 'Reyes Auto', color: '#7c7a6e', roof: '#4c4a42' },
  marinaOffice: { bx: 5, by: 9, name: 'Marina Cash Office', color: '#4f7d86', roof: '#2f4e55' },
  motel: { bx: 9, by: 8, name: 'Motel Brisa', color: '#c07a4a', roof: '#7d4c2a' },
};

/**
 * Generate the whole city from a seed.
 * Returns buildings (with collision), parks, lots, palms, lamps, the named
 * specials (with a door point on the pavement) and the flat collider list.
 */
export function generateCity(seed) {
  const rng = new Rng(((seed ^ 0x9e3779b9) * 2654435761) >>> 0);
  const buildings = [];
  const parks = [];
  const lots = [];
  const palms = [];
  const lamps = [];
  const specials = {};

  for (const [key, spec] of Object.entries(SPECIAL_BLOCKS)) {
    const r = blockRect(spec.bx, spec.by);
    const pad = SIDEWALK + 10;
    const b = {
      x: r.x + pad,
      y: r.y + pad,
      w: r.w - pad * 2,
      h: r.h - pad * 2,
      height: 26,
      wall: spec.color,
      roof: spec.roof,
      name: spec.name,
      special: key,
      district: districtIndexAt(spec.bx, spec.by),
    };
    buildings.push(b);
    specials[key] = {
      ...spec,
      building: b,
      // the door point sits on the pavement at the block's south edge
      door: { x: r.x + r.w / 2, y: r.y + r.h - 6 },
      block: { bx: spec.bx, by: spec.by },
    };
  }

  for (let by = 0; by < BLOCK_ROWS; by++) {
    for (let bx = 0; bx < BLOCK_COLS; bx++) {
      const r = blockRect(bx, by);
      const di = districtIndexAt(bx, by);
      const district = DISTRICTS[di];
      const isSpecial = Object.values(SPECIAL_BLOCKS).some((s) => s.bx === bx && s.by === by);
      if (isSpecial) continue;
      const roll = rng.next();
      if (roll < 0.1) {
        parks.push({ x: r.x + SIDEWALK, y: r.y + SIDEWALK, w: r.w - SIDEWALK * 2, h: r.h - SIDEWALK * 2, district: di });
        for (let i = 0; i < 5; i++) {
          palms.push({
            x: r.x + rng.range(24, r.w - 24),
            y: r.y + rng.range(24, r.h - 24),
            s: rng.range(0.8, 1.25),
          });
        }
        continue;
      }
      if (roll < 0.2) {
        lots.push({ x: r.x + SIDEWALK, y: r.y + SIDEWALK, w: r.w - SIDEWALK * 2, h: r.h - SIDEWALK * 2, district: di });
        continue;
      }
      // Ordinary block: 1-4 buildings on a small inner grid.
      const tall = di === 1; // Downtown builds up
      const count = tall ? rng.int(2, 4) : rng.int(1, 3);
      const inner = SIDEWALK + 8;
      const area = { x: r.x + inner, y: r.y + inner, w: r.w - inner * 2, h: r.h - inner * 2 };
      const cells = count === 1 ? [[0, 0, 1, 1]] : count === 2 ? [[0, 0, 1, 0.52], [0, 0.52, 1, 0.48]] : [[0, 0, 0.52, 0.52], [0.52, 0, 0.48, 0.52], [0, 0.52, 0.52, 0.48], [0.52, 0.52, 0.48, 0.48]].slice(0, count);
      for (const [fx, fy, fw, fh] of cells) {
        const gap = 5;
        buildings.push({
          x: area.x + fx * area.w + gap,
          y: area.y + fy * area.h + gap,
          w: fw * area.w - gap * 2,
          h: fh * area.h - gap * 2,
          height: tall ? rng.range(38, 74) : rng.range(12, 30),
          wall: rng.pick(district.walls),
          roof: rng.pick(district.roofs),
          name: null,
          special: null,
          district: di,
        });
      }
      if (rng.chance(0.55)) {
        palms.push({ x: r.x + rng.range(14, 30), y: r.y + rng.range(14, 30), s: rng.range(0.75, 1.1) });
      }
    }
  }

  // Street lamps at intersection corners.
  for (let i = 0; i <= BLOCK_COLS; i++) {
    for (let j = 0; j <= BLOCK_ROWS; j++) {
      if ((i + j) % 2 === 0) {
        lamps.push({ x: i * PITCH + 8, y: j * PITCH + 8 });
      }
    }
  }

  const colliders = buildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

  return {
    seed,
    buildings,
    parks,
    lots,
    palms,
    lamps,
    specials,
    colliders,
    bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
  };
}

/** Does a circle overlap a rect? */
export function circleRectHit(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Push a circle out of every building and the world bounds.
 * Returns the corrected position and whether anything was hit.
 */
export function collideCircle(city, x, y, r) {
  let hit = false;
  for (const rect of city.colliders) {
    if (!circleRectHit(x, y, r, rect)) continue;
    hit = true;
    const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    let dx = x - nx;
    let dy = y - ny;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) {
      // Centre inside the rect: leave by the shallowest side.
      const left = x - rect.x;
      const right = rect.x + rect.w - x;
      const top = y - rect.y;
      const bottom = rect.y + rect.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = rect.x - r;
      else if (m === right) x = rect.x + rect.w + r;
      else if (m === top) y = rect.y - r;
      else y = rect.y + rect.h + r;
      continue;
    }
    dx /= d;
    dy /= d;
    x = nx + dx * r;
    y = ny + dy * r;
  }
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > WORLD_W - r) { x = WORLD_W - r; hit = true; }
  if (y > WORLD_H - r) { y = WORLD_H - r; hit = true; }
  return { x, y, hit };
}

/** Is the segment from a to b blocked by any building? (Cheap sight test.) */
export function lineBlocked(city, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 18);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const rect of city.colliders) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
    }
  }
  return false;
}

/** The district index under a world position. */
export function districtAtPoint(x, y) {
  const bx = Math.max(0, Math.min(BLOCK_COLS - 1, Math.floor((x - ROAD_W) / PITCH)));
  const by = Math.max(0, Math.min(BLOCK_ROWS - 1, Math.floor((y - ROAD_W) / PITCH)));
  return districtIndexAt(bx, by);
}
