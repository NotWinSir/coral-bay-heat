// hud.js — everything drawn over the world: cash and respect, health and
// ammo, wanted stars, the objective line with its distance, the minimap,
// toasts, dialogue, and the title / pause / busted / wasted screens.

import { MAGAZINE } from './combat.js';
import { drawMinimap } from './minimap.js';
import { TITLES } from './missions.js';
import { roundRect } from './vehicles.js';
import { dist } from './rng.js';

const FONT = 'system-ui, -apple-system, sans-serif';

export function drawHUD(ctx, world) {
  const vw = world.camera.viewW;
  const vh = world.camera.viewH;
  if (world.state === 'title') {
    drawTitle(ctx, world);
    return;
  }

  drawStatsPanel(ctx, world);
  drawWanted(ctx, world, vw);
  drawObjective(ctx, world, vw);
  drawHealthAndAmmo(ctx, world, vh);
  if (world.player.inVehicle) drawSpeedo(ctx, world, vw, vh);
  drawMinimap(ctx, world, vw - 218, vh - 158, 200, 140);
  drawToasts(ctx, world, vw);
  drawFloaters(ctx, world);
  drawDialogue(ctx, world, vw, vh);
  drawDistrictBanner(ctx, world, vw);
  drawInteractPrompt(ctx, world, vw, vh);
  if (world.police.bustMeter > 0.02 && world.state === 'playing') drawBustMeter(ctx, world, vw, vh);

  if (world.state === 'paused') drawPause(ctx, world);
  if (world.state === 'busted') drawEndScreen(ctx, world, 'BUSTED', 'The CBPD got their man. Bail posted, ego bruised.', '#4d8dff');
  if (world.state === 'wasted') drawEndScreen(ctx, world, 'WASTED', 'Coral Heights Hospital sends its regards (and a bill).', '#ff5040');
  if (world.player.hp < 32 && world.state === 'playing') {
    ctx.fillStyle = `rgba(190,20,10,${0.16 + Math.sin(world.time * 5) * 0.05})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function drawStatsPanel(ctx, world) {
  panel(ctx, 14, 14, 252, 64);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 21px ${FONT}`;
  ctx.fillText(`$${world.cash.toLocaleString('en-US')}`, 26, 40);
  ctx.fillStyle = '#e8e4da';
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`${TITLES[world.titleIndex]} · Respect ${world.respect}`, 26, 63);
  const p = world.player;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, 150, 24, 104, 10, 5);
  ctx.fill();
  ctx.fillStyle = p.hp > 32 ? '#7dd87d' : '#ff5040';
  if (p.hp > 0) {
    roundRect(ctx, 150, 24, Math.max(6, 104 * (p.hp / p.maxHp)), 10, 5);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(232,228,218,0.75)';
  ctx.font = `10px ${FONT}`;
  ctx.fillText('HP', 150, 46);
}

function drawWanted(ctx, world, vw) {
  const wanted = world.police.wanted;
  if (wanted <= 0) return;
  ctx.textAlign = 'right';
  ctx.font = `26px ${FONT}`;
  for (let i = 0; i < 5; i++) {
    const x = vw - 22 - (4 - i) * 30;
    ctx.fillStyle = i < wanted ? '#ffd94d' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', x, 42);
  }
  if (world.police.hideoutAt(world)) {
    ctx.fillStyle = '#7dd87d';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText('Lying low…', vw - 22, 66);
  } else if (!world.police.playerSeen(world)) {
    ctx.fillStyle = 'rgba(232,228,218,0.8)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('The cops are losing you…', vw - 22, 66);
  }
}

