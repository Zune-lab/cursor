import { AudioEngine } from './audio';
import { ACCENT, DEFAULT_MAX_TASKS, NAMES, RADII, palette } from './constants';
import { Cursor } from './cursor';
import { EGGS, eggTarget, type EggKind } from './egg';
import { flockStep } from './flock';
import { FxLayer } from './fx';
import { canCapture, captureStills, unreadableMedia } from './capture';
import { makePersona, paceFor } from './persona';
import { primeLazyContent } from './prime';
import { createRng } from './rng';
import { Scanner } from './snapshot';
import type { Box, Labels, LineTask, MediaTask, SwarmOptions, SwarmOutcome, Task, TextTask } from './types';
import { DEFAULT_LABELS, Ui } from './ui';
import { clamp, ease, isEditable, isTransparent, pageSize, raf, sanitize, setStyle, sleep } from './util';

/** The page is scanned this many viewport heights below the viewer (a task unlocks at 1.4, so it always exists in time). */
const LOOKAHEAD = 2.2;
const SELECT_HANDLES = [[0, 0], [50, 0], [100, 0], [0, 50], [100, 50], [0, 100], [50, 100], [100, 100]]
  .map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`)
  .join('');
/** Blueprints are only drawn for blocks this big, and never more than this many at once. */
const BP_MIN_AREA = 1500;
const BP_MAX = 40;
/** A free cursor looks at this many waiting tasks to find one that is not blocked behind an unfinished parent box. */
/** Share of the (big enough) text boxes that are typed in a spare spot and dragged home; the rest are typed right where they belong. */
const STAGE_CHANCE = 0.15;
const PICK_WINDOW = 8;
/** Queue-position penalty (px of travel) when picking the nearest task: the oldest waiting task wins unless another is clearly closer. */
const PICK_PENALTY = 60;
/** Catch-up: up to `CATCHUP_SCAN` unlocked tasks are counted; above `CATCHUP_FREE` per cursor everyone speeds up by `CATCHUP_GAIN` per extra task, up to `MAX_BOOST`. */
const CATCHUP_SCAN = 240;
const CATCHUP_FREE = 8;
const CATCHUP_GAIN = 0.08;
const MAX_BOOST = 3;
/** Above this boost, text is typed in place (no staging detour) and nobody stops to think. */
const HURRY = 1.5;
/** Bigger pages get more cursors: one extra per this many estimated elements when the run starts... */
const TASKS_PER_EXTRA = 150;
/** ...and while running, one more joins (at most every `GROW_EVERY` ms) when this many unlocked tasks wait per cursor. */
const GROW_AT = 12;
const GROW_EVERY = 450;
/** Default ceiling for the swarm size (desktop / phone). */
const MAX_AGENTS = 14;
const MAX_AGENTS_SMALL = 8;
/** Longest a waiting cursor sleeps without being woken by an event. */
const PARK_MS = 100;
const nextFrame = (): Promise<void> => new Promise((r) => raf(() => r()));

/** `target` option -> element. A selector that matches nothing falls back to the whole page (with a warning). */
export function resolveTarget(t: SwarmOptions['target']): Element | null {
  if (!t) return null;
  if (typeof t !== 'string') return t.isConnected ? t : null;
  let el: Element | null = null;
  try {
    el = document.querySelector(t);
  } catch {
    /* invalid selector: handled below */
  }
  if (!el) console.warn(`[swarm-cursors] target "${t}" not found, rebuilding the whole page`);
  return el;
}

/** The background a section actually shows: its own, or the nearest ancestor that paints one. */
function effectiveBg(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (!isTransparent(c)) return c;
  }
  return '#fff';
}

/** Final box of a pen line (a thin rectangle) and its direction. */
function lineGeom(t: LineTask): Box & { horiz: boolean } {
  const [x1, y1, x2, y2] = t.pts;
  const th = Math.max(1, t.lw);
  const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  return {
    x: Math.min(x1, x2) - (horiz ? 0 : th / 2),
    y: Math.min(y1, y2) - (horiz ? th / 2 : 0),
    w: horiz ? Math.abs(x2 - x1) : th,
    h: horiz ? th : Math.abs(y2 - y1),
    horiz,
  };
}

export interface SwarmHooks {
  /** "Replay" button: start a fresh run with these options. */
  replay(opts: SwarmOptions): void;
  /** Called once the overlay has been torn down. */
  disposed(): void;
}

/** One run of the effect: owns the overlay, the cursors, the frame pump and the task queue. */
export class Swarm {
  readonly done: Promise<SwarmOutcome>;
  private settle!: (o: SwarmOutcome) => void;

  /** Viewport, cached from scroll/resize events so the hot loops never force a layout. */
  private readonly vp = { x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight };
  private pageW = 0;
  private pageH = 0; // bottom of what is rebuilt: the page, or the section in section mode
  /** Section mode: the element the effect is limited to (null = whole page). */
  private readonly target: Element | null;
  private startY = 0; // top of what is rebuilt
  private scanner: Scanner;
  private coveredTo = 0; // page height scanned so far
  private scanDone = false;
  private bandH = 0;
  private prog = 0;
  private progDirty = false;
  private readonly idleBuf: Cursor[] = []; // scratch list for followMouse (no allocation per frame)
  private readonly working = new Set<Cursor>(); // cursors in the middle of a task; the rest follow the real mouse
  private lastScroll = 0;
  private hiddenAt = 0; // when the tab went to the background (0 = visible)
  private hiddenMs = 0; // total time spent in the background, taken off the animation clock
  private lastEgg = 0;
  private egg: { kind: EggKind; t0: number } | null = null;
  private dead = false;
  private finished = false;
  private speed: number;
  /** Catch-up factor (1..MAX_BOOST) while a big backlog of unlocked work waits; multiplies `speed` in every animation. */
  private boost = 1;
  private readonly parked = new Set<() => void>(); // cursors waiting for something to happen (see `park` / `wake`)
  private readonly nAgents: number;
  private readonly maxAgents: number;
  private backlog = 0; // unlocked, untaken tasks per cursor (from updateBoost)
  private lastGrow = 0;
  private total: number;
  private spawned = 0;
  private qi = 0; // next task index
  private busy = 0;
  private finishedAgents = 0;
  private built = 0;
  private tour = false;
  private vel = 0;
  private acc = 0;
  private cx = window.innerWidth / 2;
  private cy = window.innerHeight / 2;
  private readonly rand: () => number;
  private last = 0; // previous rAF timestamp (pump)
  private sinceSpawn = 0;
  private lastY = window.scrollY;
  private readonly cursors: Cursor[] = [];
  private readonly blueprints = new Map<Task, HTMLDivElement>();
  private readonly assisting = new Set<Cursor>(); // cursors currently lending a hand (also in `working`)
  private carrying = 0; // frames being carried home by a helper; the run is not finished until they arrive
  private readonly stills = new WeakMap<Element, string>();
  private mediaReady: Promise<void> = Promise.resolve();
  private tasks: Task[] = [];
  private orbiting = true;
  private readonly colors: string[];
  private readonly names: string[];
  private readonly ui: Ui;
  private readonly audio: AudioEngine;
  private readonly fx: FxLayer;

  constructor(private readonly opts: SwarmOptions, private readonly hooks: SwarmHooks) {
    this.done = new Promise((res) => (this.settle = res));
    this.rand = createRng(opts.seed);
    this.nAgents = Math.max(1, Math.floor(opts.agents ?? (window.innerWidth < 640 ? 4 : 6)));
    this.total = this.nAgents;
    this.maxAgents = Math.max(this.nAgents, Math.floor(opts.maxAgents ?? (window.innerWidth < 640 ? MAX_AGENTS_SMALL : MAX_AGENTS)));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
    this.colors = opts.colors?.length ? opts.colors : palette(this.maxAgents);
    this.names = opts.names?.length ? opts.names : NAMES;
    this.target = resolveTarget(opts.target);
    this.scanner = new Scanner({ maxTasks: opts.maxTasks ?? DEFAULT_MAX_TASKS, exclude: opts.exclude, root: this.target ?? undefined, stills: this.stills });
    this.bandH = Math.max(1200, this.vp.h * 1.5);

    const de = document.documentElement;
    const bg = this.target
      ? effectiveBg(this.target)
      : [getComputedStyle(document.body).backgroundColor, getComputedStyle(de).backgroundColor].find((c) => !isTransparent(c)) || '#fff';
    const size = pageSize();
    const region = this.target ? this.sectionBox() : null;
    if (region) {
      this.startY = region.y;
      this.coveredTo = region.y;
      this.pageH = region.y + region.h;
    }
    this.ui = new Ui(bg, size.w, size.h, this.labels(), region);
    this.audio = new AudioEngine(opts.sound !== false, (locked) => this.ui.setSoundLocked(locked));
    this.ui.setSound(this.audio.enabled);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = new FxLayer(this.ui.canvas, opts.fx ?? !reduced, () => !this.dead, this.rand);

    // the screenshot of unreadable media has to be taken while the page is still visible: bring the section into view, grab it, and only then fade in
    if (this.target) this.revealTarget();
    const fadeIn = (): void => {
      raf(() => (this.ui.host.style.opacity = '1'));
    };
    de.appendChild(this.ui.host);
    if (opts.captureMedia !== false && canCapture()) {
      this.mediaReady = captureStills(unreadableMedia(this.target ?? document.body), this.stills);
      void this.mediaReady.then(fadeIn);
    } else fadeIn();

    document.addEventListener('visibilitychange', this.onVisibility);
    addEventListener('mousemove', this.onMove);
    addEventListener('keydown', this.onKey);
    addEventListener('scroll', this.onView, { passive: true });
    addEventListener('resize', this.onView);
    this.ui.onAction(this.onAction);

    if (opts.tour) this.setTour(true);
    if ([1, 2, 3].includes(this.speed)) this.ui.setSpeed(`s${this.speed}`);
    for (let i = 0; i < this.nAgents; i++) this.addCursor();
    raf(this.pump);

    void this.boot();
  }

  /**
   * One rAF loop for everything periodic (replaces two setIntervals):
   * the tour auto-scroll, which only goes as fast as the swarm keeps up, and the
   * "scroll fast -> more cursors join" check. Time-based, so it is frame-rate independent.
   */
  private pump = (now: number): void => {
    if (this.dead) return;
    const dt = this.last ? Math.min(100, now - this.last) : 16.7;
    this.last = now;
    const k = dt / 16.7;
    if (!this.scanDone && !this.orbiting && this.coveredTo < this.vp.y + this.vp.h * LOOKAHEAD) this.scanNext();
    if (this.progDirty) this.flushProgress();
    this.advance();
    const more = this.qi < this.tasks.length || !this.scanDone;
    if (this.tour && more && !(this.target && this.vp.y + this.vp.h >= this.pageH)) {
      const idle = 1 - Math.min(1, this.busy / this.total); // busy swarm -> slow down, idle swarm -> speed up
      this.vel += (idle * 7 * this.speed - this.vel) * (1 - Math.pow(0.92, k));
      this.acc += this.vel * k;
      const whole = Math.floor(this.acc);
      if (whole >= 1) {
        scrollBy({ top: whole, behavior: 'instant' });
        this.acc -= whole;
      }
    }
    if (!this.orbiting) {
      this.sweepPast();
      this.followMouse(now);
    }
    this.sinceSpawn += dt;
    if (this.sinceSpawn >= 100) {
      this.sinceSpawn = 0;
      if (this.opts.blueprint && !this.orbiting) this.updateBlueprints();
      if (!this.orbiting) this.updateBoost();
      const v = Math.abs(this.vp.y - this.lastY) * 10; // px/s
      this.lastY = this.vp.y;
      if (!this.finished && !this.orbiting && more && this.total < this.maxAgents) {
        if (v > 800 && this.spawned < 6) {
          this.spawned++;
          this.spawn();
        } else if (this.opts.adaptive !== false && this.backlog > GROW_AT && now - this.lastGrow > GROW_EVERY) {
          this.lastGrow = now; // a big page: more hands, one at a time, until the backlog per cursor is back under control
          this.spawn();
        }
      }
    }
    raf(this.pump);
  };

  private flushProgress(): void {
    this.progDirty = false;
    this.ui.setProgress(this.prog);
  }

  private setTour(on: boolean): void {
    this.tour = on;
    this.ui.setTour(on);
  }

  /**
   * Intro: the page dissolves while the cursors orbit the site's favicon; meanwhile lazy content
   * is scrolled into existence. Then the page is snapshotted and the swarm fans out.
   */
  private async boot(): Promise<void> {
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
    if (icon) this.ui.showFavicon(icon);
    this.audio.warm();
    this.audio.swell();
    const orbit = (): void => {
      if (this.dead || !this.orbiting) return;
      const f = this.focus();
      flockStep(this.cursors, f.x, f.y, true);
      raf(orbit);
    };
    raf(orbit);

    const labels = this.labels();
    this.ui.setStatus(labels.preparing);
    await this.mediaReady; // screenshots first: the hidden scroll pass moves the page
    if (this.dead) return;
    await Promise.all([
      this.opts.prime === false ? Promise.resolve() : primeLazyContent(() => this.dead, 2500, Math.min(this.vp.y + this.vp.h * (LOOKAHEAD + 1), this.target ? this.pageH + this.vp.h : Infinity), this.target ? this.startY - this.vp.h : 0),
      sleep(900 / this.speed),
    ]);
    if (this.dead) return;

    this.ui.resizeTo(0, 0); // measure the page itself, not our own overlay
    const size = pageSize();
    this.ui.resizeTo(size.w, size.h);
    this.pageW = size.w;
    if (this.target) this.syncRegion(size.w, size.h);
    else this.pageH = size.h;
    // scan down to just below the viewer, a band per frame, so a huge page never freezes the tab
    while (!this.scanDone && this.coveredTo < this.vp.y + this.vp.h * LOOKAHEAD) {
      this.scanNext();
      if (!this.scanDone && this.coveredTo < this.vp.y + this.vp.h * LOOKAHEAD) await nextFrame();
      if (this.dead) return;
    }
    this.growForPage();
    this.ui.setStatus(labels.ready);
    this.orbiting = false;
    this.ui.hideFavicon();
    this.audio.arpeggio();
    const initial = [...this.cursors];
    const gap = Math.min(120, 700 / initial.length);
    initial.forEach((c, i) => setTimeout(() => void this.agent(c), i * gap));
  }

  stop(): void {
    if (this.dead) return;
    this.dead = true;
    this.wake(); // parked cursors notice at once and leave
    this.blueprints.clear();
    document.removeEventListener('visibilitychange', this.onVisibility);
    removeEventListener('mousemove', this.onMove);
    removeEventListener('keydown', this.onKey);
    removeEventListener('scroll', this.onView);
    removeEventListener('resize', this.onView);
    this.fx.dispose();
    this.audio.close();
    this.ui.host.remove();
    this.settle('stopped');
    this.opts.onStop?.();
    this.hooks.disposed();
  }

  /* ---------- input ---------- */

  /**
   * Background tab: browsers stop requestAnimationFrame there, so animations would freeze and then
   * jump to their end on return. Instead the animation clock stops while hidden and sound is muted.
   */
  private onVisibility = (): void => {
    if (document.hidden) {
      if (!this.hiddenAt) this.hiddenAt = performance.now();
      this.audio.muted = true;
    } else if (this.hiddenAt) {
      this.hiddenMs += performance.now() - this.hiddenAt;
      this.hiddenAt = 0;
      this.last = 0; // the next pump frame starts a fresh delta
      this.audio.muted = false;
    }
  };

  /** Animation clock: real time minus the time the tab spent in the background. */
  private now(): number {
    return (this.hiddenAt || performance.now()) - this.hiddenMs; // frozen while hidden
  }

  private onView = (): void => {
    this.lastScroll = performance.now();
    this.vp.x = window.scrollX;
    this.vp.y = window.scrollY;
    this.vp.w = window.innerWidth;
    this.vp.h = window.innerHeight;
    this.wake(); // scrolling may unlock tasks
  };

  private onMove = (e: MouseEvent): void => {
    this.cx = e.clientX;
    this.cy = e.clientY;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.stop();
    else if ((e.key === 'm' || e.key === 'M') && !isEditable(e.target)) this.toggleSound();
    else if (e.key === ' ' && !isEditable(e.target) && (e.composedPath()[0] as Element | undefined)?.tagName !== 'BUTTON') {
      e.preventDefault(); // Space toggles the tour (and doesn't scroll the page under the overlay)
      this.setTour(!this.tour);
    }
  };

  private onAction = (a: string, btn: HTMLElement): void => {
    if (a === 'x') return this.stop();
    if (a === 'snd') return this.toggleSound();
    if (a === 're') return this.hooks.replay({ ...this.opts, speed: this.speed, sound: this.audio.enabled, tour: this.tour });
    if (a === 'live') {
      this.audio.sweepDown();
      this.ui.host.style.opacity = '0';
      setTimeout(() => this.stop(), 500);
      return;
    }
    if (a === 'tour') return this.setTour(!this.tour);
    const n = /^s(\d)$/.exec(a);
    if (n && btn) {
      this.speed = +n[1];
      this.ui.setSpeed(a);
    }
  };

  private toggleSound(): void {
    this.audio.enabled = !this.audio.enabled;
    this.ui.setSound(this.audio.enabled);
  }

  /* ---------- blueprints ---------- */

  /** Dashed outlines for the next unlocked blocks: you can see what the swarm is about to build. */
  private updateBlueprints(): void {
    const limit = this.vp.y + this.vp.h;
    const top = this.vp.y - this.vp.h * 0.5;
    for (let i = this.qi; i < this.tasks.length && i < this.qi + 120 && this.blueprints.size < BP_MAX; i++) {
      const t = this.tasks[i];
      if (t.key > limit) break;
      if (t.kind === 'line' || t.taken || t.done || this.blueprints.has(t) || t.b.w * t.b.h < BP_MIN_AREA || t.b.y + t.b.h < top) continue;
      const d = document.createElement('div');
      d.className = 'bp';
      Object.assign(d.style, { left: `${t.b.x}px`, top: `${t.b.y}px`, width: `${t.b.w}px`, height: `${t.b.h}px` });
      this.ui.layer.appendChild(d);
      this.blueprints.set(t, d);
    }
  }

  private dropBlueprint(t: Task): void {
    const d = this.blueprints.get(t);
    if (!d) return;
    d.remove();
    this.blueprints.delete(t);
  }

  /* ---------- section mode ---------- */

  /** The target's box in page coordinates. */
  private sectionBox(): Box {
    const r = this.target!.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  /** Keep the overlay on the section (it can grow or shift while lazy content loads) and the scan range in step with it. */
  private syncRegion(pageW: number, pageH: number): void {
    const b = this.sectionBox();
    this.startY = b.y;
    this.pageH = Math.max(this.pageH, b.y + b.h);
    this.ui.setRegion({ ...b, h: Math.max(b.h, this.pageH - b.y) }, Math.max(this.pageW, pageW), Math.max(pageH, this.pageH));
  }

  /** Scroll the section into view before anything else happens. */
  private revealTarget(): void {
    const b = this.sectionBox();
    const inView = b.y >= this.vp.y && b.y + Math.min(b.h, this.vp.h * 0.5) <= this.vp.y + this.vp.h;
    if (!inView) scrollTo({ left: window.scrollX, top: Math.max(0, b.y - Math.min(80, this.vp.h * 0.1)), behavior: 'instant' });
    this.onView();
  }

  /** Where the cursors gather: the middle of the viewport, or of the visible part of the section. */
  private focus(): { x: number; y: number } {
    const vx = this.vp.x + this.vp.w / 2;
    const vy = this.vp.y + this.vp.h / 2;
    if (!this.target) return { x: vx, y: vy };
    const b = this.sectionBox();
    const top = Math.max(b.y, this.vp.y);
    const bottom = Math.min(b.y + b.h, this.vp.y + this.vp.h);
    const left = Math.max(b.x, this.vp.x);
    const right = Math.min(b.x + b.w, this.vp.x + this.vp.w);
    return { x: right > left ? (left + right) / 2 : b.x + b.w / 2, y: bottom > top ? (top + bottom) / 2 : vy };
  }

  /* ---------- primitives ---------- */

  private tween(dur: number, fn: (e: number, t: number) => void): Promise<void> {
    return new Promise((res) => {
      const t0 = this.now();
      const step = (): void => {
        if (this.dead) return res();
        const t = dur > 0 ? Math.min(1, (this.now() - t0) / dur) : 1;
        fn(ease(t), t);
        if (t < 1) raf(step);
        else res();
      };
      raf(step);
    });
  }

  private pan(c: Cursor): number {
    return clamp(((c.x - this.vp.x) / this.vp.w) * 2 - 1, -1, 1);
  }

  private addCursor(): Cursor {
    const c = new Cursor(this.cursors.length, this.ui.layer, this.colors, this.names, this.opts.showNames === true);
    c.persona = makePersona(this.rand, c.i);
    const f = this.focus();
    c.set(f.x + (this.rand() - 0.5) * 200, f.y + (this.rand() - 0.5) * 200);
    this.cursors.push(c);
    return c;
  }

  private moveTo(c: Cursor, x: number, y: number): Promise<void> {
    const x0 = c.x, y0 = c.y, d = Math.hypot(x - x0, y - y0) || 1;
    const nx = -(y - y0) / d, ny = (x - x0) / d;
    const bend = (this.rand() - 0.5) * Math.min(120, d * 0.25);
    return this.tween(Math.min(1100, 180 + d * 0.9) / (this.rate * c.persona.pace), (e) => {
      const k = Math.sin(Math.PI * e) * bend;
      c.set(x0 + (x - x0) * e + nx * k, y0 + (y - y0) * e + ny * k);
    });
  }

  /** Scan the next band of the page (a few ms). The band size adapts to how long the last scan took. */
  private scanNext(): void {
    const live = pageSize(); // the page may have grown (lazy / infinite content)
    if (this.target) {
      this.syncRegion(live.w, live.h); // the section may have grown too
    } else if (live.h > this.pageH) {
      this.pageH = live.h;
      this.ui.resizeTo(Math.max(this.pageW, live.w), live.h);
    }
    if (this.coveredTo >= this.pageH) {
      this.scanDone = true;
      this.wake();
      return;
    }
    const t0 = performance.now();
    const bottom = Math.min(this.pageH, this.coveredTo + this.bandH);
    const last = bottom >= this.pageH;
    const found = this.scanner.scan(this.coveredTo <= this.startY ? -Infinity : this.coveredTo, last ? Infinity : bottom);
    for (const t of found) this.tasks.push(t);
    this.coveredTo = bottom;
    if (last || this.scanner.capped) this.scanDone = true;
    if (found.length || this.scanDone) this.wake();
    const dt = performance.now() - t0;
    if (dt > 24) this.bandH = Math.max(this.vp.h, this.bandH * 0.6);
    else if (dt < 6) this.bandH = Math.min(this.vp.h * 6, this.bandH * 1.5);
  }

  /** 0..1, never goes backwards; the total is estimated from the part of the page scanned so far. */
  private tick(): void {
    this.built++;
    const n = this.tasks.length;
    const est = this.scanDone ? n : n * ((this.pageH - this.startY) / Math.max(1, this.coveredTo - this.startY));
    const p = this.scanDone && this.built >= n ? 1 : Math.min(0.99, this.built / Math.max(1, est));
    this.prog = Math.max(this.prog, p);
    this.progDirty = true; // the toolbar is repainted once per frame, however many tasks finished in it
    this.opts.onProgress?.(this.prog);
    this.wake(); // a finished task can unlock its children, or end the run
  }

  private dot(x: number, y: number): HTMLDivElement {
    const q = document.createElement('div');
    Object.assign(q.style, {
      position: 'absolute', left: `${x - 3}px`, top: `${y - 3}px`, width: '6px', height: '6px',
      background: '#fff', border: `1px solid ${ACCENT}`, boxSizing: 'border-box', zIndex: '2147482000',
    });
    this.ui.layer.appendChild(q);
    return q;
  }

  /** Figma-style selection box that removes itself. */
  private select(b: Box): void {
    const el = this.selectionBox(b.x, b.y, b.w, b.h);
    setTimeout(() => el.remove(), 260 / this.rate);
  }

  private selectionBox(x: number, y: number, w: number, h: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'sel';
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    el.innerHTML = SELECT_HANDLES;
    this.ui.layer.appendChild(el);
    return el;
  }

  /* ---------- tools ---------- */

  /** Pen tool: anchor point, rubber band to the cursor, anchor point. */
  private async penLine(c: Cursor, t: LineTask): Promise<void> {
    const [x1, y1, x2, y2] = t.pts;
    const g = lineGeom(t);
    await this.moveTo(c, x1, y1);
    if (this.dead) return;
    c.mode('cross');
    this.audio.press(this.pan(c));
    const l = document.createElement('div');
    Object.assign(l.style, {
      position: 'absolute',
      left: `${g.x}px`,
      top: `${g.y}px`,
      width: g.horiz ? '0px' : `${g.w}px`,
      height: g.horiz ? `${g.h}px` : '0px',
      background: ACCENT,
      zIndex: String(t.order),
    });
    this.ui.layer.appendChild(l);
    const a = this.dot(x1, y1);
    await this.tween(Math.min(900, 200 + Math.hypot(x2 - x1, y2 - y1) * 0.5) / this.rate, (e) => {
      if (g.horiz) l.style.width = `${g.w * e}px`;
      else l.style.height = `${g.h * e}px`;
      c.set(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e);
    });
    const z = this.dot(x2, y2);
    this.audio.press(this.pan(c));
    await sleep(120 / this.rate);
    l.style.background = t.color;
    a.remove();
    z.remove();
  }

  /** Pull a red guide out of the ruler to a shared left edge. */
  private async dragGuide(c: Cursor, x: number): Promise<void> {
    const g = document.createElement('div');
    const y = this.vp.y + this.vp.h / 2;
    g.className = 'guide';
    this.ui.layer.appendChild(g);
    this.ui.setRuler(true);
    await this.moveTo(c, this.vp.x + 10, y);
    c.tint(true);
    await this.tween(500 / this.rate, (e) => {
      const gx = this.vp.x + (x - this.vp.x) * e;
      g.style.left = `${gx}px`;
      c.set(gx, y);
      c.say(String(Math.round(gx)), true);
    });
    c.reset();
    this.ui.setRuler(false);
    this.audio.snap(this.pan(c));
    setTimeout(() => g.remove(), 1500 / this.rate);
  }

  /* ---------- task execution ---------- */

  private async doTask(c: Cursor, t: Task): Promise<void> {
    const { b } = t;
    this.busy++;
    this.working.add(c);
    try {
      if (t.kind === 'line') {
        await this.penLine(c, t);
        t.done = true;
        this.tick();
        c.mode('arrow');
        return;
      }

      const k = this.rate * paceFor(c.persona, t.kind); // this cursor's own speed for this kind of work
      let deferred = false; // a colleague finishes this task (carries the frame home) after this cursor has moved on
      if (c.persona.think > 0 && !t.dupFrom && this.boost < HURRY) await sleep(c.persona.think / this.rate);
      if (this.dead) return;
      const m = t.dupFrom;
      const stage = t.kind === 'text' && !m ? this.stagePoint(b) : null; // typed here first, then dragged to b
      const o = stage ?? b;
      await this.moveTo(c, m ? m.x + m.w / 2 : o.x, m ? m.y + m.h / 2 : o.y);
      if (this.dead) return;
      if (m) { this.select(m); await sleep(150 / this.rate); }
      if (t.guideX != null) {
        await this.dragGuide(c, t.guideX);
        await this.moveTo(c, o.x, o.y);
        if (this.dead) return;
      }

      const d = document.createElement('div');
      const origin = m || o;
      Object.assign(d.style, {
        position: 'absolute', left: `${origin.x}px`, top: `${origin.y}px`,
        width: m ? `${m.w}px` : '0px', height: m ? `${m.h}px` : '0px',
        zIndex: String(t.order), boxSizing: 'border-box',
      });
      d.className = t.kind === 'text' ? 'ph txt' : 'ph';
      this.ui.layer.appendChild(d);
      c.mode(m ? 'arrow' : 'cross');
      this.audio.press(this.pan(c));

      if (m) {
        // Alt-drag a copy of the master, red distance label
        c.tint(true);
        const dist = Math.hypot(b.x - m.x, b.y - m.y);
        await this.tween(Math.min(700, 250 + dist) / k, (e) => {
          d.style.left = `${m.x + (b.x - m.x) * e}px`;
          d.style.top = `${m.y + (b.y - m.y) * e}px`;
          c.set(m.x + m.w / 2 + (b.x - m.x) * e, m.y + m.h / 2 + (b.y - m.y) * e);
          c.say(`${Math.round(dist * e)} px`, true);
        });
        d.style.width = `${b.w}px`;
        d.style.height = `${b.h}px`;
        c.tint(false);
      } else {
        const dur = Math.min(900, 200 + Math.hypot(b.w, b.h) * 0.8);
        await this.tween(dur / k, (e) => {
          const w = b.w * e, h = b.h * e;
          d.style.width = `${w}px`;
          d.style.height = `${h}px`;
          c.set(o.x + w, o.y + h);
          c.say(`${Math.round(w)} × ${Math.round(h)}`);
        });
      }
      c.reset();
      if (this.dead) return;

      if (t.kind === 'rect') {
        d.className = 'pop';
        Object.assign(d.style, t.cs);
      } else if (t.kind === 'media') {
        await this.fillMedia(d, t);
      } else {
        await this.typeText(c, d, t, k);
        if (stage && !this.dead) {
          // typed in the wrong place and there is more to build: an idle colleague carries the frame home so this cursor can move on
          const helper = this.hasMoreWork() ? this.recruit(c, stage) : null;
          if (helper) {
            deferred = true;
            this.handOff(c, helper, d, stage, b, t);
          } else {
            await this.dragFrame(c, d, stage, b, k);
          }
        }
      }

      if (deferred) c.mode('arrow');
      else this.finishTask(c, t);
    } finally {
      this.busy--;
      this.working.delete(c);
    }
  }

  /* ---------- teamwork ---------- */

  private labels(): Labels {
    return { ...DEFAULT_LABELS, ...this.opts.labels };
  }

  /** Is there still something for a cursor to go and build after the task it is on? */
  private hasMoreWork(): boolean {
    this.advance();
    return this.qi < this.tasks.length || !this.scanDone;
  }

  /**
   * An idle colleague who feels like helping (each cursor's `helpful` trait decides), preferring the one nearest to `near`.
   * It is taken out of the queue and the mouse-following flock until `release`d.
   */
  private recruit(boss: Cursor, near: { x: number; y: number }, maxDist = 900): Cursor | null {
    if (this.opts.teamwork === false) return null;
    let best: Cursor | null = null;
    let bestD = Infinity;
    for (const x of this.cursors) {
      if (x === boss || this.working.has(x) || this.assisting.has(x)) continue;
      const dist = Math.hypot(x.x - near.x, x.y - near.y);
      if (dist > maxDist || dist >= bestD) continue;
      if (this.rand() > x.persona.helpful) continue; // not in the mood
      best = x;
      bestD = dist;
    }
    if (best) {
      this.assisting.add(best);
      this.working.add(best);
    }
    return best;
  }

  private release(x: Cursor): void {
    this.assisting.delete(x);
    this.working.delete(x);
    x.tint(false);
    x.reset();
    x.mode('arrow');
    this.wake();
  }

  /** The finishing touch of a task: selection frame, note, progress, sparks. Whoever completes it gets the credit. */
  private finishTask(c: Cursor, t: Task): void {
    const { b } = t;
    c.mode('arrow');
    if (b.w * b.h > 1500) this.select(b);
    this.audio.note(b.w * b.h, b.x / (this.pageW || this.vp.w), this.pan(c));
    t.done = true;
    this.tick();
    if (b.w * b.h > 15000) this.fx.burst(b.x + b.w / 2, b.y + b.h / 2, c.col, 10);
  }

  /**
   * `boss` typed this text in the wrong place and has more to build, so `helper` goes over, grabs the finished frame
   * and drags it home while the boss moves on. The task only counts as done when the frame has arrived.
   */
  private handOff(boss: Cursor, helper: Cursor, d: HTMLDivElement, from: { x: number; y: number }, b: Box, t: Task): void {
    this.carrying++;
    helper.say(`${this.labels().helping} ${boss.name}`);
    void (async () => {
      try {
        await this.dragFrame(helper, d, from, b, this.rate * paceFor(helper.persona, 'text'));
        if (!this.dead) this.finishTask(helper, t);
      } catch (err) {
        console.warn('[swarm-cursors] task failed', err);
        if (!t.done) { t.done = true; this.tick(); }
      } finally {
        this.carrying--;
        this.release(helper);
      }
    })();
  }

  /* ---------- staged text ---------- */

  /** Where a text box is typed before it is dragged home: a free spot near its final place, or null to type it in place. */
  private stagePoint(b: Box): { x: number; y: number } | null {
    if (this.opts.stageText === false || this.boost >= HURRY || b.w * b.h < 600) return null; // tiny labels are not worth the detour
    const chance = typeof this.opts.stageText === 'number' ? clamp(this.opts.stageText, 0, 1) : STAGE_CHANCE;
    if (this.rand() >= chance) return null; // most text is simply typed in place
    let x0 = this.vp.x + 6;
    let y0 = this.vp.y + 6;
    let x1 = this.vp.x + this.vp.w - 6;
    let y1 = this.vp.y + this.vp.h - 6;
    if (this.target) {
      const s = this.sectionBox();
      x0 = Math.max(x0, s.x);
      y0 = Math.max(y0, s.y);
      x1 = Math.min(x1, s.x + s.w);
      y1 = Math.min(y1, s.y + s.h);
    }
    const ang = this.rand() * Math.PI * 2;
    const dist = 70 + this.rand() * 90;
    for (const dir of [1, -1]) {
      const x = clamp(b.x + Math.cos(ang) * dist * dir, x0, Math.max(x0, x1 - b.w));
      const y = clamp(b.y + Math.sin(ang) * dist * dir, y0, Math.max(y0, y1 - b.h));
      const d = Math.hypot(x - b.x, y - b.y);
      if (d >= 28 && d <= 320) return { x, y };
    }
    return null;
  }

  /** Select the finished text frame, grab it and drag it onto its exact place (red distance label, snap on arrival). */
  private async dragFrame(c: Cursor, d: HTMLDivElement, from: { x: number; y: number }, b: Box, rate = this.rate): Promise<void> {
    const gx = Math.min(14, b.w / 2);
    const gy = Math.min(10, b.h / 2);
    c.mode('arrow');
    await sleep(120 / this.rate);
    await this.moveTo(c, from.x + gx, from.y + gy);
    if (this.dead) return;
    const sel = this.selectionBox(from.x, from.y, b.w, b.h);
    this.audio.press(this.pan(c));
    c.tint(true);
    const dist = Math.hypot(b.x - from.x, b.y - from.y);
    await this.tween(Math.min(700, 250 + dist) / rate, (e) => {
      const x = from.x + (b.x - from.x) * e;
      const y = from.y + (b.y - from.y) * e;
      d.style.left = sel.style.left = `${x}px`;
      d.style.top = sel.style.top = `${y}px`;
      c.set(x + gx, y + gy);
      c.say(`${Math.round(dist * e)} px`, true);
    });
    d.style.left = `${b.x}px`; // exact, whatever the tween ended on
    d.style.top = `${b.y}px`;
    c.tint(false);
    c.reset();
    this.audio.snap(this.pan(c));
    setTimeout(() => sel.remove(), 260 / this.rate);
  }

  private async fillMedia(d: HTMLDivElement, t: MediaTask, animate = true): Promise<void> {
    d.className = animate ? 'pop' : '';
    d.style.overflow = 'hidden';
    for (const p of RADII) setStyle(d, p, t.cs[p]);
    d.style.boxShadow = t.cs.boxShadow;
    let inner: HTMLElement;
    if (t.tag === 'img') {
      const img = new Image();
      const src = t.node as HTMLImageElement;
      img.src = src.currentSrc || src.src;
      Object.assign(img.style, { width: '100%', height: '100%', display: 'block', objectFit: t.cs.objectFit, objectPosition: t.cs.objectPosition });
      inner = img;
    } else if (t.tag === 'svg') {
      inner = document.createElement('div');
      inner.style.cssText = `width:100%;height:100%;`;
      inner.style.color = t.color;
      const s = t.node.cloneNode(true) as SVGElement;
      sanitize(s);
      s.style.width = '100%';
      s.style.height = '100%';
      inner.appendChild(s);
    } else if (t.src) {
      const img = new Image(); // canvas / video: the still frame we managed to read
      img.src = t.src;
      Object.assign(img.style, { width: '100%', height: '100%', display: 'block', objectFit: t.cs.objectFit || 'cover', objectPosition: t.cs.objectPosition });
      inner = img;
    } else {
      inner = document.createElement('div'); // unreadable canvas / video -> neutral placeholder
      inner.style.cssText = 'width:100%;height:100%;background:#8884';
    }
    d.appendChild(inner);
    if (animate && (t.tag === 'img' || (t.src && t.tag !== 'svg'))) {
      await this.tween(450 / this.rate, (e) => (inner.style.clipPath = `inset(0 0 ${100 - e * 100}% 0)`));
    }
  }

  private async typeText(c: Cursor, d: HTMLDivElement, t: TextTask, rate = this.rate): Promise<void> {
    c.mode('text');
    d.className = 'pop';
    Object.assign(d.style, t.cs);
    d.innerHTML = t.html;
    sanitize(d);
    const nodes: Array<[Text, string]> = [];
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push([n as Text, (n as Text).nodeValue ?? '']);
    const total = nodes.reduce((a, x) => a + x[1].length, 0);
    const full = nodes.map((x) => x[1]).join('');
    nodes.forEach((x) => (x[0].nodeValue = ''));
    const caret = document.createElement('span');
    caret.className = 'caret';
    d.appendChild(caret);
    let lastK = 0; // chars already typed (also the sound cursor)
    let lastFs = 0;
    let shown = -1; // chars currently in the DOM
    const fs = parseFloat(t.cs.fontSize);
    const grow = fs >= 28; // big headings start small and step up
    await this.tween(Math.min(1800, total * 22) / rate, (e) => {
      const k = Math.floor(e * total);
      if (k - lastK >= 2) {
        this.audio.key(this.pan(c), full.slice(lastK, k).includes(' '));
        lastK = k;
      }
      if (grow) {
        const now = Math.round(18 + (fs - 18) * e);
        if (now !== lastFs) { lastFs = now; this.audio.tickUp(e, this.pan(c)); d.style.fontSize = `${now}px`; }
      }
      if (k === shown) return; // nothing new to type this frame: no DOM writes, no layout
      shown = k;
      let left = k;
      let typing: Text | null = null;
      for (const [node, text] of nodes) {
        const m = Math.min(left, text.length);
        node.nodeValue = text.slice(0, m);
        if (m > 0) typing = node;
        left -= m;
      }
      if (typing && caret.previousSibling !== typing) typing.after(caret); // caret follows the typing position
    });
    caret.remove();
    nodes.forEach(([n, text]) => (n.nodeValue = text));
    d.style.fontSize = t.cs.fontSize;
  }

  /* ---------- scheduling ---------- */

  /** Skip the tasks at the front of the queue that somebody already took. */
  private advance(): void {
    while (this.qi < this.tasks.length && this.tasks[this.qi].taken) this.qi++;
  }

  /**
   * Next task for cursor `c`, `'wait'` if nothing it may take is unlocked yet, `null` when the queue is empty.
   * Looks at the first few waiting tasks, so a box that is still being drawn never leaves the other cursors idle
   * (only its own children wait for it), and prefers the one closest to `c`: less travelling, a shorter run.
   * Drawing order does not matter for the picture, every layer has its own z-index.
   */
  private next(c: Cursor): Task | 'wait' | null {
    this.advance();
    if (this.qi >= this.tasks.length) return this.scanDone ? null : 'wait'; // more of the page is still to be scanned
    const limit = this.vp.y + this.vp.h;
    let best: Task | null = null;
    let bestScore = Infinity;
    for (let i = this.qi, seen = 0; i < this.tasks.length && seen < PICK_WINDOW; i++) {
      const t = this.tasks[i];
      if (t.taken) continue;
      if (t.key > limit) break; // drawn only once the viewer has scrolled to it (the queue is sorted: the rest is locked too)
      if (t.parent && !t.parent.done) { seen++; continue; } // children wait for their parent box
      const score = Math.hypot(t.b.x - c.x, t.b.y - c.y) + seen * PICK_PENALTY;
      if (score < bestScore) { best = t; bestScore = score; }
      seen++;
    }
    if (!best) return 'wait';
    best.taken = true;
    this.dropBlueprint(best);
    this.advance();
    return best;
  }

  /** One more cursor joins the running swarm. */
  private spawn(): void {
    const c = this.addCursor();
    this.total++;
    void this.agent(c);
  }

  /** The bigger the page, the more cursors start on it (estimated from what the first scan found). */
  private growForPage(): void {
    if (this.opts.adaptive === false) return;
    const n = this.tasks.length;
    const covered = Math.max(1, this.coveredTo - this.startY);
    const est = this.scanDone ? n : n * ((this.pageH - this.startY) / covered);
    const extra = Math.min(this.maxAgents - this.total, Math.floor(est / TASKS_PER_EXTRA));
    for (let i = 0; i < extra; i++) {
      this.addCursor();
      this.total++;
    }
  }

  /** Catch-up: the more unlocked work is waiting per cursor, the faster everybody moves (never on a small page). */
  private updateBoost(): void {
    let n = 0;
    if (this.opts.adaptive !== false) {
      const limit = this.vp.y + this.vp.h;
      for (let i = this.qi; i < this.tasks.length && n < CATCHUP_SCAN; i++) {
        const t = this.tasks[i];
        if (t.key > limit) break;
        if (!t.taken) n++;
      }
    }
    this.backlog = n / this.total;
    const want = clamp(1 + (this.backlog - CATCHUP_FREE) * CATCHUP_GAIN, 1, MAX_BOOST);
    this.boost += (want - this.boost) * 0.3;
  }

  /** Effective animation speed: the viewer's choice times the catch-up boost. */
  private get rate(): number {
    return this.speed * this.boost;
  }

  /** Sleep until something happens (`wake`) or `ms` pass, whichever is first: waiting cursors react at once instead of polling. */
  private park(ms = PARK_MS): Promise<void> {
    return new Promise((res) => {
      const done = (): void => {
        clearTimeout(timer);
        this.parked.delete(done);
        res();
      };
      const timer = setTimeout(done, ms);
      this.parked.add(done);
    });
  }

  private wake(): void {
    if (!this.parked.size) return;
    for (const f of [...this.parked]) f();
  }

  /**
   * Anything the viewer has scrolled well past without it being built appears at once,
   * so a fast scroll never leaves holes behind. Capped per frame to stay smooth.
   */
  private sweepPast(): void {
    const edge = this.vp.y - this.vp.h * 0.6;
    for (let n = 0; n < 60; n++) {
      this.advance();
      const t = this.tasks[this.qi];
      if (!t || t.key >= edge) break;
      t.taken = true;
      this.qi++;
      this.dropBlueprint(t);
      try {
        this.place(t);
      } catch (err) {
        console.warn('[swarm-cursors] task failed', err);
      }
      t.done = true;
      this.tick();
    }
  }

  /** Final state of a task with no animation. */
  private place(t: Task): void {
    const { b } = t;
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, zIndex: String(t.order), boxSizing: 'border-box' });
    this.ui.layer.appendChild(d);
    if (t.kind === 'line') {
      const g = lineGeom(t);
      Object.assign(d.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px`, background: t.color });
    } else if (t.kind === 'rect') {
      Object.assign(d.style, t.cs);
    } else if (t.kind === 'media') {
      void this.fillMedia(d, t, false);
    } else {
      Object.assign(d.style, t.cs);
      d.innerHTML = t.html;
      sanitize(d);
    }
  }

  /**
   * Cursors with nothing to do follow the real mouse (the same swirl that closes the show).
   * Once in a while, when everything is quiet, they pull off a small easter egg around it.
   */
  private followMouse(now: number): void {
    const idle = this.idleBuf;
    idle.length = 0;
    for (const c of this.cursors) if (!this.working.has(c)) idle.push(c);
    if (!idle.length) return;
    const tx = this.cx + this.vp.x;
    const ty = this.cy + this.vp.y;
    const e = this.egg;
    if (e) {
      const t = (now - e.t0) / 1000;
      if (t > 3.6) {
        this.egg = null;
        this.lastEgg = now;
        for (const c of idle) this.fx.burst(c.x, c.y, c.col, 8);
      } else {
        idle.forEach((c, i) => {
          const [x, y] = eggTarget(e.kind, i, idle.length, tx, ty, t);
          c.vx = (x - c.x) * 0.15;
          c.vy = (y - c.y) * 0.15;
          c.set(c.x + c.vx, c.y + c.vy);
        });
        return;
      }
    }
    flockStep(idle, tx, ty, true);
    const quiet = this.busy === 0 && now - this.lastScroll > 1500 && idle.length >= 3;
    if (this.opts.easterEggs !== false && quiet && now - this.lastEgg > 20000 && this.rand() < 0.0006) {
      this.egg = { kind: EGGS[Math.floor(this.rand() * EGGS.length)], t0: now };
      this.audio.arpeggio();
    }
  }

  private async agent(c: Cursor): Promise<void> {
    while (!this.dead) {
      if (this.assisting.has(c)) {
        await this.park(); // busy helping a colleague
        continue;
      }
      const t = this.next(c);
      if (t === null) break;
      if (t === 'wait') {
        await this.park(); // nothing unlocked: this cursor follows the mouse (followMouse) until something is
        continue;
      }
      try {
        await this.doTask(c, t);
      } catch (err) {
        // one broken element must never stall the whole swarm
        console.warn('[swarm-cursors] task failed', err);
        if (!t.done) { t.done = true; this.tick(); }
        c.mode('arrow');
      }
    }
    while (this.carrying > 0 && !this.dead) await this.park(); // a helper is still carrying this cursor's work
    if (++this.finishedAgents === this.total && !this.dead) this.finish();
  }

  private finish(): void {
    if (this.progDirty) this.flushProgress();
    for (const c of this.cursors) this.fx.burst(c.x, c.y, c.col, 28);
    this.finished = true;
    setTimeout(() => this.ui.fadeProgress(), 700);
    this.audio.chord();
    this.ui.showFinished();
    this.settle('finished');
    this.opts.onFinish?.();
  }
}
