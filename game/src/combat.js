// combat.js — gunplay in Coral Bay: Marco's pistol (12 rounds, reload),
// Vulture thugs who shoot back, dropped cash and health, muzzle flashes
// and the little particle bursts that sell every hit.

import { lineBlocked } from './city.js';
import { clamp, dist } from './rng.js';
import { hurtPlayer } from './player.js';

export const MAGAZINE = 12;
export const RELOAD_SECONDS = 1.15;
export const FIRE_INTERVAL = 0.21;
const BULLET_SPEED = 880;
const BULLET_RANGE = 560;

let nextThugId = 1;

export class CombatSystem {
  constructor() {
    this.bullets = [];
    this.thugs = [];
    this.pickups = [];
    this.particles = [];
    this.ammo = MAGAZINE;
    this.reloading = 0;
    this.flash = null; // {x, y, angle, t} muzzle flash for the renderer
  }

  reset() {
    this.bullets = [];
    this.thugs = [];
    this.pickups = [];
    this.particles = [];
    this.ammo = MAGAZINE;
    this.reloading = 0;
    this.flash = null;
  }

  /** Spawn a Vulture thug. opts: { hp, boss, name } */
  spawnThug(x, y, opts = {}) {
    const thug = {
      id: nextThugId++,
      x,
      y,
      angle: Math.PI,
      hp: opts.hp ?? 3,
      maxHp: opts.hp ?? 3,
      boss: !!opts.boss,
      name: opts.name || 'Vulture',
      state: 'guard', // guard | engage | down
      cooldown: 0,
      burst: 0,
      strafeDir: 1,
      strafeAt: 0,
      walkPhase: 0,
      hurtFlash: 0,
      home: { x, y },
    };
    this.thugs.push(thug);
    return thug;
  }

  clearThugs() {
    this.thugs = this.thugs.filter((t) => t.state === 'down');
  }

  aliveThugs() {
    return this.thugs.filter((t) => t.state !== 'down');
  }

  /** Fire one bullet. from: {x,y}; friendly: from the player. */
  fire(world, from, angle, friendly) {
    const spread = (world.rng.next() - 0.5) * (friendly ? 0.028 : 0.09);
    this.bullets.push({
      x: from.x + Math.cos(angle) * 16,
      y: from.y + Math.sin(angle) * 16,
      vx: Math.cos(angle + spread) * BULLET_SPEED,
      vy: Math.sin(angle + spread) * BULLET_SPEED,
      travelled: 0,
      friendly,
    });
    this.flash = { x: from.x + Math.cos(angle) * 20, y: from.y + Math.sin(angle) * 20, angle, t: 0.05 };
    this.burst(from.x + Math.cos(angle) * 22, from.y + Math.sin(angle) * 22, 3, '#ffd98a', 60);
  }

  /** The player pulls the trigger. */
  playerShoot(world) {
    const p = world.player;
    if (this.reloading > 0 || p.fireCooldown > 0 || p.inVehicle) return;
    if (this.ammo <= 0) {
      world.audio.dryFire();
      this.startReload(world);
      p.fireCooldown = 0.3;
      return;
    }
    this.ammo -= 1;
    p.fireCooldown = FIRE_INTERVAL;
    world.stats.shotsFired += 1;
    this.fire(world, p, p.aimAngle, true);
    world.audio.gunshot();
    world.onGunFired(p.x, p.y);
    if (this.ammo === 0) this.startReload(world);
  }

  startReload(world) {
    if (this.reloading > 0 || this.ammo === MAGAZINE) return;
    this.reloading = RELOAD_SECONDS;
    world.audio.reloadStart();
  }

