// input.js — keyboard and mouse state for Coral Bay Heat.
// Tracks held keys, one-frame "pressed" edges and the pointer, all in
// KeyboardEvent.code terms so layouts do not matter.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, rightDown: false };
    this.enabled = true;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.mouse.rightDown = false;
    });
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Is a key currently held? Accepts one code or a list of codes. */
  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** Was a key pressed this frame (edge, not hold)? */
  wasPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Eat a press edge so later fixed steps in the same frame ignore it. */
  consume(...codes) {
    for (const code of codes) this.pressed.delete(code);
  }

  /** Call once per rendered frame, after the game has read the edges. */
  endFrame() {
    this.pressed.clear();
  }
}

/** Keys the game swallows so the page never scrolls or searches. */
const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);
