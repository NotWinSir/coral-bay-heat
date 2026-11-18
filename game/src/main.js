// main.js — Coral Bay Heat's bootstrap: canvas, the fixed-step loop, the
// screen state machine (title, playing, paused, busted, wasted), combat
// input, engine audio, and the ?shot= staging used for the screenshots.

import { drawHUD } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { hasSave } from './save.js';
import { applyShot, shotFinalTouch } from './shots.js';
import { World } from './world.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed')) || 20261117;

const input = new Input(canvas);
const world = new World(input, seed);
world.hasContinue = hasSave();
const renderer = new Renderer();

function syncView() {
  world.camera.viewW = canvas.width;
  world.camera.viewH = canvas.height;
}
syncView();
window.addEventListener('resize', syncView);

// In shot mode the world is staged, stepped a fixed number of times and
// rendered once; the capture harness waits for the ready flag.
if (shotName) {
  applyShot(world, shotName);
  for (let i = 0; i < 42; i++) world.update(STEP);
  world.updateCamera(0.5);
  shotFinalTouch(world, shotName);
  syncView();
  renderer.draw(ctx, world);
  drawHUD(ctx, world);
  window.__shotReady = true;
} else {
  bootGame();
}

function bootGame() {
  let last = performance.now();
  let accumulator = 0;
  let wasDriving = false;

  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.12) dt = 0.12;
    accumulator += dt;

    handleMetaKeys();
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      if (world.state === 'title') {
        // Slow aerial drift over the city behind the title.
        world.time += STEP;
        world.camera.x = world.city.bounds.w / 2 + Math.cos(world.time * 0.05) * 620;
        world.camera.y = world.city.bounds.h / 2 + Math.sin(world.time * 0.037) * 420;
        world.traffic.update(STEP, world);
        world.pedestrians.update(STEP, world);
      } else if (world.state !== 'paused') {
        world.update(STEP);
      } else {
        world.updateCamera(STEP);
      }
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;

    // Combat input is read once per rendered frame.
    if (world.state === 'playing' && !world.player.inVehicle && input.mouse.down) {
      world.combat.playerShoot(world);
    }
    if (world.state === 'playing' && input.wasPressed('KeyR')) {
      world.combat.startReload(world);
    }

    // Engine audio follows the driver's seat.
    const driving = world.state === 'playing' && !!world.player.inVehicle;
    if (driving && !wasDriving) {
      world.audio.init();
      world.audio.startEngine();
      world.audio.startMusic();
    }
    if (!driving && wasDriving) world.audio.stopEngine();
    wasDriving = driving;

    renderer.draw(ctx, world);
    drawHUD(ctx, world);
    input.endFrame();
  };
  requestAnimationFrame(frame);
}

function handleMetaKeys() {
  // Any first gesture unlocks audio.
  if (input.mouse.down || input.pressed.size > 0) {
    world.audio.init();
    if (world.state !== 'title') world.audio.startMusic();
  }
  if (world.state === 'title') {
    if (input.wasPressed('Enter')) {
      world.audio.init();
      world.audio.startMusic();
      world.newGame();
    } else if (input.wasPressed('KeyC') && world.hasContinue) {
      world.audio.init();
      world.audio.startMusic();
      world.continueGame();
    }
    return;
  }
  if (input.wasPressed('KeyM')) {
    world.audio.setMuted(!world.audio.muted);
    world.toast(world.audio.muted ? 'Sound off' : 'Sound on', '#e8e4da');
  }
  if (input.wasPressed('KeyP', 'Escape')) {
    if (world.state === 'playing') {
      world.state = 'paused';
      world.saveGame();
    } else if (world.state === 'paused') {
      world.state = 'playing';
    }
  }
}

// Debug and capture handle.
window.__CBH = { world, shotName };
