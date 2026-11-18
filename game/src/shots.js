// shots.js — deterministic staging for the entry's screenshots. Each
// scene starts a fresh game and arranges a real moment of play: driving
// downtown on Vera's first job, a four-star chase, a stroll past the
// cafe, and the Marina cash office shootout. Nothing is composited:
// main.js runs the world for a few fixed steps, then renders one frame.

import { PITCH, ROAD_W } from './city.js';
import { MISSION_DEFS } from './missions.js';
import { enterVehicle } from './player.js';
import { createVehicle } from './vehicles.js';

export const SHOT_NAMES = ['cover', 'chase', 'foot', 'mission'];

/** Horizontal road centre just south of block row `by`. */
function roadSouthOf(by) {
  return (by + 1) * PITCH + ROAD_W / 2;
}

/** Put a car in the world and Marco in its driver's seat. */
function putPlayerInCar(world, type, x, y, angle, color) {
  const car = createVehicle(type, x, y, angle, color, 'parked');
  car.driverPresent = false;
  car.owned = true;
  world.vehicles.push(car);
  world.player.x = x;
  world.player.y = y;
  enterVehicle(world, car);
  car.owned = true;
  car.stolen = false;
  return car;
}

/** Stage one named scene. The world must be fresh (state 'title'). */
export function applyShot(world, name) {
  world.newGame();
  world.dialogue = null;
  world.dialogueQueue = [];
  world.toasts = [];
  const specials = world.city.specials;

  if (name === 'cover') {
    // Accept Vera's first job so the objective and beacon are live.
    world.player.x = specials.cafe.door.x;
    world.player.y = specials.cafe.door.y + 8;
    world.missions.tryStart(world);
    world.dialogue = null;
    world.dialogueQueue = [];
    // A red Vireo GT eastbound on the avenue south of the cafe, mid-traffic.
    const y = roadSouthOf(2);
    const car = putPlayerInCar(world, 'sport', 1560, y + 9, 0, '#d8402e');
    car.speed = 235;
    world.player.angle = 0;
    snapCamera(world, 1560 + 130, y + 34);
    return;
  }

  if (name === 'chase') {
    // Story state: the heist bag is taken and the heat must be lost.
    world.missions.index = 3;
    world.missions.active = { def: MISSION_DEFS[3], stage: 2, data: {} };
    const y = roadSouthOf(7) - 9;
    const car = putPlayerInCar(world, 'sedan', 2740, y, 0, '#94423a');
    car.speed = 300;
    world.police.setWanted(world, 4);
    const spots = [
      { x: 2740 - 185, y: y - 8, angle: 0.05 },
      { x: 2740 - 330, y: y + 18, angle: -0.04 },
      { x: 2740 - 60, y: y + 42, angle: 0.1 },
      { x: 2740 + 500, y: y - 14, angle: 0.22 },
    ];
    for (const s of spots) {
      const unit = createVehicle('police', s.x, s.y, s.angle, '#20262e', 'police');
      unit.driverPresent = true;
      unit.speed = 205;
      world.police.units.push(unit);
      world.vehicles.push(unit);
    }
    snapCamera(world, 2740 + 90, y);
    return;
  }

  if (name === 'foot') {
    // On the pavement outside Cafe Castellan, neighbours all around.
    const door = specials.cafe.door;
    world.player.x = door.x - 26;
    world.player.y = door.y + 26;
    world.player.aimAngle = 0.5;
    world.player.angle = 0.5;
    const near = [
      [door.x + 44, door.y + 18], [door.x - 78, door.y + 40], [door.x + 96, door.y + 52],
      [door.x - 130, door.y + 12], [door.x + 150, door.y + 26], [door.x - 44, door.y + 74],
    ];
    world.pedestrians.peds.forEach((ped, i) => {
      if (i < near.length) {
        ped.x = near[i][0];
        ped.y = near[i][1];
        ped.state = 'walk';
        ped.waitAt = world.time + 30;
        ped.speed = 0;
      }
    });
    // A taxi rolls past on the avenue.
    const taxi = createVehicle('taxi', door.x + 210, roadSouthOf(2) + 9, 0, '#e8b53a', 'traffic');
    taxi.speed = 120;
    world.vehicles.push(taxi);
    snapCamera(world, door.x + 10, door.y + 30);
    return;
  }

  if (name === 'mission') {
    // The Marina Heist, mid-shootout: guards up the steps, Marco in the open.
    world.missions.index = 3;
    world.missions.active = { def: MISSION_DEFS[3], stage: 0, data: {} };
    world.missions.setup(world, MISSION_DEFS[3]);
    world.combatActive = true;
    const door = specials.marinaOffice.door;
    // The guards hold the street in front of the office, not its roof:
    // pull the setup's spawns out of the building and into the open.
    const guardSpots = [
      { x: door.x - 66, y: door.y + 32 },
      { x: door.x + 60, y: door.y + 28 },
      { x: door.x - 20, y: door.y + 48 },
      { x: door.x + 28, y: door.y + 52 },
    ];
    world.combat.thugs.forEach((thug, i) => {
      const spot = guardSpots[i % guardSpots.length];
      thug.x = spot.x;
      thug.y = spot.y;
      thug.home = { x: spot.x, y: spot.y };
    });
    world.player.x = door.x - 6;
    world.player.y = door.y + 92;
    world.player.aimAngle = -Math.PI / 2;
    world.player.angle = -Math.PI / 2;
    // A getaway sedan parked as cover beside him.
    const cover = createVehicle('sedan', door.x - 62, door.y + 84, 0.12, '#3f6186', 'parked');
    cover.driverPresent = false;
    world.vehicles.push(cover);
    for (const thug of world.combat.thugs) thug.state = 'engage';
    world.combat.dropPickup(door.x + 30, door.y + 66, 'cash', 40);
    snapCamera(world, door.x - 6, door.y + 40);
    return;
  }

  snapCamera(world, world.player.x, world.player.y);
}

/** One last touch on the capture frame: fresh gunfire for the shootout. */
export function shotFinalTouch(world, name) {
  if (name === 'chase') {
    // One clean wanted toast, not a stack of duplicates from the warm-up.
    world.toasts = world.toasts.slice(-1);
    return;
  }
  if (name !== 'mission') return;
  const p = world.player;
  // The warm-up steps are a real firefight; pose the capture at full nerve.
  p.hp = 92;
  p.hurtFlash = 0;
  world.combat.fire(world, p, -Math.PI / 2 + 0.06, true);
  const thug = world.combat.thugs.find((t) => t.state === 'engage');
  if (thug) {
    thug.angle = Math.atan2(p.y - thug.y, p.x - thug.x);
    world.combat.fire(world, thug, thug.angle, false);
  }
}

function snapCamera(world, x, y) {
  world.camera.x = x;
  world.camera.y = y;
}