function drawObjective(ctx, world, vw) {
  const obj = world.missions.objective(world);
  if (!obj || !obj.text) return;
  const p = world.player;
  const d = Math.round(dist(p.x, p.y, obj.x, obj.y));
  const label = obj.kind === 'heat' ? obj.text : `${obj.text}  ·  ${d}m`;
  ctx.font = `bold 14.5px ${FONT}`;
  const tw = ctx.measureText(label).width + 26;
  panel(ctx, vw / 2 - tw / 2, 14, tw, 34);
  ctx.fillStyle = '#ffd94d';
  ctx.textAlign = 'center';
  ctx.fillText(label, vw / 2, 37);
  // Edge arrow toward the objective when it is off-screen.
  if (d > 420 && obj.kind !== 'heat') {
    const cam = world.camera;
    const ang = Math.atan2(obj.y - cam.y, obj.x - cam.x);
    const ax = vw / 2 + Math.cos(ang) * 120;
    const ay = 92 + Math.sin(ang) * 26;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(255,217,77,0.9)';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawHealthAndAmmo(ctx, world, vh) {
  const c = world.combat;
  if (world.player.inVehicle) return;
  panel(ctx, 14, vh - 58, 196, 44);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8e4da';
  ctx.font = `bold 14px ${FONT}`;
  if (c.reloading > 0) {
    ctx.fillStyle = '#ffb04d';
    ctx.fillText('RELOADING…', 26, vh - 31);
  } else {
    ctx.fillText(`PISTOL  ${c.ammo} / ${MAGAZINE}`, 26, vh - 31);
  }
  // Magazine pips.
  for (let i = 0; i < MAGAZINE; i++) {
    ctx.fillStyle = i < c.ammo ? '#ffd94d' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(118 + i * 7, vh - 42, 4, 12);
  }
}

function drawSpeedo(ctx, world, vw, vh) {
  const v = world.player.inVehicle;
  const kmh = Math.round(Math.abs(v.speed) * 0.42);
  panel(ctx, vw - 150, vh - 208, 128, 42);
  ctx.fillStyle = '#e8e4da';
  ctx.font = `bold 19px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${kmh} km/h`, vw - 36, vh - 181);
  ctx.fillStyle = 'rgba(232,228,218,0.7)';
  ctx.font = `10.5px ${FONT}`;
  ctx.fillText(v.def.name, vw - 36, vh - 196);
}

