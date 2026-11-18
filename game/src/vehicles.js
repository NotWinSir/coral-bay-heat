// vehicles.js — the cars of Coral Bay: types, arcade physics and their
// top-down drawing. One vehicle record serves traffic, parked cars, the
// police interceptors and whatever Marco is driving right now.

import { collideCircle } from './city.js';
import { clamp } from './rng.js';

export const VEHICLE_TYPES = {
  sedan: {
    name: 'Marlin Sedan', w: 46, h: 22, topSpeed: 300, accel: 210, grip: 5.2,
    colors: ['#b8bcc0', '#7a8894', '#94423a', '#3f6186', '#c2b280', '#5d6e5a'],
    chopValue: 120,
  },
  taxi: {
    name: 'Coral Cab', w: 46, h: 22, topSpeed: 290, accel: 200, grip: 5.2,
    colors: ['#e8b53a'],
    chopValue: 110,
  },
  hatch: {
    name: 'Pico Hatch', w: 40, h: 20, topSpeed: 260, accel: 190, grip: 5.6,
    colors: ['#a8c686', '#e07a5f', '#81b0c0', '#d9d3c3', '#7d8590'],
    chopValue: 90,
  },
  sport: {
    name: 'Vireo GT', w: 48, h: 21, topSpeed: 430, accel: 330, grip: 6.4,
    colors: ['#d8402e', '#f07818', '#28303a', '#e8e4da', '#1f7a8c'],
    chopValue: 420,
  },
  van: {
    name: 'Hauler Van', w: 54, h: 24, topSpeed: 240, accel: 150, grip: 4.4,
    colors: ['#cfd2cd', '#8a97a3', '#b08968', '#6b705c'],
    chopValue: 160,
  },
  truck: {
    name: 'Portside Truck', w: 62, h: 26, topSpeed: 220, accel: 130, grip: 4.0,
    colors: ['#96705a', '#5f7a8c', '#767c6d'],
    chopValue: 200,
  },
  police: {
    name: 'CBPD Interceptor', w: 48, h: 22, topSpeed: 400, accel: 320, grip: 6.2,
    colors: ['#20262e'],
    chopValue: 0,
  },
};

let nextVehicleId = 1;

/** Create a vehicle record. mode: 'parked' | 'traffic' | 'police' | 'player'. */
export function createVehicle(type, x, y, angle, color, mode = 'parked') {
  const def = VEHICLE_TYPES[type];
  return {
    id: nextVehicleId++,
    type,
    def,
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    color,
    mode,
    driverPresent: mode === 'traffic' || mode === 'police',
    owned: false,
    stolen: false,
    hp: 100,
    honkAt: 0,
    // traffic lane state
    lane: null,
    laneT: 0,
    cruiseSpeed: 0,
    // police state
    bustTime: 0,
    // scratch
    hitFlash: 0,
    lastCrashAt: -9,
  };
}

/** The two collision circles of a car (front and rear axle points). */
export function vehicleCircles(v) {
  const c = Math.cos(v.angle);
  const s = Math.sin(v.angle);
  const off = v.def.w * 0.28;
  const r = v.def.h * 0.62;
  return [
    { x: v.x + c * off, y: v.y + s * off, r },
    { x: v.x - c * off, y: v.y - s * off, r },
  ];
}

