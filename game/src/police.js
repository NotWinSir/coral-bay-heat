// police.js — the Coral Bay Police Department: the wanted level, witness
// rules, interceptor pursuits, the bust meter, cooling-off decay and the
// two hideouts where Marco can lie low until the heat dies.

import { nearestNode, nodePos } from './roads.js';
import { VEHICLE_TYPES, createVehicle, updateVehiclePhysics } from './vehicles.js';
import { angleDelta, clamp, dist } from './rng.js';

export const MAX_WANTED = 5;
const SIGHT_RADIUS = 430; // a cop or pedestrian this close can witness a crime
const DECAY_SECONDS = 11; // unseen time per star shed
const HIDEOUT_CLEAR_SECONDS = 2.6;

export class PoliceSystem {
  constructor(city) {
    this.city = city;
    this.wanted = 0;
    this.units = []; // interceptor vehicles (also in world.vehicles)
    this.unseenTime = 0;
    this.bustMeter = 0;
    this.hideoutTime = 0;
    this.spawnCooldown = 0;
    this.locked = 0; // a story floor: wanted cannot decay below this while set
  }

  /** How many interceptors the current wanted level fields. */
  desiredUnits() {
    return this.wanted === 0 ? 0 : Math.min(5, this.wanted + (this.wanted >= 4 ? 1 : 0));
  }

