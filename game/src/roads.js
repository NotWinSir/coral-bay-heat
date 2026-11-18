// roads.js — the street graph of Coral Bay. Intersections sit where the
// road strips cross; traffic drives node to node along lanes offset to
// the right of its direction of travel.

import { BLOCK_COLS, BLOCK_ROWS, PITCH, ROAD_W } from './city.js';

export const LANE_OFFSET = ROAD_W * 0.24;

/** Centre coordinate of vertical road strip i (0..BLOCK_COLS). */
export function roadCenterX(i) {
  return i * PITCH + ROAD_W / 2;
}

/** Centre coordinate of horizontal road strip j (0..BLOCK_ROWS). */
export function roadCenterY(j) {
  return j * PITCH + ROAD_W / 2;
}

/** World position of intersection node (i, j). */
export function nodePos(i, j) {
  return { x: roadCenterX(i), y: roadCenterY(j) };
}

/** Neighbouring nodes of (i, j) on the grid. */
export function nodeNeighbors(i, j) {
  const out = [];
  if (i > 0) out.push([i - 1, j]);
  if (i < BLOCK_COLS) out.push([i + 1, j]);
  if (j > 0) out.push([i, j - 1]);
  if (j < BLOCK_ROWS) out.push([i, j + 1]);
  return out;
}

/**
 * Point at fraction t along the driving lane from node A to node B.
 * The lane is offset to the right of the direction of travel.
 */
export function lanePoint(ax, ay, bx, by, t) {
  const A = nodePos(ax, ay);
  const B = nodePos(bx, by);
  const dx = Math.sign(B.x - A.x);
  const dy = Math.sign(B.y - A.y);
  // Right of travel in screen space (y down): (-dy, dx).
  const ox = -dy * LANE_OFFSET;
  const oy = dx * LANE_OFFSET;
  return {
    x: A.x + (B.x - A.x) * t + ox,
    y: A.y + (B.y - A.y) * t + oy,
    angle: Math.atan2(dy, dx),
  };
}

/** Is a point on a road strip (not inside a block)? */
export function isOnRoad(x, y) {
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  return mx < ROAD_W || my < ROAD_W;
}

/** The nearest intersection node indices to a world point. */
export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(BLOCK_COLS, Math.round((x - ROAD_W / 2) / PITCH)));
  const j = Math.max(0, Math.min(BLOCK_ROWS, Math.round((y - ROAD_W / 2) / PITCH)));
  return [i, j];
}
