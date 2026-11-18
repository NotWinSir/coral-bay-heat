// render.js — draws Coral Bay: sun-bleached streets, block pavements,
// parks and the beach, buildings with long shadows, palms, every car and
// pedestrian, gunfire and pickups, and Marco himself with his aim line.

import {
  BLOCK_COLS, BLOCK_ROWS, BLOCK_SIZE, PITCH, ROAD_W, SIDEWALK,
  WORLD_H, WORLD_W, blockRect, districtIndexAt,
} from './city.js';
import { drawPedestrian } from './pedestrians.js';
import { drawVehicle, roundRect } from './vehicles.js';
import { dist } from './rng.js';

const ASPHALT = '#4c4f52';
const ASPHALT_DARK = '#43464a';
const LANE_PAINT = 'rgba(240,235,210,0.5)';
const CROSSWALK = 'rgba(235,235,230,0.55)';

export class Renderer {
  constructor() {
    this.lastDistrict = -1;
  }

  draw(ctx, world) {
    const cam = world.camera;
    const vw = cam.viewW;
    const vh = cam.viewH;
    const ox = vw / 2 - cam.x + cam.shakeX;
    const oy = vh / 2 - cam.y + cam.shakeY;

    // Water beyond the city, sand on the south shore.
    ctx.fillStyle = '#2e7f96';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#57a7bd';
    for (let i = 0; i < 5; i++) {
      const wy = ((world.time * 14 + i * 170) % (vh + 120)) - 60;
      ctx.fillRect(0, wy, vw, 3);
    }

    ctx.save();
    ctx.translate(ox, oy);
    const view = {
      x0: cam.x - vw / 2 - 90,
      y0: cam.y - vh / 2 - 90,
      x1: cam.x + vw / 2 + 90,
      y1: cam.y + vh / 2 + 90,
    };
    this.drawGround(ctx, world, view);
    this.drawParksAndLots(ctx, world, view);
    this.drawBuildings(ctx, world, view);
    this.drawPalms(ctx, world, view);
    this.drawPickups(ctx, world);
    this.drawObjectiveBeacon(ctx, world);
    for (const v of world.vehicles) {
      if (v.x < view.x0 || v.x > view.x1 || v.y < view.y0 || v.y > view.y1) continue;
      drawVehicle(ctx, v, world.time);
    }
    for (const ped of world.pedestrians.peds) {
      if (ped.x < view.x0 || ped.x > view.x1 || ped.y < view.y0 || ped.y > view.y1) continue;
      drawPedestrian(ctx, ped, world.time);
    }
    for (const thug of world.combat.thugs) {
      this.drawThug(ctx, thug);
    }
    this.drawPlayer(ctx, world);
    this.drawBulletsAndParticles(ctx, world);
    ctx.restore();

    // Warm sun grade over the whole frame.
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, 'rgba(255,190,90,0.05)');
    grad.addColorStop(1, 'rgba(40,60,120,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);
  }