  /** Can anyone at the scene see the player commit this? */
  witnessed(world, x, y) {
    for (const unit of this.units) {
      if (dist(x, y, unit.x, unit.y) < SIGHT_RADIUS) return true;
    }
    for (const ped of world.pedestrians.peds) {
      if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 170) return true;
    }
    return false;
  }

  /**
   * Report a crime. kind sets the base stars; quiet crimes only count
   * when witnessed. Returns the new wanted level.
   */
  reportCrime(world, kind, x, y) {
    const seen = this.witnessed(world, x, y);
    let stars = 0;
    switch (kind) {
      case 'carjack': stars = seen ? 1 : 0; break;
      case 'theft': stars = seen ? 1 : 0; break;
      case 'gunshot': stars = seen ? 1 : 0; break;
      case 'assault': stars = 1; break;
      case 'pedDown': stars = seen ? 2 : 1; break;
      case 'thugDown': stars = seen ? 1 : 0; break;
      case 'copHit': stars = 2; break;
      case 'copDown': stars = 3; break;
      case 'heist': stars = 3; break;
      default: stars = 0;
    }
    if (stars > 0) {
      this.wanted = clamp(this.wanted + stars, 0, MAX_WANTED);
      this.unseenTime = 0;
      world.onWantedChanged(this.wanted);
    }
    return this.wanted;
  }

  setWanted(world, level) {
    this.wanted = clamp(level, 0, MAX_WANTED);
    this.unseenTime = 0;
    world.onWantedChanged(this.wanted);
  }

  addWanted(world, stars) {
    if (stars <= 0) return;
    this.wanted = clamp(this.wanted + stars, 0, MAX_WANTED);
    this.unseenTime = 0;
    world.onWantedChanged(this.wanted);
  }

  /** True when any unit currently has eyes on the player. */
  playerSeen(world) {
    const p = world.player;
    for (const unit of this.units) {
      if (dist(p.x, p.y, unit.x, unit.y) < SIGHT_RADIUS) return true;
    }
    return false;
  }

  /** Is the player lying low inside a hideout zone? */
  hideoutAt(world) {
    const p = world.player;
    const spots = [world.city.specials.motel.door, world.city.specials.hillsideHideout.door];
    for (const door of spots) {
      if (dist(p.x, p.y, door.x, door.y) < 84) return true;
    }
    return false;
  }

  spawnUnit(world) {
    const p = world.player;
    const [ni, nj] = nearestNode(p.x, p.y);
    const rng = world.rng;
    for (let tries = 0; tries < 8; tries++) {
      const i = clamp(ni + rng.int(-4, 4), 0, 16);
      const j = clamp(nj + rng.int(-4, 4), 0, 12);
      const pos = nodePos(i, j);
      const d = dist(pos.x, pos.y, p.x, p.y);
      if (d < 560 || d > 1250) continue;
      const unit = createVehicle('police', pos.x, pos.y, rng.range(0, Math.PI * 2), VEHICLE_TYPES.police.colors[0], 'police');
      unit.driverPresent = true;
      this.units.push(unit);
      world.vehicles.push(unit);
      return unit;
    }
    return null;
  }

  update(dt, world) {
    const p = world.player;
    this.spawnCooldown -= dt;

    // Field or retire units to match the wanted level.
    if (this.units.length < this.desiredUnits() && this.spawnCooldown <= 0) {
      if (this.spawnUnit(world)) this.spawnCooldown = 1.6;
    }
    if (this.wanted === 0) {
      for (const unit of this.units) {
        if (dist(unit.x, unit.y, p.x, p.y) > 900) this.retireUnit(world, unit);
      }
    }

    const seen = this.playerSeen(world);
    let nearestCop = Infinity;
    for (const unit of this.units) {
      nearestCop = Math.min(nearestCop, dist(unit.x, unit.y, p.x, p.y));
    }

    // Pursuit driving: aim at the player, ram a car, but pull up beside a
    // man on foot so the bust can actually happen.
    for (const unit of this.units) {
      const d = dist(unit.x, unit.y, p.x, p.y);
      const fleeing = this.wanted === 0;
      const targetAngle = fleeing
        ? Math.atan2(unit.y - p.y, unit.x - p.x)
        : Math.atan2(p.y - unit.y, p.x - unit.x);
      const steer = clamp(angleDelta(unit.angle, targetAngle) * 2.4, -1, 1);
      let throttle = fleeing ? 0.55 : d > 70 ? 1 : 0.35;
      let brake = false;
      if (!fleeing && !p.inVehicle) {
        if (d < 46) {
          throttle = 0;
          brake = true;
        } else if (d < 130) {
          throttle = 0.3;
        }
      }
      const impact = updateVehiclePhysics(world.city, unit, dt, { throttle, steer, brake });
      if (impact > 150) world.audio.crash(0.4);
      // A unit never drives through a man on foot: it noses up to him.
      if (!p.inVehicle) {
        const d2 = dist(unit.x, unit.y, p.x, p.y);
        if (d2 < 44 && d2 > 0.01) {
          unit.x = p.x + ((unit.x - p.x) / d2) * 44;
          unit.y = p.y + ((unit.y - p.y) / d2) * 44;
          unit.speed *= 0.4;
        }
      }
    }

    // Siren loudness follows the nearest unit.
    world.audio.setSiren(this.units.length > 0 && this.wanted > 0, clamp(1 - nearestCop / 700, 0, 1));

    // Bust meter: a unit on top of a slow or on-foot Marco fills it.
    const playerSpeed = p.inVehicle ? Math.abs(p.inVehicle.speed) : 0;
    let busting = false;
    if (this.wanted > 0) {
      for (const unit of this.units) {
        const d = dist(unit.x, unit.y, p.x, p.y);
        const range = p.inVehicle ? 96 : 120;
        if (d < range && (playerSpeed < 46 || !p.inVehicle)) {
          busting = true;
          break;
        }
      }
    }
    if (busting) {
      this.bustMeter += dt / (p.inVehicle ? 2.4 : 1.7);
      if (this.bustMeter >= 1) {
        this.bustMeter = 0;
        world.onBusted();
        return;
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.55);
    }

    // Hideouts clear the heat quickly when nobody is watching.
    if (this.wanted > 0 && this.hideoutAt(world) && !seen) {
      this.hideoutTime += dt;
      if (this.hideoutTime >= HIDEOUT_CLEAR_SECONDS) {
        this.setWanted(world, 0);
        this.hideoutTime = 0;
        world.toast('The heat dies down. You are clear.', '#7dd87d');
      }
    } else {
      this.hideoutTime = 0;
    }

    // Cooling off: unseen time sheds stars, down to any story floor.
    if (this.wanted > this.locked) {
      if (!seen) {
        this.unseenTime += dt;
        if (this.unseenTime >= DECAY_SECONDS) {
          this.unseenTime = 0;
          this.wanted -= 1;
          world.onWantedChanged(this.wanted);
        }
      } else {
        this.unseenTime = 0;
      }
    }
  }

  retireUnit(world, unit) {
    this.units = this.units.filter((u) => u !== unit);
    world.vehicles = world.vehicles.filter((v) => v !== unit);
  }

  /** Remove every unit (busted, wasted, new game). */
  clearAll(world) {
    for (const unit of [...this.units]) this.retireUnit(world, unit);
    this.wanted = 0;
    this.bustMeter = 0;
    this.unseenTime = 0;
    world.audio.setSiren(false, 0);
  }
}
