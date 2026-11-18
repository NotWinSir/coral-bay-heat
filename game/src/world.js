// world.js — the living city assembled: one World holds the generated
// city, traffic, pedestrians, police, combat, missions and Marco, wires
// every event between them (crimes, crashes, payouts, arrests) and owns
// the camera, toasts, floating texts and the save file.

import { AudioEngine } from './audio.js';
import { generateCity, districtAtPoint, DISTRICTS } from './city.js';
import { CombatSystem } from './combat.js';
import { MissionSystem, TITLES, TITLE_RESPECT, chopPrice } from './missions.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { createPlayer, updatePlayer, exitVehicle } from './player.js';
import { Rng, clamp, dist } from './rng.js';
import { defaultSave, loadSave, writeSave } from './save.js';
import { TrafficManager } from './traffic.js';
import { createVehicle, vehiclesOverlap } from './vehicles.js';

export class World {
  constructor(input, seed = 20261117) {
    this.input = input;
    this.audio = new AudioEngine();
    this.rng = new Rng(seed);
    this.seed = seed;
    this.city = generateCity(seed);
    this.time = 0;
    this.state = 'title'; // title | playing | paused | busted | wasted
    this.vehicles = [];
    this.traffic = new TrafficManager(this.city, new Rng(seed + 101));
    this.traffic.spawnParked(this.vehicles);
    this.traffic.spawnActive(this.vehicles, 13);
    this.pedestrians = new PedestrianManager(this.city, new Rng(seed + 202));
    this.pedestrians.spawn(42);
    this.police = new PoliceSystem(this.city);
    this.combat = new CombatSystem();
    this.missions = new MissionSystem();
    this.combatActive = false;

    const cafe = this.city.specials.cafe.door;
    this.player = createPlayer(cafe.x - 60, cafe.y + 46);
    // Marco's own battered hatch, parked by the cafe. It is his: not stolen.
    const own = this.spawnOwnCar(cafe.x + 90, cafe.y + 88);
    void own;

    this.camera = { x: this.player.x, y: this.player.y, viewW: 1280, viewH: 720, shakeX: 0, shakeY: 0 };
    this.shake = 0;
    this.cash = 120;
    this.respect = 0;
    this.titleIndex = 0;
    this.stats = defaultSave().stats;
    this.toasts = [];
    this.floaters = [];
    this.dialogue = null;
    this.dialogueQueue = [];
    this.districtBanner = null;
    this.lastDistrict = -1;
    this.hasContinue = false;
    this.bustedTimer = 0;
    this.wastedTimer = 0;
  }

  spawnOwnCar(x, y) {
    const car = createVehicle('hatch', x, y, Math.PI, '#a8c686', 'parked');
    car.owned = true;
    car.driverPresent = false;
    this.vehicles.push(car);
    return car;
  }

  // ------------------------------------------------------------ game flow

  newGame() {
    this.cash = 120;
    this.respect = 0;
    this.titleIndex = 0;
    this.stats = defaultSave().stats;
    this.missions = new MissionSystem();
    this.combat.reset();
    this.combatActive = false;
    this.police.clearAll(this);
    const cafe = this.city.specials.cafe.door;
    this.player = createPlayer(cafe.x - 60, cafe.y + 46);
    this.player.hp = this.player.maxHp;
    this.state = 'playing';
    this.toast('Coral Bay. Population: trouble.', '#ffd94d');
    this.queueDialogue('Vera Castellan', 'Cafe Castellan, Marco. We need to talk about Tito.');
    this.saveGame();
  }

  continueGame() {
    const save = loadSave();
    if (!save) {
      this.newGame();
      return;
    }
    this.cash = save.cash;
    this.respect = save.respect;
    this.titleIndex = save.titleIndex;
    this.stats = save.stats;
    this.missions.restore(save);
    this.combat.reset();
    this.police.clearAll(this);
    this.player = createPlayer(save.player.x || this.city.specials.cafe.door.x, save.player.y || this.city.specials.cafe.door.y);
    this.state = 'playing';
    this.toast('Welcome back to Coral Bay.', '#ffd94d');
  }

  saveGame() {
    const save = defaultSave();
    save.cash = this.cash;
    save.respect = this.respect;
    save.titleIndex = this.titleIndex;
    save.missionIndex = this.missions.index;
    save.missionsDone = this.missions.completed;
    save.player = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    save.stats = this.stats;
    writeSave(save);
    this.hasContinue = true;
  }

  // ------------------------------------------------------------ events

  onCarjacked(vehicle) {
    this.stats.carsStolen += 1;
    this.pedestrians.panicAt(vehicle.x, vehicle.y, 190);
    // The thrown-out driver becomes a fleeing pedestrian.
    const driver = this.pedestrians.peds.find((pd) => pd.state === 'walk');
    if (driver) {
      driver.x = vehicle.x + 20;
      driver.y = vehicle.y + 14;
      driver.state = 'flee';
      driver.fleeFrom = { x: vehicle.x, y: vehicle.y };
      driver.fleeTime = 2.6;
    }
    this.police.reportCrime(this, 'carjack', vehicle.x, vehicle.y);
  }

