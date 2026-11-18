// player.js — Marco Reyes on foot and behind the wheel: movement, aiming,
// entering and stealing cars, and the driver's-seat controls.

import { collideCircle } from './city.js';
import { clamp, dist } from './rng.js';
import { updateVehiclePhysics, vehiclesOverlap } from './vehicles.js';

export const PLAYER_RADIUS = 13;

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    speed: 0,
    walkPhase: 0,
    inVehicle: null,
    radius: PLAYER_RADIUS,
    fireCooldown: 0,
    hurtFlash: 0,
    stepSide: 1,
  };
}

/** World-space aim point from the screen-space mouse. */
export function aimFromMouse(player, input, camera) {
  const wx = camera.x + input.mouse.x - camera.viewW / 2;
  const wy = camera.y + input.mouse.y - camera.viewH / 2;
  player.aimAngle = Math.atan2(wy - player.y, wx - player.x);
  return { x: wx, y: wy };
}

/** The nearest vehicle the player could get into, or null. */
export function nearestVehicle(world, maxDist = 52) {
  const p = world.player;
  let best = null;
  let bestD = maxDist;
  for (const v of world.vehicles) {
    if (v.hp <= 10) continue;
    const d = dist(p.x, p.y, v.x, v.y) - v.def.w / 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/**
 * Put the player into a vehicle. If it had a driver, that is a carjacking:
 * the driver is thrown out as a fleeing pedestrian and the law notices.
 */
export function enterVehicle(world, vehicle) {
  const p = world.player;
  const hadDriver = vehicle.driverPresent;
  const wasParked = vehicle.mode === 'parked';
  p.inVehicle = vehicle;
  vehicle.mode = 'player';
  if (hadDriver) {
    vehicle.driverPresent = false;
    vehicle.stolen = true;
    world.onCarjacked(vehicle);
  } else if (wasParked && !vehicle.owned) {
    vehicle.stolen = true;
  }
  world.audio.carjack();
}

/** Step out of the current vehicle, beside its door. */
export function exitVehicle(world) {
  const p = world.player;
  const v = p.inVehicle;
  if (!v) return;
  p.inVehicle = null;
  v.mode = v.type === 'police' ? 'parked' : 'parked';
  v.speed = 0;
  const side = Math.PI / 2;
  const ex = v.x + Math.cos(v.angle + side) * (v.def.h / 2 + 16);
  const ey = v.y + Math.sin(v.angle + side) * (v.def.h / 2 + 16);
  const fixed = collideCircle(world.city, ex, ey, p.radius);
  p.x = fixed.x;
  p.y = fixed.y;
  world.audio.stopEngine();
}

/** Per-frame update while playing. mode is the world screen state. */
export function updatePlayer(world, dt) {
  const p = world.player;
  const input = world.input;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  if (p.inVehicle) {
    const v = p.inVehicle;
    const control = {
      throttle: (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) + (input.isDown('KeyS', 'ArrowDown') ? -1 : 0),
      steer: (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) + (input.isDown('KeyA', 'ArrowLeft') ? -1 : 0),
      brake: input.isDown('Space'),
    };
    const impact = updateVehiclePhysics(world.city, v, dt, control);
    p.x = v.x;
    p.y = v.y;
    p.angle = v.angle;
    p.speed = Math.abs(v.speed);
    world.stats.distanceDriven += Math.abs(v.speed) * dt;
    if (impact > 130) {
      world.onVehicleCrash(v, impact);
    } else if (impact > 40) {
      world.audio.crash(0.3);
      world.shake = Math.min(6, impact * 0.02);
    }
    // Vehicle vs vehicle bumps.
    for (const other of world.vehicles) {
      if (other === v) continue;
      if (vehiclesOverlap(v, other)) {
        world.onVehicleBump(v, other);
      }
    }
    world.audio.setEngine(clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1), Math.abs(control.throttle));
    if (input.wasPressed('KeyE', 'KeyF')) {
      input.consume('KeyE', 'KeyF');
      exitVehicle(world);
    }
    return;
  }

  // On foot.
  let mx = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (input.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (input.isDown('KeyW', 'ArrowUp') ? 1 : 0);
  const sprint = input.isDown('ShiftLeft', 'ShiftRight');
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
  }
  const speed = sprint ? 218 : 138;
  p.speed = moving ? speed : 0;
  if (moving) {
    p.walkPhase += dt * (sprint ? 11 : 8.5);
    const fixed = collideCircle(world.city, p.x + mx * speed * dt, p.y + my * speed * dt, p.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    // Cars are solid to walk into.
    for (const v of world.vehicles) {
      const d = dist(p.x, p.y, v.x, v.y);
      if (d < v.def.w / 2 + p.radius - 4 && d > 0.01) {
        const push = (v.def.w / 2 + p.radius - 4 - d);
        p.x += ((p.x - v.x) / d) * push;
        p.y += ((p.y - v.y) / d) * push;
      }
    }
  }
  aimFromMouse(p, input, world.camera);
  p.angle = moving ? p.angle : p.aimAngle;

  if (input.wasPressed('KeyE', 'KeyF')) {
    input.consume('KeyE', 'KeyF');
    // Talking to Vera (or resting) wins over climbing into a car.
    if (!world.tryInteract()) {
      const v = nearestVehicle(world);
      if (v) {
        enterVehicle(world, v);
        world.missions.onEnterVehicle(world, v);
      }
    }
  }
}

/** Damage the player; returns true when this kills him. */
export function hurtPlayer(world, amount) {
  const p = world.player;
  if (world.state !== 'playing') return false;
  p.hp -= amount;
  p.hurtFlash = 0.25;
  world.audio.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    return true;
  }
  return false;
}