/** Do two vehicles overlap? Circle-pair approximation. */
export function vehiclesOverlap(a, b) {
  for (const ca of vehicleCircles(a)) {
    for (const cb of vehicleCircles(b)) {
      const dx = ca.x - cb.x;
      const dy = ca.y - cb.y;
      const rr = ca.r + cb.r;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
}

/**
 * Arcade car physics. control: { throttle: -1..1, steer: -1..1, brake }.
 * Returns impact speed when the car struck a building this step, else 0.
 */
export function updateVehiclePhysics(city, v, dt, control) {
  const def = v.def;
  const targetSteer = clamp(control.steer, -1, 1) * 0.62;
  v.steer += (targetSteer - v.steer) * Math.min(1, dt * 8);

  if (control.brake && Math.abs(v.speed) > 12) {
    v.speed -= Math.sign(v.speed) * 420 * dt;
  } else if (control.throttle > 0) {
    v.speed += def.accel * control.throttle * dt * (1 - Math.max(0, v.speed) / (def.topSpeed * 1.25));
  } else if (control.throttle < 0) {
    if (v.speed > 20) v.speed -= 380 * dt;
    else v.speed += def.accel * 0.55 * control.throttle * dt * (1 - Math.max(0, -v.speed) / (def.topSpeed * 0.45));
  }
  // Rolling drag and lateral grip.
  v.speed -= v.speed * 0.55 * dt;
  if (!control.throttle && !control.brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 26 * dt);
  v.speed = clamp(v.speed, -def.topSpeed * 0.42, def.topSpeed);

  const steerAuthority = clamp(Math.abs(v.speed) / 60, 0, 1);
  v.angle += v.steer * steerAuthority * def.grip * 0.36 * dt * (v.speed >= 0 ? 1 : -1) * clamp(Math.abs(v.speed) / 120, 0.25, 1.15);

  const stepX = Math.cos(v.angle) * v.speed * dt;
  const stepY = Math.sin(v.angle) * v.speed * dt;
  const beforeX = v.x;
  const beforeY = v.y;
  v.x += stepX;
  v.y += stepY;

  let impact = 0;
  for (const circle of vehicleCircles(v)) {
    const fixed = collideCircle(city, circle.x, circle.y, circle.r);
    if (fixed.hit) {
      v.x += fixed.x - circle.x;
      v.y += fixed.y - circle.y;
      impact = Math.max(impact, Math.abs(v.speed));
    }
  }
  if (impact > 60) {
    v.speed *= -0.18;
    v.hp -= impact * 0.045;
  } else if (impact > 0) {
    // Scrape: keep the position fix, bleed a little speed.
    v.speed *= 0.94;
    v.x = Math.max(20, Math.min(city.bounds.w - 20, v.x));
    v.y = Math.max(20, Math.min(city.bounds.h - 20, v.y));
    void beforeX;
    void beforeY;
  }
  v.hp = Math.max(8, v.hp);
  if (v.hitFlash > 0) v.hitFlash -= dt;
  return impact;
}

/** Draw one car, top-down, nose pointing along +angle. */
export function drawVehicle(ctx, v, time) {
  const def = v.def;
  const w = def.w;
  const h = def.h;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);

  // shadow
  ctx.fillStyle = 'rgba(20,16,8,0.28)';
  roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 6);
  ctx.fill();

  // body
  ctx.fillStyle = v.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // nose taper
  ctx.fillStyle = shade(v.color, 18);
  roundRect(ctx, w * 0.18, -h / 2 + 2, w * 0.3, h - 4, 4);
  ctx.fill();

  // cabin and glass
  ctx.fillStyle = '#1d2733';
  roundRect(ctx, -w * 0.16, -h / 2 + 3.5, w * 0.34, h - 7, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,235,0.5)';
  roundRect(ctx, w * 0.08, -h / 2 + 4.5, w * 0.08, h - 9, 2);
  ctx.fill();

  if (v.type === 'police') {
    ctx.fillStyle = '#eef1f3';
    roundRect(ctx, -w * 0.2, -h / 2 + 1.5, w * 0.42, h - 3, 4);
    ctx.fill();
    ctx.fillStyle = '#1d2733';
    roundRect(ctx, -w * 0.14, -h / 2 + 3.5, w * 0.3, h - 7, 3);
    ctx.fill();
    // light bar: red / blue alternating flash
    const phase = Math.floor(time * 5) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#5a1a16';
    ctx.fillRect(-4, -h / 2 + 2, 8, 5);
    ctx.fillStyle = phase ? '#274b8f' : '#3fa2ff';
    ctx.fillRect(-4, h / 2 - 7, 8, 5);
    ctx.fillStyle = '#f5f7f8';
    ctx.font = 'bold 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CBPD', 2, 2.5);
  }
  if (v.type === 'taxi') {
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  if (v.type === 'truck') {
    ctx.fillStyle = shade(v.color, -22);
    roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w * 0.52, h - 4, 2);
    ctx.fill();
  }
  if (v.type === 'van') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-w * 0.3, -h / 2 + 3, w * 0.4, h - 6);
  }

  // wheels
  ctx.fillStyle = '#14161a';
  const ww = 8;
  const wh = 4.6;
  ctx.fillRect(w * 0.28, -h / 2 - 1.5, ww, wh);
  ctx.fillRect(w * 0.28, h / 2 - wh + 1.5, ww, wh);
  ctx.fillRect(-w * 0.36, -h / 2 - 1.5, ww, wh);
  ctx.fillRect(-w * 0.36, h / 2 - wh + 1.5, ww, wh);

  // headlights
  ctx.fillStyle = 'rgba(255,244,190,0.9)';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 2.4, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 7, 2.4, 4);
  // tail lights
  ctx.fillStyle = 'rgba(255,60,50,0.85)';
  ctx.fillRect(-w / 2 - 0.4, -h / 2 + 3, 2, 4);
  ctx.fillRect(-w / 2 - 0.4, h / 2 - 7, 2, 4);

  if (v.hp < 45) {
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.beginPath();
    ctx.arc(w * 0.3, 0, 6 + (45 - v.hp) * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  if (v.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${v.hitFlash * 2.2})`;
    roundRect(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
  }
  ctx.restore();
}

/** Rounded-rect path helper shared by the drawing code. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lighten (positive) or darken a #rrggbb colour. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}
