// missions.js — Vera Castellan's five jobs: the story of Marco Reyes
// paying off his brother's debt. Each mission is a small stage machine;
// between jobs the city is free roam and Reyes Auto buys stolen cars.

import { blockRect, ROAD_W } from './city.js';
import { createVehicle, VEHICLE_TYPES } from './vehicles.js';
import { dist } from './rng.js';

export const TITLES = ['Nobody', 'Runner', 'Wheelman', "The Fixer's Hand", 'Coral Bay Legend'];
export const TITLE_RESPECT = [0, 10, 30, 60, 100];

export const MISSION_DEFS = [
  {
    id: 'collection',
    title: 'First Collection',
    pay: 150,
    respect: 10,
    brief: [
      'Vera: Marco. Your brother Tito owes me, so now you owe me.',
      'The Marina cash office holds a ledger with his name in it.',
      'Bring me that ledger, and we start wiping the slate.',
    ],
    done: 'Vera: The ledger. Good. Tito breathes a little easier tonight.',
  },
  {
    id: 'vulture-tax',
    title: 'Vulture Tax',
    pay: 300,
    respect: 15,
    brief: [
      'Vera: The Vultures are shaking down my corner in the Palm District.',
      'Three of their boys, leaning on my people like they own the street.',
      'Teach them the tax goes the other way. I left a pistol in your motel room — take it.',
    ],
    done: 'Vera: Word travels. The corner pays me again. So do I.',
  },
  {
    id: 'hot-property',
    title: 'Hot Property',
    pay: 450,
    respect: 20,
    brief: [
      'Vera: A red Vireo GT sits in Coral Heights, owned by a man who',
      'lost it to me at cards and forgot to hand over the keys.',
      'Take it. Reyes Auto will strip it, and nobody asks questions.',
    ],
    done: 'Vera: Stripped and sold by sunrise. You have a gift, Marco.',
  },
  {
    id: 'marina-heist',
    title: 'The Marina Heist',
    pay: 700,
    respect: 25,
    brief: [
      'Vera: The Vultures moved their money into the Marina cash office.',
      'Four guards, one bag of cash, and a door Tito once held open.',
      'Take the bag, then lose the heat before you come back to me.',
    ],
    done: 'Vera: That was their whole season. Tito is nearly free, Marco.',
  },
  {
    id: 'reckoning',
    title: 'The Reckoning',
    pay: 900,
    respect: 40,
    brief: [
      'Vera: Dario Vane, the Vultures\' boss, hides in a Hillside villa.',
      'End him, and Tito\'s debt dies with him. So does my patience.',
      'This is the last job. Make it the loudest.',
    ],
    done: 'Vera: It is done. The debt is paid, Marco. Coral Bay is yours now.',
  },
];

export class MissionSystem {
  constructor() {
    this.index = 0; // next mission to offer
    this.active = null; // { def, stage, data }
    this.completed = 0;
  }

  get allDone() {
    return this.index >= MISSION_DEFS.length && !this.active;
  }