  drawGround(ctx, world, view) {
    const city = world.city;
    // Land mass under everything.
    ctx.fillStyle = '#8f8a7a';
    ctx.fillRect(-70, -70, WORLD_W + 140, WORLD_H + 140);
    // Beach strip along the south edge.
    ctx.fillStyle = '#e3cd96';
    ctx.fillRect(-70, WORLD_H, WORLD_W + 140, 66);
    // District ground tints per block.
    for (let by = 0; by < BLOCK_ROWS; by++) {
      for (let bx = 0; bx < BLOCK_COLS; bx++) {
        const r = blockRect(bx, by);
        if (r.x > view.x1 || r.y > view.y1 || r.x + r.w < view.x0 || r.y + r.h < view.y0) continue;
        const di = districtIndexAt(bx, by);
        ctx.fillStyle = DISTRICT_GROUNDS[di];
        ctx.fillRect(r.x - SIDEWALK, r.y - SIDEWALK, r.w + SIDEWALK * 2, r.h + SIDEWALK * 2);
      }
    }
    void city;
    // Roads: vertical then horizontal strips.
    ctx.fillStyle = ASPHALT;
    for (let i = 0; i <= BLOCK_COLS; i++) {
      const x = i * PITCH;
      if (x + ROAD_W < view.x0 || x > view.x1) continue;
      ctx.fillRect(x, Math.max(0, view.y0), ROAD_W, Math.min(WORLD_H, view.y1) - Math.max(0, view.y0));
    }
    for (let j = 0; j <= BLOCK_ROWS; j++) {
      const y = j * PITCH;
      if (y + ROAD_W < view.y0 || y > view.y1) continue;
      ctx.fillRect(Math.max(0, view.x0), y, Math.min(WORLD_W, view.x1) - Math.max(0, view.x0), ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = LANE_PAINT;
    for (let i = 0; i <= BLOCK_COLS; i++) {
      const x = i * PITCH + ROAD_W / 2 - 2;
      for (let y = 14; y < WORLD_H; y += 46) {
        if (y > view.y0 - 50 && y < view.y1) ctx.fillRect(x, y, 4, 24);
      }
    }
    for (let j = 0; j <= BLOCK_ROWS; j++) {
      const y = j * PITCH + ROAD_W / 2 - 2;
      for (let x = 14; x < WORLD_W; x += 46) {
        if (x > view.x0 - 50 && x < view.x1) ctx.fillRect(x, y, 24, 4);
      }
    }
    // Crosswalks at intersections.
    ctx.fillStyle = CROSSWALK;
    for (let i = 0; i <= BLOCK_COLS; i++) {
      for (let j = 0; j <= BLOCK_ROWS; j++) {
        const x = i * PITCH;
        const y = j * PITCH;
        if (x + ROAD_W < view.x0 || x > view.x1 || y + ROAD_W < view.y0 || y > view.y1) continue;
        for (let s = 0; s < 4; s++) {
          ctx.fillRect(x + 8 + s * 16, y + 2, 8, 9);
          ctx.fillRect(x + 8 + s * 16, y + ROAD_W - 11, 8, 9);
          ctx.fillRect(x + 2, y + 8 + s * 16, 9, 8);
          ctx.fillRect(x + ROAD_W - 11, y + 8 + s * 16, 9, 8);
        }
      }
    }
    // Block pavement frames.
    ctx.fillStyle = 'rgba(226,220,200,0.85)';
    for (let by = 0; by < BLOCK_ROWS; by++) {
      for (let bx = 0; bx < BLOCK_COLS; bx++) {
        const r = blockRect(bx, by);
        if (r.x > view.x1 || r.y > view.y1 || r.x + r.w < view.x0 || r.y + r.h < view.y0) continue;
        ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, 5);
        ctx.fillRect(r.x - 4, r.y + r.h - 1, r.w + 8, 5);
        ctx.fillRect(r.x - 4, r.y, 5, r.h);
        ctx.fillRect(r.x + r.w - 1, r.y, 5, r.h);
      }
    }
    void BLOCK_SIZE;
  }

  drawParksAndLots(ctx, world, view) {
    for (const park of world.city.parks) {
      if (park.x > view.x1 || park.y > view.y1) continue;
      ctx.fillStyle = '#6f9e57';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = '#7fae66';
      ctx.fillRect(park.x + 10, park.y + 10, park.w - 20, park.h - 20);
      ctx.strokeStyle = 'rgba(90,70,40,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(park.x + 26, park.y + 26, park.w - 52, park.h - 52);
    }
    for (const lot of world.city.lots) {
      ctx.fillStyle = '#6d6f72';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(240,240,230,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = lot.x + 12 + i * ((lot.w - 24) / 3);
        ctx.beginPath();
        ctx.moveTo(x, lot.y + 10);
        ctx.lineTo(x, lot.y + lot.h - 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('P', lot.x + lot.w / 2, lot.y + lot.h / 2 + 6);
    }
    void view;
  }

  drawBuildings(ctx, world, view) {
    for (const b of world.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = b.height * 0.32;
      // long shadow, then the wall block, then the roof set back by height
      ctx.fillStyle = 'rgba(24,20,12,0.30)';
      ctx.fillRect(b.x + lift + 5, b.y + lift + 7, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + lift * 0.55, b.y + lift * 0.55, b.w - lift * 0.6, b.h - lift * 0.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + lift * 0.55, b.y + lift * 0.55, b.w - lift * 0.6, b.h - lift * 0.6);
      // rooftop clutter
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      const rx = b.x + lift * 0.55 + 8;
      const ry = b.y + lift * 0.55 + 8;
      if (b.w > 60) ctx.fillRect(rx, ry, 16, 10);
      if (b.h > 60) ctx.fillRect(b.x + b.w - lift * 0.6 - 22, b.y + b.h - lift * 0.6 - 18, 13, 9);
      if (b.name) {
        ctx.fillStyle = 'rgba(16,20,26,0.82)';
        const label = b.name.toUpperCase();
        ctx.font = 'bold 11px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 14;
        roundRect(ctx, b.x + b.w / 2 - tw / 2, b.y + b.h - 4, tw, 17, 4);
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h + 8.5);
      }
    }
  }

  drawPalms(ctx, world, view) {
    for (const palm of world.city.palms) {
      if (palm.x < view.x0 || palm.x > view.x1 || palm.y < view.y0 || palm.y > view.y1) continue;
      const s = palm.s;
      ctx.fillStyle = 'rgba(24,20,12,0.25)';
      ctx.beginPath();
      ctx.ellipse(palm.x + 5, palm.y + 6, 11 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6b42';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(palm.x + 3 * s, palm.y - 6 * s, palm.x + 6 * s, palm.y - 9 * s);
      ctx.stroke();
      ctx.strokeStyle = '#4e8a3f';
      ctx.lineWidth = 2.4 * s;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + palm.x * 0.01;
        ctx.beginPath();
        ctx.moveTo(palm.x + 6 * s, palm.y - 9 * s);
        ctx.quadraticCurveTo(
          palm.x + 6 * s + Math.cos(a) * 9 * s,
          palm.y - 9 * s + Math.sin(a) * 5 * s - 2,
          palm.x + 6 * s + Math.cos(a) * 14 * s,
          palm.y - 9 * s + Math.sin(a) * 8 * s + 3 * s,
        );
        ctx.stroke();
      }
    }
    // Lamps.
    ctx.fillStyle = '#3c4046';
    for (const lamp of world.city.lamps) {
      if (lamp.x < view.x0 || lamp.x > view.x1 || lamp.y < view.y0 || lamp.y > view.y1) continue;
      ctx.fillRect(lamp.x - 1.5, lamp.y - 1.5, 3, 3);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(lamp.x - 1, lamp.y - 1, 2, 2);
      ctx.fillStyle = '#3c4046';
    }
  }

  drawPickups(ctx, world) {
    for (const pk of world.combat.pickups) {
      const bob = Math.sin(pk.bob) * 2.5;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2e7d46';
        roundRect(ctx, -10, -6, 20, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#a8e0b8';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 3.5);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#eef1f3';
        roundRect(ctx, -9, -9, 18, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#d8402e';
        ctx.fillRect(-2.5, -6, 5, 12);
        ctx.fillRect(-6, -2.5, 12, 5);
      } else {
        ctx.fillStyle = '#3a3f45';
        roundRect(ctx, -9, -5, 18, 10, 2);
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        ctx.fillRect(-6, -2, 12, 4);
      }
      ctx.restore();
    }
    // The heist's cash bag.
    const a = world.missions.active;
    if (a && a.def.id === 'marina-heist' && a.stage === 1) {
      const bag = a.data.bag;
      const pulse = 1 + Math.sin(world.time * 5) * 0.12;
      ctx.save();
      ctx.translate(bag.x, bag.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#7a5a26';
      roundRect(ctx, -13, -10, 26, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 5);
      ctx.restore();
    }
  }

  drawObjectiveBeacon(ctx, world) {
    if (world.state !== 'playing') return;
    const obj = world.missions.objective(world);
    if (!obj || obj.kind === 'heat' || obj.kind === 'info') return;
    const d = dist(world.player.x, world.player.y, obj.x, obj.y);
    if (d < 130) return;
    const pulse = 0.55 + Math.sin(world.time * 3.2) * 0.25;
    const grad = ctx.createLinearGradient(0, obj.y - 320, 0, obj.y);
    grad.addColorStop(0, 'rgba(255,217,77,0)');
    grad.addColorStop(1, `rgba(255,217,77,${pulse * 0.5})`);
    ctx.fillStyle = grad;
    ctx.fillRect(obj.x - 13, obj.y - 320, 26, 320);
    ctx.fillStyle = `rgba(255,217,77,${pulse})`;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 15 + Math.sin(world.time * 3.2) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawThug(ctx, thug) {
    ctx.save();
    ctx.translate(thug.x, thug.y);
    if (thug.state === 'down') {
      ctx.rotate(thug.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(120,20,16,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c2c30';
      ctx.fillRect(-3, -2, 6, 13);
      ctx.fillStyle = thug.boss ? '#6e1423' : '#3a3f45';
      ctx.fillRect(-4.5, -10, 9, 9);
      ctx.fillStyle = '#d9a066';
      ctx.beginPath();
      ctx.arc(0, -13, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(thug.angle);
    const swing = Math.sin(thug.walkPhase * 2) * 3;
    ctx.fillStyle = 'rgba(20,16,8,0.22)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24262a';
    ctx.fillRect(0, -3.4 + swing * 0.4, 7.5, 3.4);
    ctx.fillRect(0, 0.2 - swing * 0.4, 7.5, 3.4);
    ctx.fillStyle = thug.boss ? '#6e1423' : '#3a3f45';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.6, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // gun arm toward the aim
    ctx.fillStyle = '#24262a';
    ctx.fillRect(2, -1.6, 11, 3.2);
    ctx.fillStyle = '#101216';
    ctx.fillRect(11, -1.2, 6, 2.4);
    ctx.fillStyle = '#d9a066';
    ctx.beginPath();
    ctx.arc(1.4, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (thug.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,80,60,${thug.hurtFlash * 2.4})`;
      ctx.beginPath();
      ctx.arc(thug.x, thug.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // Health pips over engaged thugs.
    if (thug.state === 'engage' && thug.hp < thug.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(thug.x - 13, thug.y - 24, 26, 4.5);
      ctx.fillStyle = thug.boss ? '#ff5c48' : '#ffb04d';
      ctx.fillRect(thug.x - 12, thug.y - 23, 24 * (thug.hp / thug.maxHp), 2.5);
    }
    if (thug.boss && thug.state !== 'down') {
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DARIO VANE', thug.x, thug.y - 30);
    }
  }

  drawPlayer(ctx, world) {
    const p = world.player;
    if (p.inVehicle) return; // the car is the player right now
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle);
    const swing = Math.sin(p.walkPhase * 2) * (p.speed > 4 ? 3.4 : 0.5);
    ctx.fillStyle = 'rgba(20,16,8,0.25)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, 8.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.fillStyle = '#2e3a46';
    ctx.fillRect(-1, -3.6 + swing * 0.4, 8, 3.6);
    ctx.fillRect(-1, 0.2 - swing * 0.4, 8, 3.6);
    // torso: Marco's teal jacket
    ctx.fillStyle = '#14666b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.8, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // gun arm
    ctx.fillStyle = '#0f4c50';
    ctx.fillRect(2, -1.8, 11, 3.6);
    ctx.fillStyle = '#14161a';
    ctx.fillRect(11.5, -1.3, 7, 2.6);
    // head
    ctx.fillStyle = '#a06a3b';
    ctx.beginPath();
    ctx.arc(1.4, 0, 3.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,60,40,${p.hurtFlash * 1.6})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBulletsAndParticles(ctx, world) {
    ctx.fillStyle = '#ffe9a8';
    for (const b of world.combat.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const flash = world.combat.flash;
    if (flash) {
      ctx.save();
      ctx.translate(flash.x, flash.y);
      ctx.rotate(flash.angle);
      ctx.fillStyle = 'rgba(255,205,90,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(15, -4.5);
      ctx.lineTo(18, 0);
      ctx.lineTo(15, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const pt of world.combat.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }
}

const DISTRICT_GROUNDS = ['#b8a888', '#9aa0a4', '#a8b09a', '#a39a7d', '#96938a', '#a7b3a4', '#b3a37e', '#a5a094'];