function drawToasts(ctx, world, vw) {
  ctx.textAlign = 'center';
  let y = 108;
  for (const toast of world.toasts) {
    const alpha = toast.t < 0.25 ? toast.t / 0.25 : toast.t > toast.life - 0.6 ? Math.max(0, (toast.life - toast.t) / 0.6) : 1;
    ctx.globalAlpha = alpha;
    ctx.font = `bold 16px ${FONT}`;
    const tw = ctx.measureText(toast.text).width + 30;
    ctx.fillStyle = 'rgba(10,16,22,0.75)';
    roundRect(ctx, vw / 2 - tw / 2, y - 19, tw, 28, 7);
    ctx.fill();
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, vw / 2, y + 1);
    y += 36;
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, world) {
  const cam = world.camera;
  ctx.textAlign = 'center';
  ctx.font = `bold 15px ${FONT}`;
  for (const f of world.floaters) {
    const sx = f.x - cam.x + cam.viewW / 2;
    const sy = f.y - cam.y + cam.viewH / 2;
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}

function drawDialogue(ctx, world, vw, vh) {
  const d = world.dialogue;
  if (!d) return;
  const w = Math.min(680, vw - 80);
  const x = vw / 2 - w / 2;
  const y = vh - 118;
  ctx.fillStyle = 'rgba(8,12,18,0.88)';
  roundRect(ctx, x, y, w, 52, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,217,77,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillText(d.speaker.toUpperCase(), x + 16, y + 19);
  ctx.fillStyle = '#f2efe6';
  ctx.font = `14.5px ${FONT}`;
  wrapText(ctx, d.text, x + 16, y + 39, w - 32, 17);
}

function drawDistrictBanner(ctx, world, vw) {
  const b = world.districtBanner;
  if (!b) return;
  const alpha = b.t < 0.3 ? b.t / 0.3 : b.t > 2.1 ? Math.max(0, (2.6 - b.t) / 0.5) : 1;
  ctx.globalAlpha = alpha * 0.92;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 30px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(b.name, vw / 2, 148);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawInteractPrompt(ctx, world, vw, vh) {
  if (world.state !== 'playing' || world.player.inVehicle) return;
  const specials = world.city.specials;
  const p = world.player;
  let prompt = null;
  if (!world.missions.active && world.missions.index < 5 && dist(p.x, p.y, specials.cafe.door.x, specials.cafe.door.y) < 64) {
    prompt = '[E] Talk to Vera';
  } else if (dist(p.x, p.y, specials.motel.door.x, specials.motel.door.y) < 60 || dist(p.x, p.y, specials.hillsideHideout.door.x, specials.hillsideHideout.door.y) < 60) {
    prompt = '[E] Rest and recover';
  }
  if (!prompt) return;
  ctx.textAlign = 'center';
  ctx.font = `bold 15px ${FONT}`;
  const tw = ctx.measureText(prompt).width + 26;
  ctx.fillStyle = 'rgba(10,16,22,0.8)';
  roundRect(ctx, vw / 2 - tw / 2, vh - 168, tw, 30, 7);
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.fillText(prompt, vw / 2, vh - 148);
  void vw;
}

function drawBustMeter(ctx, world, vw, vh) {
  const w = 240;
  panel(ctx, vw / 2 - w / 2, vh - 66, w, 30);
  ctx.fillStyle = '#ff5040';
  roundRect(ctx, vw / 2 - w / 2 + 8, vh - 58, (w - 16) * Math.min(1, world.police.bustMeter), 14, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('BUSTED?', vw / 2, vh - 47.5);
}

// ------------------------------------------------------------- screens

function drawTitle(ctx, world) {
  const vw = world.camera.viewW;
  const vh = world.camera.viewH;
  const grad = ctx.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, 'rgba(10,14,26,0.42)');
  grad.addColorStop(0.55, 'rgba(10,14,26,0.18)');
  grad.addColorStop(1, 'rgba(10,14,26,0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 74px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;
  ctx.fillText('CORAL BAY', vw / 2, vh * 0.3);
  ctx.fillStyle = '#ff7a4d';
  ctx.fillText('HEAT', vw / 2, vh * 0.3 + 72);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f2efe6';
  ctx.font = `17px ${FONT}`;
  ctx.fillText('Marco Reyes owes the city a debt. The city always collects.', vw / 2, vh * 0.3 + 112);

  ctx.font = `bold 21px ${FONT}`;
  ctx.fillStyle = '#7dd87d';
  ctx.fillText('[ ENTER ]  New Game', vw / 2, vh * 0.62);
  if (world.hasContinue) {
    ctx.fillStyle = '#6ad0e8';
    ctx.fillText('[ C ]  Continue', vw / 2, vh * 0.62 + 38);
  }
  ctx.fillStyle = 'rgba(240,238,230,0.85)';
  ctx.font = `14.5px ${FONT}`;
  ctx.fillText('WASD drive & walk · Mouse aim · Click shoot · E enter car / talk · R reload · Shift sprint · Space handbrake · P pause · M mute', vw / 2, vh * 0.82);
  ctx.fillStyle = 'rgba(240,238,230,0.55)';
  ctx.font = `12.5px ${FONT}`;
  ctx.fillText('An original open-world crime story in a city of 192 blocks, 8 districts and one very patient fixer.', vw / 2, vh * 0.82 + 26);
}

function drawPause(ctx, world) {
  const vw = world.camera.viewW;
  const vh = world.camera.viewH;
  ctx.fillStyle = 'rgba(6,10,16,0.62)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText('PAUSED', vw / 2, vh * 0.4);
  ctx.fillStyle = '#f2efe6';
  ctx.font = `16px ${FONT}`;
  const s = world.stats;
  ctx.fillText(`Cash $${world.cash.toLocaleString('en-US')} · ${TITLES[world.titleIndex]} · Respect ${world.respect}`, vw / 2, vh * 0.4 + 42);
  ctx.fillText(`Cars stolen ${s.carsStolen} · Cars sold ${s.carsSold} · Vultures down ${s.thugsDown} · Shots fired ${s.shotsFired}`, vw / 2, vh * 0.4 + 68);
  ctx.fillText(`Busted ${s.timesBusted} · Wasted ${s.timesWasted} · Driven ${(s.distanceDriven / 1000).toFixed(1)} km`, vw / 2, vh * 0.4 + 94);
  ctx.fillStyle = 'rgba(240,238,230,0.75)';
  ctx.fillText('[P] Resume · Progress saves automatically', vw / 2, vh * 0.4 + 132);
}

function drawEndScreen(ctx, world, title, sub, color) {
  const vw = world.camera.viewW;
  const vh = world.camera.viewH;
  ctx.fillStyle = 'rgba(6,8,12,0.55)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `bold 64px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText(title, vw / 2, vh * 0.44);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f2efe6';
  ctx.font = `16px ${FONT}`;
  ctx.fillText(sub, vw / 2, vh * 0.44 + 38);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
