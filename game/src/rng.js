// rng.js — deterministic seeded randomness for Coral Bay Heat.
// The whole city is generated from one seed so every visit (and every
// staged screenshot) sees the exact same streets, buildings and palms.

/** mulberry32: a tiny fast PRNG with a 32-bit state. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A friendly wrapper around a raw PRNG stream. */
export class Rng {
  constructor(seed) {
    this.stream = mulberry32(seed);
    this.seed = seed;
  }

  /** Float in [0, 1). */
  next() {
    return this.stream();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.stream() * (max - min);
  }

  /** Integer in [min, max], both ends included. */
  int(min, max) {
    return min + Math.floor(this.stream() * (max - min + 1));
  }

  /** One element of an array. */
  pick(list) {
    return list[Math.floor(this.stream() * list.length) % list.length];
  }

  /** True with probability p. */
  chance(p) {
    return this.stream() < p;
  }

  /** -1 or +1. */
  sign() {
    return this.stream() < 0.5 ? -1 : 1;
  }

  /** A shallow shuffled copy of a list. */
  shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.stream() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

/** Build an Rng from any numeric seed. */
export function createRng(seed) {
  return new Rng(seed >>> 0);
}

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest angular difference from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn angle `a` toward `b` by at most `step` radians. */
export function turnToward(a, b, step) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

/** Distance between two points. */
export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