  /** Where the player should go next, for the HUD and minimap. */
  objective(world) {
    const specials = world.city.specials;
    if (!this.active) {
      if (this.index < MISSION_DEFS.length) {
        return { text: `See Vera at ${specials.cafe.name}`, x: specials.cafe.door.x, y: specials.cafe.door.y, kind: 'giver' };
      }
      return { text: 'Free roam — Reyes Auto buys stolen cars', x: specials.chopShop.door.x, y: specials.chopShop.door.y, kind: 'info' };
    }
    const a = this.active;
    switch (a.def.id) {
      case 'collection':
        if (a.stage === 0) return { text: 'Take the ledger from the Marina cash office', x: specials.marinaOffice.door.x, y: specials.marinaOffice.door.y, kind: 'target' };
        return { text: 'Bring the ledger back to Vera', x: specials.cafe.door.x, y: specials.cafe.door.y, kind: 'giver' };
      case 'vulture-tax':
        return { text: `Run off the Vultures (${a.data.down}/${a.data.need})`, x: a.data.x, y: a.data.y, kind: 'target' };
      case 'hot-property':
        if (a.stage === 0) return { text: 'Steal the red Vireo GT', x: a.data.car.x, y: a.data.car.y, kind: 'target' };
        return { text: 'Deliver the Vireo GT to Reyes Auto', x: specials.chopShop.door.x, y: specials.chopShop.door.y, kind: 'target' };
      case 'marina-heist':
        if (a.stage === 0) return { text: 'Clear the Marina cash office', x: specials.marinaOffice.door.x, y: specials.marinaOffice.door.y, kind: 'target' };
        if (a.stage === 1) return { text: 'Grab the cash bag', x: a.data.bag.x, y: a.data.bag.y, kind: 'target' };
        if (a.stage === 2) return { text: 'Lose the heat', x: world.player.x, y: world.player.y, kind: 'heat' };
        return { text: 'Return to Vera', x: specials.cafe.door.x, y: specials.cafe.door.y, kind: 'giver' };
      case 'reckoning':
        return { text: 'End Dario Vane at the Hillside villa', x: a.data.x, y: a.data.y, kind: 'target' };
      default:
        return { text: '', x: world.player.x, y: world.player.y, kind: 'info' };
    }
  }

  /** Offer/accept interaction at Vera's door (E pressed nearby). */
  tryStart(world) {
    if (this.active || this.index >= MISSION_DEFS.length) return false;
    const door = world.city.specials.cafe.door;
    if (dist(world.player.x, world.player.y, door.x, door.y) > 64 || world.player.inVehicle) return false;
    const def = MISSION_DEFS[this.index];
    this.active = { def, stage: 0, data: {} };
    for (const line of def.brief) world.queueDialogue('Vera Castellan', line);
    this.setup(world, def);
    world.toast(`Mission: ${def.title}`, '#ffd94d');
    return true;
  }

  setup(world, def) {
    const a = this.active;
    const specials = world.city.specials;
    if (def.id === 'vulture-tax') {
      world.combatActive = true;
      const corner = blockRect(9, 7);
      a.data.x = corner.x + corner.w / 2;
      a.data.y = corner.y + corner.h + ROAD_W / 2;
      a.data.need = 3;
      a.data.down = 0;
      world.combat.spawnThug(a.data.x - 40, a.data.y - 26, {});
      world.combat.spawnThug(a.data.x + 36, a.data.y + 10, {});
      world.combat.spawnThug(a.data.x + 4, a.data.y + 44, {});
    }
    if (def.id === 'hot-property') {
      const spot = blockRect(10, 3);
      const car = createVehicle('sport', spot.x + spot.w / 2, spot.y + spot.h + ROAD_W / 2 + 10, 0, '#d8402e', 'parked');
      car.driverPresent = false;
      car.missionCar = true;
      a.data.car = car;
      world.vehicles.push(car);
    }
    if (def.id === 'marina-heist') {
      world.combatActive = true;
      const door = specials.marinaOffice.door;
      a.data.guards = 4;
      a.data.down = 0;
      world.combat.spawnThug(door.x - 70, door.y - 60, {});
      world.combat.spawnThug(door.x + 66, door.y - 54, {});
      world.combat.spawnThug(door.x - 30, door.y - 120, {});
      world.combat.spawnThug(door.x + 40, door.y - 128, {});
      a.data.bag = { x: door.x, y: door.y - 96 };
    }
    if (def.id === 'reckoning') {
      world.combatActive = true;
      const door = specials.hillsideHideout.door;
      a.data.x = door.x;
      a.data.y = door.y - 70;
      a.data.bossDown = false;
      world.combat.spawnThug(door.x - 60, door.y - 60, {});
      world.combat.spawnThug(door.x + 58, door.y - 66, {});
      world.combat.spawnThug(door.x - 16, door.y - 130, {});
      const boss = world.combat.spawnThug(door.x + 6, door.y - 84, { hp: 7, boss: true, name: 'Dario Vane' });
      a.data.boss = boss;
    }
  }