  onGunFired(x, y) {
    this.combatActive = true;
    this.pedestrians.panicAt(x, y, 265);
    this.police.reportCrime(this, 'gunshot', x, y);
  }

  onPedShot(ped, fatal) {
    ped.state = 'down';
    ped.downTime = 0;
    this.combat.burst(ped.x, ped.y, 8, '#c03a30', 90);
    if (fatal) this.police.reportCrime(this, 'pedDown', ped.x, ped.y);
  }

  onThugDown(thug) {
    this.stats.thugsDown += 1;
    this.police.reportCrime(this, 'thugDown', thug.x, thug.y);
    this.missions.onThugDown(this, thug);
    this.floatText(thug.x, thug.y - 22, thug.boss ? 'DARIO VANE DOWN' : 'Vulture down', '#ff9d5c');
  }

  onWantedChanged(level) {
    if (level > 0) this.toast(`Wanted: ${'★'.repeat(level)}`, '#ff6b5e');
  }

  onVehicleCrash(vehicle, impact) {
    this.audio.crash(clamp(impact / 320, 0.2, 1));
    this.shake = Math.min(9, impact * 0.02);
    this.combat.burst(vehicle.x, vehicle.y, 10, '#d8d3c3', 120);
    this.pedestrians.panicAt(vehicle.x, vehicle.y, 170);
    // Running into a police unit is very noticeable.
    for (const unit of this.police.units) {
      if (dist(vehicle.x, vehicle.y, unit.x, unit.y) < 60) {
        this.police.reportCrime(this, 'copHit', vehicle.x, vehicle.y);
        unit.hp -= 6;
        break;
      }
    }
  }

  onVehicleBump(mine, other) {
    const now = this.time;
    if (now - mine.lastCrashAt < 0.4) return;
    const closing = Math.abs(mine.speed);
    if (closing < 55) return;
    mine.lastCrashAt = now;
    other.lastCrashAt = now;
    mine.speed *= 0.55;
    if (other.mode === 'traffic') {
      other.speed *= 0.4;
      this.audio.crash(0.35);
      this.shake = Math.min(5, closing * 0.012);
      other.hp -= 5;
      other.hitFlash = 0.14;
      if (other.driverPresent && this.police.witnessed(this, other.x, other.y)) {
        this.police.reportCrime(this, 'assault', other.x, other.y);
      }
      // A bumped driver may bail out and run.
      if (other.hp < 55 && other.driverPresent) {
        other.driverPresent = false;
        other.mode = 'parked';
        this.pedestrians.panicAt(other.x, other.y, 150);
      }
    } else if (other.type === 'police') {
      this.audio.crash(0.5);
      this.police.reportCrime(this, 'copHit', other.x, other.y);
    }
  }

