// pedestrians.js — the people of Coral Bay. They stroll the pavement grid
// from corner to corner, chat in pairs, and run for their lives when the
// shooting starts or a car mounts the kerb at them.

import { BLOCK_COLS, BLOCK_ROWS, PITCH, ROAD_W } from './city.js';
import { Rng, clamp, dist } from './rng.js';

const SKIN_TONES = ['#f2c79b', '#d9a066', '#a06a3b', '#6e4525', '#e8b98d'];
const SHIRTS = ['#d95f4b', '#4b7ad9', '#59b06a', '#e3c04d', '#9a6ad9', '#e8e4da', '#3fa7a0', '#d94b8f'];
const PANTS = ['#33404f', '#5a4632', '#2e2a26', '#646c74', '#7a3b3b'];

let nextPedId = 1;

/** One pedestrian record. state: 'walk' | 'flee' | 'down' | 'driver' */
export function createPedestrian(rng, x, y) {
  return {
    id: nextPedId++,
    x,
    y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walkSpeed: rng.range(38, 62),
    walkPhase: rng.range(0, 6),
    skin: rng.pick(SKIN_TONES),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    state: 'walk',
    node: null,
    target: null,
    waitAt: 0,
    downTime: 0,
    vehicle: null, // when state === 'driver', the car they belong to
  };
}

/** Pavement line coordinates: the walkable grid just inside each road. */
export function pavementX(i) {
  return i * PITCH + ROAD_W + 9;
}
export function pavementY(j) {
  return j * PITCH + ROAD_W + 9;
}

export class PedestrianManager {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.peds = [];
  }

  spawn(count = 42) {
    for (let n = 0; n < count; n++) {
      const i = this.rng.int(0, BLOCK_COLS - 1);
      const j = this.rng.int(0, BLOCK_ROWS - 1);
      const ped = createPedestrian(this.rng, pavementX(i) + this.rng.range(-4, 4), pavementY(j) + this.rng.range(-4, 4));
      ped.node = [i, j];
      this.chooseTarget(ped);
      this.peds.push(ped);
    }
  }

  chooseTarget(ped) {
    const [i, j] = ped.node;
    const options = [];
    if (i > 0) options.push([i - 1, j]);
    if (i < BLOCK_COLS - 1) options.push([i + 1, j]);
    if (j > 0) options.push([i, j - 1]);
    if (j < BLOCK_ROWS - 1) options.push([i, j + 1]);
    const next = this.rng.pick(options);
    ped.target = { i: next[0], j: next[1], x: pavementX(next[0]), y: pavementY(next[1]) };
  }

  /** A shout, a shot, a crash: everyone near runs. */
  panicAt(x, y, radius = 240) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      if (dist(ped.x, ped.y, x, y) < radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x, y };
        ped.fleeTime = this.rng.range(1.6, 3.2);
      }
    }
  }

  update(dt, world) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTime += dt;
        continue;
      }
      if (ped.state === 'driver') continue; // handled by whoever took the car
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
        ped.angle = away;
        ped.speed = 128;
        this.step(ped, dt, world);
        if (ped.fleeTime <= 0) {
          ped.state = 'walk';
          // re-anchor to the nearest pavement node
          const i = clamp(Math.round((ped.x - ROAD_W - 9) / PITCH), 0, BLOCK_COLS - 1);
          const j = clamp(Math.round((ped.y - ROAD_W - 9) / PITCH), 0, BLOCK_ROWS - 1);
          ped.node = [i, j];
          this.chooseTarget(ped);
        }
        continue;
      }
      // walk
      if (world.time < ped.waitAt) {
        ped.speed = 0;
        continue;
      }
      const t = ped.target;
      if (!t) this.chooseTarget(ped);
      const d = dist(ped.x, ped.y, t.x, t.y);
      if (d < 7) {
        ped.node = [t.i, t.j];
        if (this.rng.chance(0.16)) ped.waitAt = world.time + this.rng.range(0.6, 2.4);
        this.chooseTarget(ped);
        continue;
      }
      ped.angle = Math.atan2(t.y - ped.y, t.x - ped.x);
      ped.speed = ped.walkSpeed;
      this.step(ped, dt, world);
    }
  }

  step(ped, dt, world) {
    ped.walkPhase += dt * (ped.speed / 9);
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    // People stay out of buildings but may cross roads anywhere.
    let blocked = false;
    for (const rect of world.city.colliders) {
      if (nx > rect.x - 9 && nx < rect.x + rect.w + 9 && ny > rect.y - 9 && ny < rect.y + rect.h + 9) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      ped.x = clamp(nx, 12, world.city.bounds.w - 12);
      ped.y = clamp(ny, 12, world.city.bounds.h - 12);
    } else {
      ped.angle += Math.PI / 2;
    }
  }
}

/** Draw one pedestrian: a little top-down person with a walking swing. */
export function drawPedestrian(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(120,20,16,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-3, -2, 6, 13);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-4.5, -10, 9, 9);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(0, -13, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  const swing = Math.sin(ped.walkPhase * 2) * (ped.speed > 4 ? 3.4 : 0.6);
  // legs
  ctx.fillStyle = ped.pants;
  ctx.fillRect(0, -3.4 + swing * 0.4, 7.5, 3.4);
  ctx.fillRect(0, 0.2 - swing * 0.4, 7.5, 3.4);
  // shadow
  ctx.fillStyle = 'rgba(20,16,8,0.22)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // torso
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6.4, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // arms
  ctx.fillRect(-1, -8 + swing * 0.5, 6.5, 2.8);
  ctx.fillRect(-1, 5.4 - swing * 0.5, 6.5, 2.8);
  // head
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(1.4, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void time;
}