  /** Small coloured particle burst. */
  burst(x, y, count, color, speed = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.28 + Math.random() * 0.3,
        maxLife: 0.55,
        color,
        size: 1.6 + Math.random() * 2.2,
      });
    }
  }

  dropPickup(x, y, kind, amount) {
    this.pickups.push({ x, y, kind, amount, bob: Math.random() * 6, taken: false });
  }

  update(dt, world) {
    const p = world.player;

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = MAGAZINE;
        world.audio.reloadEnd();
      }
    }
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }

    this.updateBullets(dt, world);
    this.updateThugs(dt, world);
    this.updatePickups(dt, world);

    // Particles.
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.86;
      pt.vy *= 0.86;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    void p;
  }

  updateBullets(dt, world) {
    const p = world.player;
    const kept = [];
    for (const b of this.bullets) {
      const step = BULLET_SPEED * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += step;
      let dead = b.travelled > BULLET_RANGE;
      // Buildings stop bullets.
      if (!dead) {
        for (const rect of world.city.colliders) {
          if (b.x > rect.x && b.x < rect.x + rect.w && b.y > rect.y && b.y < rect.y + rect.h) {
            dead = true;
            this.burst(b.x, b.y, 4, '#cfc8b8', 70);
            break;
          }
        }
      }
      if (!dead && b.friendly) {
        for (const thug of this.thugs) {
          if (thug.state === 'down') continue;
          if (dist(b.x, b.y, thug.x, thug.y) < 15) {
            dead = true;
            this.hitThug(world, thug);
            break;
          }
        }
        if (!dead) {
          for (const ped of world.pedestrians.peds) {
            if (ped.state === 'down' || ped.state === 'driver') continue;
            if (dist(b.x, b.y, ped.x, ped.y) < 12) {
              dead = true;
              world.onPedShot(ped, true);
              break;
            }
          }
        }
      }
      if (!dead && !b.friendly) {
        if (!p.inVehicle && dist(b.x, b.y, p.x, p.y) < 14) {
          dead = true;
          this.burst(p.x, p.y, 5, '#c03a30', 80);
          if (hurtPlayer(world, world.rng.range(7, 13))) world.onWasted();
        } else if (p.inVehicle && dist(b.x, b.y, p.x, p.y) < 26) {
          dead = true;
          p.inVehicle.hp -= 4;
          p.inVehicle.hitFlash = 0.12;
          this.burst(b.x, b.y, 4, '#d8d3c3', 80);
          if (hurtPlayer(world, world.rng.range(2, 5))) world.onWasted();
        }
      }
      if (!dead) kept.push(b);
    }
    this.bullets = kept;
  }

  hitThug(world, thug) {
    thug.hp -= 1;
    thug.hurtFlash = 0.16;
    thug.state = 'engage';
    this.burst(thug.x, thug.y, 6, '#c03a30', 90);
    if (thug.hp <= 0 && thug.state !== 'down') {
      thug.state = 'down';
      world.onThugDown(thug);
      this.dropPickup(thug.x + 8, thug.y + 6, 'cash', thug.boss ? 120 : world.rng.int(15, 45));
      if (world.rng.chance(0.4)) this.dropPickup(thug.x - 10, thug.y - 6, 'health', 30);
    }
  }

  updateThugs(dt, world) {
    const p = world.player;
    for (const thug of this.thugs) {
      if (thug.state === 'down') continue;
      if (thug.hurtFlash > 0) thug.hurtFlash -= dt;
      const d = dist(thug.x, thug.y, p.x, p.y);
      const seesPlayer = d < 360 && !lineBlocked(world.city, thug.x, thug.y, p.x, p.y);
      if (thug.state === 'guard' && seesPlayer && world.combatActive) {
        thug.state = 'engage';
      }
      if (thug.state !== 'engage') continue;
      thug.angle = Math.atan2(p.y - thug.y, p.x - thug.x);
      thug.cooldown -= dt;
      thug.strafeAt -= dt;
      if (thug.strafeAt <= 0) {
        thug.strafeDir = world.rng.sign();
        thug.strafeAt = world.rng.range(0.7, 1.6);
      }
      // Keep a fighting distance, strafing sideways.
      let mx = 0;
      let my = 0;
      const want = thug.boss ? 190 : 165;
      if (d > want + 40) {
        mx = Math.cos(thug.angle);
        my = Math.sin(thug.angle);
      } else if (d < want - 50) {
        mx = -Math.cos(thug.angle);
        my = -Math.sin(thug.angle);
      }
      mx += -Math.sin(thug.angle) * thug.strafeDir * 0.7;
      my += Math.cos(thug.angle) * thug.strafeDir * 0.7;
      const ml = Math.hypot(mx, my) || 1;
      const speed = 74;
      const nx = thug.x + (mx / ml) * speed * dt;
      const ny = thug.y + (my / ml) * speed * dt;
      let blocked = false;
      for (const rect of world.city.colliders) {
        if (nx > rect.x - 11 && nx < rect.x + rect.w + 11 && ny > rect.y - 11 && ny < rect.y + rect.h + 11) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        thug.x = clamp(nx, 14, world.city.bounds.w - 14);
        thug.y = clamp(ny, 14, world.city.bounds.h - 14);
        thug.walkPhase += dt * 7;
      }
      // Fire in short bursts when the line is clear.
      if (seesPlayer && d < 340 && thug.cooldown <= 0) {
        this.fire(world, thug, thug.angle, false);
        world.audio.enemyShot();
        thug.burst += 1;
        thug.cooldown = thug.burst >= 3 ? world.rng.range(0.8, 1.4) : 0.34;
        if (thug.burst >= 3) thug.burst = 0;
        world.pedestrians.panicAt(thug.x, thug.y, 200);
      }
    }
  }

  updatePickups(dt, world) {
    const p = world.player;
    for (const pk of this.pickups) {
      pk.bob += dt * 3;
      if (pk.taken || p.inVehicle) continue;
      if (dist(pk.x, pk.y, p.x, p.y) < 30) {
        pk.taken = true;
        if (pk.kind === 'cash') {
          world.addCash(pk.amount, pk.x, pk.y);
        } else if (pk.kind === 'health') {
          p.hp = Math.min(p.maxHp, p.hp + pk.amount);
          world.audio.pickup();
          world.floatText(pk.x, pk.y - 18, `+${pk.amount} HP`, '#7dd87d');
        } else if (pk.kind === 'ammo') {
          this.ammo = MAGAZINE;
          world.audio.pickup();
        }
        this.burst(pk.x, pk.y, 6, pk.kind === 'cash' ? '#ffd94d' : '#7dd87d', 60);
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.taken);
  }
}
