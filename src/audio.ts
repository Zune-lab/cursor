import { PENTA } from './constants';
import { clamp } from './util';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

const BPM = 96;
const EIGHTH = 60 / BPM / 2; // seconds per eighth note

/**
 * Tiny WebAudio synth, no sample files: keyboard clicks + thock, mouse press/release,
 * guide snaps, a quiet glass-piano note per finished box (quantised to an eighth-note grid,
 * big sections low / small things high / pitch rising left to right), plus a swell, an arpeggio,
 * a finish chord and a "go live" sweep. Every sound can be panned to the cursor that made it.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private t0 = 0;
  private lastSlot = 0;
  private lastTick = 0;
  private closed = false;
  private unlock: (() => void) | null = null;

  constructor(public enabled: boolean, private readonly onLock?: (locked: boolean) => void) {}

  /** Create the context early so a blocked autoplay policy can be reported ("Tap for sound"). */
  warm(): void {
    if (this.enabled) this.context();
  }

  private context(): AudioContext | null {
    if (this.closed) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      const ac = this.ctx;
      this.t0 = ac.currentTime;
      ac.onstatechange = () => this.onLock?.(ac.state === 'suspended');
      if (ac.state === 'suspended') {
        this.onLock?.(true);
        // the first real gesture on the page unlocks audio
        this.unlock = () => void ac.resume().catch(() => undefined);
        addEventListener('pointerdown', this.unlock, { once: true });
        addEventListener('keydown', this.unlock, { once: true });
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  private out(ac: AudioContext, g: GainNode, pan: number): void {
    if (typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(ac.destination);
    } else {
      g.connect(ac.destination);
    }
  }

  /** One enveloped oscillator. `delay` is seconds from now. */
  tone(freq: number, dur: number, type: OscillatorType, vol: number, pan: number, delay = 0): void {
    if (!this.enabled) return;
    const ac = this.context();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime + delay;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(ac, g, pan);
    o.start(t);
    o.stop(t + dur);
  }

  /** Filtered noise burst. No-op where the browser lacks the nodes. */
  private burst(ac: AudioContext, dur: number, freq: number, q: number, vol: number, pan: number, delay = 0): void {
    if (typeof ac.createBiquadFilter !== 'function' || typeof ac.createBufferSource !== 'function' || typeof ac.createBuffer !== 'function') return;
    if (!this.noiseBuf) {
      const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * 0.5)), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    const t = ac.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    this.out(ac, g, pan);
    src.start(t);
    src.stop(t + dur);
  }

  /** Mechanical keyboard: sharp click over a short thock; deeper on the space bar. */
  key(pan: number, deep = false): void {
    if (!this.enabled) return;
    const ac = this.context();
    if (!ac) return;
    this.burst(ac, 0.02, 2600 + Math.random() * 1400, 1.2, 0.05, pan);
    this.tone(deep ? 110 : 170 + Math.random() * 50, 0.06, 'sine', deep ? 0.07 : 0.05, pan);
  }

  /** Mouse press, then (a beat later) release. */
  press(pan: number): void {
    this.tone(1500 + Math.random() * 300, 0.025, 'square', 0.014, pan);
    this.tone(900, 0.02, 'square', 0.008, pan, 0.045);
  }

  /** Alias kept for callers that only need "a click". */
  click(pan: number): void {
    this.press(pan);
  }

  /** Crisp tick when a guide snaps into place. */
  snap(pan: number): void {
    this.tone(3200, 0.018, 'square', 0.02, pan);
  }

  /** A growing heading ticks up in pitch. `frac` is 0..1. Throttled. */
  tickUp(frac: number, pan: number): void {
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    this.tone(520 + 900 * clamp(frac, 0, 1), 0.03, 'triangle', 0.02, pan);
  }

  private glass(freq: number, vol: number, pan: number, delay: number): void {
    this.tone(freq, 1.4, 'sine', vol, pan, delay);
    this.tone(freq * 2, 0.7, 'sine', vol * 0.35, pan, delay);
    this.tone(freq * 3, 0.4, 'sine', vol * 0.12, pan, delay);
  }

  /** One sparse note per finished box, on the next eighth-note boundary. */
  note(area: number, xRatio: number, pan: number): void {
    if (!this.enabled || area < 400) return;
    const ac = this.context();
    if (!ac) return;
    const slot = Math.floor((ac.currentTime - this.t0) / EIGHTH) + 1;
    if (slot <= this.lastSlot) return;
    this.lastSlot = slot;
    const i = clamp(Math.floor(xRatio * 5), 0, 4);
    const oct = area > 150000 ? 0.5 : area > 15000 ? 1 : 2;
    this.glass(PENTA[i] * oct, 0.035, pan, this.t0 + slot * EIGHTH - ac.currentTime);
  }

  /** Airy rise as the page dissolves. */
  swell(): void {
    if (!this.enabled) return;
    const ac = this.context();
    if (!ac) return;
    this.burst(ac, 1.6, 900, 0.6, 0.03, 0);
    this.tone(164.8, 1.6, 'sine', 0.02, 0);
  }

  /** Short E-major arpeggio as the swarm fans out. */
  arpeggio(): void {
    [329.6, 415.3, 493.9, 659.3].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.03, (i - 1.5) / 3, i * 0.07));
  }

  /** Soft E-major chord when the page is done. */
  chord(): void {
    [164.8, 329.6, 415.3, 493.9].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.035, 0, i * 0.09));
  }

  /** Falling sweep for "Go live". */
  sweepDown(): void {
    if (!this.enabled) return;
    const ac = this.context();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.5);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    this.out(ac, g, 0);
    o.start(t);
    o.stop(t + 0.5);
  }

  close(): void {
    this.closed = true;
    if (this.unlock) {
      removeEventListener('pointerdown', this.unlock);
      removeEventListener('keydown', this.unlock);
      this.unlock = null;
    }
    const ac = this.ctx;
    this.ctx = null;
    if (ac) {
      ac.onstatechange = null;
      if (ac.state !== 'closed') ac.close().catch(() => undefined);
    }
  }
}
