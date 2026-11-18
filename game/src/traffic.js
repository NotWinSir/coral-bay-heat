// traffic.js — Coral Bay's everyday drivers. Active cars follow the road
// graph lane by lane, queue behind each other and pick a new street at
// every intersection; parked cars line the kerbs and the parking lots.

import { BLOCK_COLS, BLOCK_ROWS, PITCH, ROAD_W, blockRect, SIDEWALK } from './city.js';
import { lanePoint, nodeNeighbors } from './roads.js';
import { VEHICLE_TYPES, createVehicle } from './vehicles.js';
import { Rng, clamp, dist, turnToward } from './rng.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'hatch', 'hatch', 'van', 'sport', 'truck'];

export class TrafficManager {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.cars = []; // active traffic vehicles (also in world.vehicles)
    this.parked = [];
  }

  /** Scatter parked cars along kerbs and across the parking lots. */
  spawnParked(allVehicles) {
    const rng = this.rng;
    const spots = [];
    for (const lot of this.city.lots) {
      for (let i = 0; i < 4; i++) {
        spots.push({
          x: lot.x + 18 + (i % 2) * (lot.w - 44),
          y: lot.y + 20 + Math.floor(i / 2) * (lot.h - 48),
          angle: Math.PI / 2,
        });
      }
    }
    for (let k = 0; k < 90 && spots.length < 30 + 12; k++) {
      const vertical = rng.chance(0.5);
      const i = rng.int(0, BLOCK_COLS);
      const j = rng.int(0, BLOCK_ROWS - 1);
      if (vertical) {
        const x = i * PITCH + (rng.chance(0.5) ? 13 : ROAD_W - 13);
        const y = j * PITCH + ROAD_W + rng.range(20, PITCH - ROAD_W - 20);
        spots.push({ x, y, angle: Math.PI / 2 });
      } else {
        const x = i * PITCH + ROAD_W + rng.range(20, PITCH - ROAD_W - 20);
        const y = j * PITCH + (rng.chance(0.5) ? 13 : ROAD_W - 13);
        spots.push({ x, y, angle: 0 });
      }
    }
    let made = 0;
    for (const spot of spots) {
      if (made >= 30) break;
      if (this.city.colliders.some((r) => spot.x > r.x - 26 && spot.x < r.x + r.w + 26 && spot.y > r.y - 26 && spot.y < r.y + r.h + 26)) continue;
      const type = this.rng.pick(TRAFFIC_TYPES);
      const v = createVehicle(type, spot.x, spot.y, spot.angle, this.rng.pick(VEHICLE_TYPES[type].colors), 'parked');
      v.driverPresent = false;
      this.parked.push(v);
      allVehicles.push(v);
      made++;
    }
  }

  /** Put the moving traffic on the graph. */
  spawnActive(allVehicles, count = 13) {
    for (let n = 0; n < count; n++) {
      const i = this.rng.int(0, BLOCK_COLS);
      const j = this.rng.int(0, BLOCK_ROWS);
      const type = this.rng.pick(TRAFFIC_TYPES);
      const v = createVehicle(type, 0, 0, 0, this.rng.pick(VEHICLE_TYPES[type].colors), 'traffic');
      const next = this.rng.pick(nodeNeighbors(i, j));
      v.lane = { ax: i, ay: j, bx: next[0], by: next[1] };
      v.laneT = this.rng.range(0.1, 0.9);
      v.cruiseSpeed = this.rng.range(105, 165);
      const p = lanePoint(i, j, next[0], next[1], v.laneT);
      v.x = p.x;
      v.y = p.y;
      v.angle = p.angle;
      this.cars.push(v);
      allVehicles.push(v);
    }
  }

  /** Advance every active traffic car. */
  update(dt, world) {
    const player = world.player;
    for (const car of this.cars) {
      if (car.mode !== 'traffic') continue; // stolen or wrecked: no longer ours
      const lane = car.lane;
      const a = lanePoint(lane.ax, lane.ay, lane.bx, lane.by, 0);
      const b = lanePoint(lane.ax, lane.ay, lane.bx, lane.by, 1);
      const laneLength = Math.hypot(b.x - a.x, b.y - a.y);

      // Slow for the car ahead on the same lane, or anything close in front.
      let targetSpeed = car.cruiseSpeed;
      for (const other of world.vehicles) {
        if (other === car) continue;
        const ahead = dist(car.x, car.y, other.x, other.y);
        if (ahead > 74) continue;
        const fx = car.x + Math.cos(car.angle) * 40;
        const fy = car.y + Math.sin(car.angle) * 40;
        if (dist(fx, fy, other.x, other.y) < 52) {
          targetSpeed = Math.min(targetSpeed, Math.max(0, (ahead - 46) * 3.2));
          if (ahead < 52 && world.time - car.honkAt > 2.4) {
            car.honkAt = world.time;
            if (dist(car.x, car.y, player.x, player.y) < 340) world.audio.blip(340, 0.16, 'square', 0.05);
          }
        }
      }
      // The player's car stopped in the lane counts too.
      car.speed += clamp(targetSpeed - car.speed, -260 * dt, 120 * dt);
      if (car.speed < 0) car.speed = 0;
      car.laneT += (car.speed * dt) / laneLength;

      if (car.laneT >= 1) {
        // Choose the next street: prefer going straight, never U-turn.
        const options = nodeNeighbors(lane.bx, lane.by).filter(([i, j]) => !(i === lane.ax && j === lane.ay));
        const straight = options.find(([i, j]) => Math.sign(i - lane.bx) === Math.sign(lane.bx - lane.ax) && Math.sign(j - lane.by) === Math.sign(lane.by - lane.ay));
        const nextNode = straight && this.rng.chance(0.62) ? straight : this.rng.pick(options);
        car.lane = { ax: lane.bx, ay: lane.by, bx: nextNode[0], by: nextNode[1] };
        car.laneT = 0;
      }
      const p = lanePoint(car.lane.ax, car.lane.ay, car.lane.bx, car.lane.by, car.laneT);
      car.x = p.x;
      car.y = p.y;
      car.angle = turnToward(car.angle, p.angle, dt * 5);
      car.steer = 0;
    }

    // Respawn runaway traffic near the player so the city never empties.
    for (const car of this.cars) {
      if (car.mode !== 'traffic') continue;
      if (dist(car.x, car.y, player.x, player.y) > 1750) {
        const [ni, nj] = [Math.max(0, Math.min(BLOCK_COLS, Math.round(player.x / PITCH))), Math.max(0, Math.min(BLOCK_ROWS, Math.round(player.y / PITCH)))];
        const i = clamp(ni + this.rng.int(-3, 3), 0, BLOCK_COLS);
        const j = clamp(nj + this.rng.int(-3, 3), 0, BLOCK_ROWS);
        const next = this.rng.pick(nodeNeighbors(i, j));
        car.lane = { ax: i, ay: j, bx: next[0], by: next[1] };
        car.laneT = this.rng.range(0.1, 0.6);
        const p = lanePoint(i, j, next[0], next[1], car.laneT);
        car.x = p.x;
        car.y = p.y;
        car.angle = p.angle;
        car.speed = car.cruiseSpeed * 0.7;
      }
    }
  }
}

/** A random kerb-side parking spot near a block, for story cars. */
export function kerbSpotNear(rng, bx, by) {
  const r = blockRect(bx, by);
  const south = rng.chance(0.5);
  return {
    x: r.x + rng.range(30, r.w - 30),
    y: r.y + r.h + (south ? ROAD_W / 2 + 12 : 0) + SIDEWALK * 0,
    angle: 0,
  };
}