  /** Called when a thug goes down. */
  onThugDown(world, thug) {
    const a = this.active;
    if (!a) return;
    if (a.def.id === 'vulture-tax') {
      a.data.down += 1;
      if (a.data.down >= a.data.need) this.complete(world);
    } else if (a.def.id === 'marina-heist' && a.stage === 0) {
      a.data.down += 1;
      if (a.data.down >= a.data.guards) {
        a.stage = 1;
        world.toast('The office is clear. Grab the cash bag.', '#ffd94d');
      }
    } else if (a.def.id === 'reckoning') {
      if (thug.boss) {
        a.data.bossDown = true;
        if (world.combat.aliveThugs().length === 0) this.complete(world);
        else world.toast('Dario Vane is down. Finish his guards.', '#ffd94d');
      } else if (a.data.bossDown && world.combat.aliveThugs().length === 0) {
        this.complete(world);
      }
    }
  }

  /** Called when the player gets into a vehicle. */
  onEnterVehicle(world, vehicle) {
    const a = this.active;
    if (!a) return;
    if (a.def.id === 'hot-property' && a.stage === 0 && vehicle === a.data.car) {
      a.stage = 1;
      world.toast('Got it. Reyes Auto, and do not scratch the paint.', '#ffd94d');
    }
  }

  update(world, dt) {
    const a = this.active;
    if (!a) return;
    const p = world.player;
    const specials = world.city.specials;
    void dt;

    if (a.def.id === 'collection') {
      if (a.stage === 0 && !p.inVehicle && dist(p.x, p.y, specials.marinaOffice.door.x, specials.marinaOffice.door.y) < 52) {
        a.stage = 1;
        world.toast('You have the ledger.', '#7dd87d');
        world.audio.pickup();
      } else if (a.stage === 1 && !p.inVehicle && dist(p.x, p.y, specials.cafe.door.x, specials.cafe.door.y) < 58) {
        this.complete(world);
      }
    }

    if (a.def.id === 'hot-property' && a.stage === 1) {
      if (p.inVehicle === a.data.car && dist(p.x, p.y, specials.chopShop.door.x, specials.chopShop.door.y) < 96) {
        // Delivered: the car is consumed by the shop.
        world.exitPlayerVehicle(true);
        world.removeVehicle(a.data.car);
        this.complete(world);
      }
    }

    if (a.def.id === 'marina-heist') {
      if (a.stage === 1 && !p.inVehicle && dist(p.x, p.y, a.data.bag.x, a.data.bag.y) < 40) {
        a.stage = 2;
        world.police.setWanted(world, Math.max(3, world.police.wanted));
        world.police.locked = 0;
        world.toast('Cash secured. Now lose the heat!', '#ff9d5c');
        world.audio.cash();
      } else if (a.stage === 2 && world.police.wanted === 0) {
        a.stage = 3;
      } else if (a.stage === 3 && !p.inVehicle && dist(p.x, p.y, specials.cafe.door.x, specials.cafe.door.y) < 58) {
        this.complete(world);
      }
    }
  }

  complete(world) {
    const a = this.active;
    if (!a) return;
    const def = a.def;
    this.active = null;
    this.index += 1;
    this.completed += 1;
    world.addCash(def.pay, world.player.x, world.player.y - 24, true);
    world.addRespect(def.respect);
    world.queueDialogue('Vera Castellan', def.done);
    world.audio.missionDone();
    world.toast(`Mission complete: ${def.title}  +$${def.pay}`, '#7dd87d');
    world.saveGame();
  }

  /** Restore story progress from a save record. */
  restore(save) {
    this.index = save.missionIndex || 0;
    this.completed = save.missionsDone || 0;
    this.active = null;
  }
}

/** Price Reyes Auto pays for a stolen car of a type. */
export function chopPrice(vehicle) {
  return VEHICLE_TYPES[vehicle.type].chopValue;
}
