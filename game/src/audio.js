// audio.js — every sound in Coral Bay Heat is synthesised with WebAudio:
// engine hum, two-tone sirens, gunshots, cash chimes and a small procedural
// music loop. No audio files, no network, nothing to load.

const MUSIC_BPM = 92;
const STEP_SECONDS = 60 / MUSIC_BPM / 2; // eighth notes
// An original sun-bleached progression: Am - F - C - G, roots in Hz.
const BASS_ROOTS = [55.0, 43.65, 32.7, 49.0];
const CHORD_TONES = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0],
  [196.0, 246.94, 293.66],
];
const LEAD_SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.musicOn = false;
    this.musicStep = 0;
    this.nextNoteAt = 0;
    this.leadDegree = 2;
    this.noiseBuffer = null;
  }

  /** Create the context on the first user gesture. Safe to call often. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
    }
  }

  /** A short oscillator blip. */
  blip(freq, seconds, type = 'sine', volume = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** A filtered noise burst (shots, crashes, hats). */
  noise(seconds, volume, filterFreq, type = 'lowpass') {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + seconds + 0.02);
  }

  gunshot() {
    this.noise(0.16, 0.5, 2600);
    this.blip(150, 0.1, 'square', 0.18, 40);
  }

  enemyShot() {
    this.noise(0.13, 0.3, 1900);
  }

  dryFire() {
    this.blip(1200, 0.04, 'square', 0.1);
  }

  reloadStart() {
    this.blip(700, 0.05, 'square', 0.14);
  }

  reloadEnd() {
    this.blip(980, 0.05, 'square', 0.16);
    setTimeout(() => this.blip(1250, 0.06, 'square', 0.14), 60);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.2, 1320);
  }

  cash() {
    this.blip(1046, 0.09, 'triangle', 0.22);
    setTimeout(() => this.blip(1568, 0.14, 'triangle', 0.2), 70);
  }

  hurt() {
    this.blip(220, 0.14, 'sawtooth', 0.2, 90);
  }

  crash(intensity) {
    this.noise(0.22, Math.min(0.6, 0.2 + intensity * 0.4), 500);
    this.blip(70, 0.2, 'sine', 0.3, 34);
  }

  carjack() {
    this.blip(520, 0.07, 'square', 0.16);
    setTimeout(() => this.blip(390, 0.09, 'square', 0.16), 80);
  }

  missionDone() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 90));
  }

  busted() {
    const notes = [392, 329.63, 261.63, 196];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.2), i * 130));
  }

  /** Looping engine sound; call setEngine every frame while driving. */
  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.value = 0.0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    sub.start();
    this.engineNodes = { osc, sub, filter, gain };
  }

  setEngine(speedRatio, throttle) {
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + speedRatio * 165 + throttle * 22;
    this.engineNodes.osc.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineNodes.sub.frequency.setTargetAtTime(rpm * 0.5, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(280 + speedRatio * 700, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, t, 0.09);
  }

  stopEngine() {
    if (!this.ctx || !this.engineNodes) return;
    const nodes = this.engineNodes;
    this.engineNodes = null;
    nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => {
      try {
        nodes.osc.stop();
        nodes.sub.stop();
      } catch {
        // already stopped
      }
    }, 200);
  }

  /** Two-tone police siren, heard when a unit is close. */
  setSiren(active, closeness) {
    if (!this.ctx) return;
    if (active && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 825;
      lfo.type = 'square';
      lfo.frequency.value = 0.85;
      lfoGain.gain.value = 125;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    if (this.sirenNodes) {
      const target = active ? 0.028 + closeness * 0.075 : 0;
      this.sirenNodes.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
      if (!active) {
        const nodes = this.sirenNodes;
        this.sirenNodes = null;
        setTimeout(() => {
          try {
            nodes.osc.stop();
            nodes.lfo.stop();
          } catch {
            // already stopped
          }
        }, 600);
      }
    }
  }

  /** Start the procedural music loop (idempotent). */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicStep = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.06;
  }

  stopMusic() {
    this.musicOn = false;
  }

  /** Advance the music sequencer; call every frame. */
  update() {
    if (!this.ctx || !this.musicOn) return;
    while (this.nextNoteAt < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.musicStep, this.nextNoteAt);
      this.nextNoteAt += STEP_SECONDS;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  scheduleStep(step, when) {
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
    const play = (fn) => (delay > 4 ? setTimeout(fn, delay) : fn());
    if (beat % 4 === 0) {
      const root = BASS_ROOTS[bar];
      play(() => this.blip(root * 2, 0.32, 'triangle', 0.16));
    }
    if (beat % 8 === 4) {
      for (const tone of CHORD_TONES[bar]) {
        play(() => this.blip(tone, 0.4, 'sine', 0.045));
      }
    }
    if (beat % 2 === 1) {
      play(() => this.noise(0.03, 0.028, 6000, 'highpass'));
    }
    if (beat === 6 || beat === 14) {
      this.leadDegree = Math.max(0, Math.min(LEAD_SCALE.length - 1, this.leadDegree + (Math.random() < 0.5 ? -1 : 1)));
      const tone = LEAD_SCALE[this.leadDegree];
      play(() => this.blip(tone, 0.24, 'sine', 0.05));
    }
  }
}