  onBusted() {
    this.state = 'busted';
    this.bustedTimer = 3.4;
    this.stats.timesBusted += 1;
    const fine = Math.floor(this.cash * 0.15);
    this.cash -= fine;
    this.audio.busted();
    this.audio.stopEngine();
    this.audio.setSiren(false, 0);
    this.floatText(this.player.x, this.player.y - 30, fine > 0 ? `Bail and fines: -$${fine}` : 'Busted', '#ff6b5e');
    this.saveGame();
  }

  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.wastedTimer = 3.4;
    this.stats.timesWasted += 1;
    const bill = Math.floor(this.cash * 0.1);
    this.cash -= bill;
    this.audio.stopEngine();
    this.audio.setSiren(false, 0);
    this.saveGame();
  }

  respawnAfterBusted() {
    const door = this.city.specials.policeStation.door;
    this.police.clearAll(this);
    if (this.player.inVehicle) this.exitPlayerVehicle(true);
    this.player.x = door.x;
    this.player.y = door.y + 30;
    this.player.hp = this.player.maxHp;
    this.state = 'playing';
  }

  respawnAfterWasted() {
    const door = this.city.specials.hospital.door;
    this.police.clearAll(this);
    if (this.player.inVehicle) this.exitPlayerVehicle(true);
    this.player.x = door.x;
    this.player.y = door.y + 30;
    this.player.hp = this.player.maxHp;
    this.state = 'playing';
    this.toast('Coral Heights Hospital patched you up.', '#7dd87d');
  }

  // ------------------------------------------------------------ helpers

  exitPlayerVehicle(silent = false) {
    if (!this.player.inVehicle) return;
    exitVehicle(this);
    void silent;
  }

  removeVehicle(vehicle) {
    this.vehicles = this.vehicles.filter((v) => v !== vehicle);
    this.traffic.cars = this.traffic.cars.filter((v) => v !== vehicle);
    this.traffic.parked = this.traffic.parked.filter((v) => v !== vehicle);
  }

  addCash(amount, x, y, silent = false) {
    this.cash += amount;
    if (!silent) {
      this.audio.cash();
      this.floatText(x, y, `+$${amount}`, '#ffd94d');
    }
  }

  addRespect(amount) {
    this.respect += amount;
    const next = TITLE_RESPECT.findIndex((need, i) => this.respect < need && i > this.titleIndex);
    let idx = this.titleIndex;
    for (let i = 0; i < TITLES.length; i++) {
      if (this.respect >= TITLE_RESPECT[i]) idx = i;
    }
    void next;
    if (idx > this.titleIndex) {
      this.titleIndex = idx;
      this.toast(`New title: ${TITLES[idx]}`, '#ffd94d');
    }
  }

  get title() {
    return TITLES[this.titleIndex];
  }

  toast(text, color = '#ffffff') {
    this.toasts.push({ text, color, t: 0, life: 3.4 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  floatText(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0, life: 1.5 });
  }

  queueDialogue(speaker, text) {
    this.dialogueQueue.push({ speaker, text, t: 0 });
  }

  /** Reyes Auto: standing in the shop yard in a stolen car sells it. */
  tryChopShop() {
    const p = this.player;
    const door = this.city.specials.chopShop.door;
    if (!p.inVehicle) return;
    if (dist(p.x, p.y, door.x, door.y) > 110) return;
    const car = p.inVehicle;
    if (car.owned || car.type === 'police' || !car.stolen) return;
    const price = chopPrice(car);
    this.exitPlayerVehicle(true);
    this.removeVehicle(car);
    this.stats.carsSold += 1;
    this.addCash(price, door.x, door.y - 20);
    this.addRespect(2);
    this.toast(`Reyes Auto stripped it: +$${price}`, '#7dd87d');
    this.saveGame();
  }

  /** Interact key routing while on foot: Vera first, then resting. */
  tryInteract() {
    if (this.player.inVehicle) return false;
    if (this.missions.tryStart(this)) return true;
    // Resting at a hideout heals.
    const motel = this.city.specials.motel.door;
    const villa = this.city.specials.hillsideHideout.door;
    if (dist(this.player.x, this.player.y, motel.x, motel.y) < 60 || dist(this.player.x, this.player.y, villa.x, villa.y) < 60) {
      if (this.player.hp < this.player.maxHp) {
        this.player.hp = this.player.maxHp;
        this.toast('You rest until the city forgets your face. HP restored.', '#7dd87d');
        this.audio.pickup();
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    // Dialogue timing runs in every state.
    if (!this.dialogue && this.dialogueQueue.length > 0) {
      this.dialogue = this.dialogueQueue.shift();
    }
    if (this.dialogue) {
      this.dialogue.t += dt;
      if (this.dialogue.t > 4.6) this.dialogue = null;
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.life);
    for (const f of this.floaters) {
      f.t += dt;
      f.y -= dt * 26;
    }
    this.floaters = this.floaters.filter((f) => f.t < f.life);

    if (this.state === 'busted') {
      this.bustedTimer -= dt;
      if (this.bustedTimer <= 0) this.respawnAfterBusted();
      this.updateCamera(dt);
      return;
    }
    if (this.state === 'wasted') {
      this.wastedTimer -= dt;
      if (this.wastedTimer <= 0) this.respawnAfterWasted();
      this.updateCamera(dt);
      return;
    }
    if (this.state !== 'playing') {
      this.updateCamera(dt);
      return;
    }

    updatePlayer(this, dt);
    this.traffic.update(dt, this);
    this.pedestrians.update(dt, this);
    this.police.update(dt, this);
    this.combat.update(dt, this);
    this.missions.update(this, dt);
    this.checkVehiclePedHits(dt);
    this.tryChopShop();

    // District banner on crossing into a new district.
    const di = districtAtPoint(this.player.x, this.player.y);
    if (di !== this.lastDistrict) {
      if (this.lastDistrict !== -1) {
        this.districtBanner = { name: DISTRICTS[di].name, t: 0 };
      }
      this.lastDistrict = di;
    }
    if (this.districtBanner) {
      this.districtBanner.t += dt;
      if (this.districtBanner.t > 2.6) this.districtBanner = null;
    }
    this.updateCamera(dt);
    this.audio.update();
  }

  /** Cars (the player's above all) can run people down — with consequences. */
  checkVehiclePedHits(dt) {
    void dt;
    const pv = this.player.inVehicle;
    if (!pv || Math.abs(pv.speed) < 60) return;
    for (const ped of this.pedestrians.peds) {
      if (ped.state === 'down' || ped.state === 'driver') continue;
      if (dist(ped.x, ped.y, pv.x, pv.y) < pv.def.w / 2 + 8) {
        ped.state = 'down';
        ped.downTime = 0;
        this.combat.burst(ped.x, ped.y, 9, '#c03a30', 100);
        this.audio.crash(0.4);
        this.police.reportCrime(this, 'pedDown', ped.x, ped.y);
      }
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const look = p.inVehicle ? 0.32 : 0.12;
    const tx = p.x + Math.cos(p.angle) * (p.speed * look);
    const ty = p.y + Math.sin(p.angle) * (p.speed * look);
    const k = Math.min(1, dt * 4.2);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    if (this.shake > 0.1) {
      this.camera.shakeX = (Math.random() - 0.5) * this.shake;
      this.camera.shakeY = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.86;
    } else {
      this.camera.shakeX = 0;
      this.camera.shakeY = 0;
    }
  }
}
