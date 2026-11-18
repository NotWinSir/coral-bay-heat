// minimap.js — the whole of Coral Bay on one little map: district tints,
// the street grid, and blips for Marco, the objective, the police, the
// hideouts, Reyes Auto and Cafe Castellan.

import { BLOCK_COLS, BLOCK_ROWS, PITCH, ROAD_W, WORLD_H, WORLD_W, districtIndexAt } from './city.js';
import { roundRect } from './vehicles.js';

const DISTRICT_TINTS = ['#c9b995', '#aeb6ba', '#bcc4ab', '#bcb08d', '#aaa79d', '#b7c6b4', '#c6b48d', '#b7b2a6'];

/** Draw the minimap into the rect (x, y, w, h) of screen space. */
export function drawMinimap(ctx, world, x, y, w, h) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  // Panel.
  ctx.fillStyle = 'rgba(10,16,22,0.78)';
  roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // District tints.
  for (let by = 0; by < BLOCK_ROWS; by++) {
    for (let bx = 0; bx < BLOCK_COLS; bx++) {
      ctx.fillStyle = DISTRICT_TINTS[districtIndexAt(bx, by)];
      ctx.fillRect(x + (ROAD_W + bx * PITCH) * sx, y + (ROAD_W + by * PITCH) * sy, (PITCH - ROAD_W) * sx, (PITCH - ROAD_W) * sy);
    }
  }
  // Streets.
  ctx.fillStyle = '#565a5e';
  for (let i = 0; i <= BLOCK_COLS; i++) ctx.fillRect(x + i * PITCH * sx, y, ROAD_W * sx, h);
  for (let j = 0; j <= BLOCK_ROWS; j++) ctx.fillRect(x, y + j * PITCH * sy, w, ROAD_W * sy);
  const px = (wx) => x + wx * sx;
  const py = (wy) => y + wy * sy;
  const specials = world.city.specials;
  // Story places.
  blip(ctx, px(specials.cafe.door.x), py(specials.cafe.door.y), '#ffd94d', 'V');
  blip(ctx, px(specials.chopShop.door.x), py(specials.chopShop.door.y), '#ff9d5c', '$');
  blip(ctx, px(specials.motel.door.x), py(specials.motel.door.y), '#7dd87d', 'H');
  blip(ctx, px(specials.hillsideHideout.door.x), py(specials.hillsideHideout.door.y), '#7dd87d', 'H');
  blip(ctx, px(specials.marinaOffice.door.x), py(specials.marinaOffice.door.y), '#6ad0e8', 'M');
  // Police units.
  if (world.police.wanted > 0) {
    const flash = Math.floor(world.time * 3) % 2 === 0;
    for (const unit of world.police.units) {
      ctx.fillStyle = flash ? '#ff5040' : '#4d8dff';
      ctx.beginPath();
      ctx.arc(px(unit.x), py(unit.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Objective.
  const obj = world.missions.objective(world);
  if (obj && obj.kind !== 'heat') {
    const pulse = 3.6 + Math.sin(world.time * 4) * 1.1;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(px(obj.x), py(obj.y), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,77,0.65)';
    ctx.beginPath();
    ctx.arc(px(obj.x), py(obj.y), pulse + 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Engaged thugs.
  ctx.fillStyle = '#ff7a5c';
  for (const thug of world.combat.thugs) {
    if (thug.state === 'down') continue;
    ctx.fillRect(px(thug.x) - 1.6, py(thug.y) - 1.6, 3.2, 3.2);
  }
  // Player arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(px(p.x), py(p.y));
  ctx.rotate(p.inVehicle ? p.inVehicle.angle : p.aimAngle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6.4, 0);
  ctx.lineTo(-4.4, -4);
  ctx.lineTo(-4.4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // Viewport frame.
  const cam = world.camera;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(
    x + (cam.x - cam.viewW / 2) * sx,
    y + (cam.y - cam.viewH / 2) * sy,
    cam.viewW * sx,
    cam.viewH * sy,
  );
}

function blip(ctx, x, y, color, letter) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,14,18,0.85)';
  ctx.font = 'bold 6.4px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(letter, x, y + 2.3);
}
