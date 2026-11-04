import { AudioEngine } from './audio';
import { ACCENT, COLORS, DEFAULT_MAX_TASKS, NAMES, RADII } from './constants';
import { Cursor } from './cursor';
import { EGGS, eggTarget, type EggKind } from './egg';
import { flockStep } from './flock';
import { FxLayer } from './fx';
import { primeLazyContent } from './prime';
import { createRng } from './rng';
import { Scanner } from './snapshot';
import type { Box, LineTask, MediaTask, SwarmOptions, SwarmOutcome, Task, TextTask } from './types';
import { DEFAULT_LABELS, Ui } from './ui';
import { clamp, ease, isEditable, isTransparent, pageSize, raf, sanitize, setStyle, sleep } from './util';

/** The page is scanned this many viewport heights below the viewer (a task unlocks at 1.4, so it always exists in time). */
const LOOKAHEAD = 2.2;
const SELECT_HANDLES = [[0, 0], [50, 0], [100, 0], [0, 50], [100, 50], [0, 100], [50, 100], [100, 100]]
  .map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`)
  .join('');
const nextFrame = (): Promise<void> => new Promise((r) => raf(() => r()));

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
  private pageH = 0;
  private scanner: Scanner;
  private coveredTo = 0; // page height scanned so far
  private scanDone = false;
  private bandH = 0;
  private prog = 0;
  private readonly working = new Set<Cursor>(); // cursors in the middle of a task; the rest follow the real mouse
  private lastScroll = 0;
  private lastEgg = 0;
  private egg: { kind: EggKind; t0: number } | null = null;
  private dead = false;
  private finished = false;
  private speed: number;
  private readonly nAgents: number;
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
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
    this.colors = opts.colors?.length ? opts.colors : COLORS;
    this.names = opts.names?.length ? opts.names : NAMES;
    this.scanner = new Scanner({ maxTasks: opts.maxTasks ?? DEFAULT_MAX_TASKS, exclude: opts.exclude });
    this.bandH = Math.max(1200, this.vp.h * 1.5);

    const de = document.documentElement;
    const bg = [getComputedStyle(document.body).backgroundColor, getComputedStyle(de).backgroundColor].find((c) => !isTransparent(c)) || '#fff';
    const size = pageSize();
    this.ui = new Ui(bg, size.w, size.h, { ...DEFAULT_LABELS, ...opts.labels });
    this.audio = new AudioEngine(opts.sound !== false, (locked) => this.ui.setSoundLocked(locked));
    this.ui.setSound(this.audio.enabled);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = new FxLayer(this.ui.canvas, opts.fx ?? !reduced, () => !this.dead, this.rand);

    de.appendChild(this.ui.host);
    raf(() => (this.ui.host.style.opacity = '1'));

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
    const more = this.qi < this.tasks.length || !this.scanDone;
    if (this.tour && more) {
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
      const v = Math.abs(this.vp.y - this.lastY) * 10; // px/s
      this.lastY = this.vp.y;
      if (v > 800 && this.spawned < 6 && !this.finished && !this.orbiting && more) {
        const c = this.addCursor();
        this.total++;
        this.spawned++;
        void this.agent(c);
      }
    }
    raf(this.pump);
  };

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
      flockStep(this.cursors, this.vp.x + this.vp.w / 2, this.vp.y + this.vp.h / 2, true);
      raf(orbit);
    };
    raf(orbit);

    const labels = { ...DEFAULT_LABELS, ...this.opts.labels };
    this.ui.setStatus(labels.preparing);
    await Promise.all([
      this.opts.prime === false ? Promise.resolve() : primeLazyContent(() => this.dead, 2500, this.vp.y + this.vp.h * (LOOKAHEAD + 1)),
      sleep(900 / this.speed),
    ]);
    if (this.dead) return;

    this.ui.resizeTo(0, 0); // measure the page itself, not our own overlay
    const size = pageSize();
    this.ui.resizeTo(size.w, size.h);
    this.pageW = size.w;
    this.pageH = size.h;
    // scan down to just below the viewer, a band per frame, so a huge page never freezes the tab
    while (!this.scanDone && this.coveredTo < this.vp.y + this.vp.h * LOOKAHEAD) {
      this.scanNext();
      if (!this.scanDone && this.coveredTo < this.vp.y + this.vp.h * LOOKAHEAD) await nextFrame();
      if (this.dead) return;
    }
    this.ui.setStatus(labels.ready);
    this.orbiting = false;
    this.ui.hideFavicon();
    this.audio.arpeggio();
    const initial = [...this.cursors];
    initial.forEach((c, i) => setTimeout(() => void this.agent(c), i * 120));
  }

  stop(): void {
    if (this.dead) return;
    this.dead = true;
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

  private onView = (): void => {
    this.lastScroll = performance.now();
    this.vp.x = window.scrollX;
    this.vp.y = window.scrollY;
    this.vp.w = window.innerWidth;
    this.vp.h = window.innerHeight;
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

  /* ---------- primitives ---------- */

  private tween(dur: number, fn: (e: number, t: number) => void): Promise<void> {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now: number): void => {
        if (this.dead) return res();
        const t = dur > 0 ? Math.min(1, (now - t0) / dur) : 1;
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
    c.set(
      this.vp.x + this.vp.w / 2 + (this.rand() - 0.5) * 200,
      this.vp.y + this.vp.h / 2 + (this.rand() - 0.5) * 200,
    );
    this.cursors.push(c);
    return c;
  }

  private moveTo(c: Cursor, x: number, y: number): Promise<void> {
    const x0 = c.x, y0 = c.y, d = Math.hypot(x - x0, y - y0) || 1;
    const nx = -(y - y0) / d, ny = (x - x0) / d;
    const bend = (this.rand() - 0.5) * Math.min(120, d * 0.25);
    return this.tween(Math.min(1100, 180 + d * 0.9) / this.speed, (e) => {
      const k = Math.sin(Math.PI * e) * bend;
      c.set(x0 + (x - x0) * e + nx * k, y0 + (y - y0) * e + ny * k);
    });
  }

  /** Scan the next band of the page (a few ms). The band size adapts to how long the last scan took. */
  private scanNext(): void {
    const live = pageSize(); // the page may have grown (lazy / infinite content)
    if (live.h > this.pageH) {
      this.pageH = live.h;
      this.ui.resizeTo(Math.max(this.pageW, live.w), live.h);
    }
    if (this.coveredTo >= this.pageH) {
      this.scanDone = true;
      return;
    }
    const t0 = performance.now();
    const bottom = Math.min(this.pageH, this.coveredTo + this.bandH);
    const last = bottom >= this.pageH;
    const found = this.scanner.scan(this.coveredTo === 0 ? -Infinity : this.coveredTo, last ? Infinity : bottom);
    for (const t of found) this.tasks.push(t);
    this.coveredTo = bottom;
    if (last || this.scanner.capped) this.scanDone = true;
    const dt = performance.now() - t0;
    if (dt > 24) this.bandH = Math.max(this.vp.h, this.bandH * 0.6);
    else if (dt < 6) this.bandH = Math.min(this.vp.h * 6, this.bandH * 1.5);
  }

  /** 0..1, never goes backwards; the total is estimated from the part of the page scanned so far. */
  private tick(): void {
    this.built++;
    const n = this.tasks.length;
    const est = this.scanDone ? n : n * (this.pageH / Math.max(1, this.coveredTo));
    const p = this.scanDone && this.built >= n ? 1 : Math.min(0.99, this.built / Math.max(1, est));
    this.prog = Math.max(this.prog, p);
    this.ui.setProgress(this.prog);
    this.opts.onProgress?.(this.prog);
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
    const el = document.createElement('div');
    el.className = 'sel';
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    el.innerHTML = SELECT_HANDLES;
    this.ui.layer.appendChild(el);
    setTimeout(() => el.remove(), 260 / this.speed);
  }

  /* ---------- tools ---------- */

  /** Pen tool: anchor point, rubber band to the cursor, anchor point. */
  private async penLine(c: Cursor, t: LineTask): Promise<void> {
    const [x1, y1, x2, y2] = t.pts;
    const th = Math.max(1, t.lw);
    const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    await this.moveTo(c, x1, y1);
    if (this.dead) return;
    c.mode('cross');
    this.audio.press(this.pan(c));
    const l = document.createElement('div');
    Object.assign(l.style, {
      position: 'absolute',
      left: `${Math.min(x1, x2) - (horiz ? 0 : th / 2)}px`,
      top: `${Math.min(y1, y2) - (horiz ? th / 2 : 0)}px`,
      width: horiz ? '0px' : `${th}px`,
      height: horiz ? `${th}px` : '0px',
      background: ACCENT,
      zIndex: String(t.order),
    });
    this.ui.layer.appendChild(l);
    const a = this.dot(x1, y1);
    await this.tween(Math.min(900, 200 + Math.hypot(x2 - x1, y2 - y1) * 0.5) / this.speed, (e) => {
      if (horiz) l.style.width = `${Math.abs(x2 - x1) * e}px`;
      else l.style.height = `${Math.abs(y2 - y1) * e}px`;
      c.set(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e);
    });
    const z = this.dot(x2, y2);
    this.audio.press(this.pan(c));
    await sleep(120 / this.speed);
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
    await this.tween(500 / this.speed, (e) => {
      const gx = this.vp.x + (x - this.vp.x) * e;
      g.style.left = `${gx}px`;
      c.set(gx, y);
      c.say(String(Math.round(gx)), true);
    });
    c.reset();
    this.ui.setRuler(false);
    this.audio.snap(this.pan(c));
    setTimeout(() => g.remove(), 1500 / this.speed);
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

      const m = t.dupFrom;
      await this.moveTo(c, m ? m.x + m.w / 2 : b.x, m ? m.y + m.h / 2 : b.y);
      if (this.dead) return;
      if (m) { this.select(m); await sleep(150 / this.speed); }
      if (t.guideX != null) {
        await this.dragGuide(c, t.guideX);
        await this.moveTo(c, b.x, b.y);
        if (this.dead) return;
      }

      const d = document.createElement('div');
      const origin = m || b;
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
        await this.tween(Math.min(700, 250 + dist) / this.speed, (e) => {
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
        await this.tween(dur / this.speed, (e) => {
          const w = b.w * e, h = b.h * e;
          d.style.width = `${w}px`;
          d.style.height = `${h}px`;
          c.set(b.x + w, b.y + h);
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
        await this.typeText(c, d, t);
      }

      c.mode('arrow');
      if (b.w * b.h > 1500) this.select(b);
      this.audio.note(b.w * b.h, b.x / (this.pageW || this.vp.w), this.pan(c));
      t.done = true;
      this.tick();
      if (b.w * b.h > 15000) this.fx.burst(b.x + b.w / 2, b.y + b.h / 2, c.col, 10);
    } finally {
      this.busy--;
      this.working.delete(c);
    }
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
      await this.tween(450 / this.speed, (e) => (inner.style.clipPath = `inset(0 0 ${100 - e * 100}% 0)`));
    }
  }

  private async typeText(c: Cursor, d: HTMLDivElement, t: TextTask): Promise<void> {
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
    await this.tween(Math.min(1800, total * 22) / this.speed, (e) => {
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

  /** Next task, `'wait'` if nothing is unlocked yet, `null` when the queue is empty. */
  private next(): Task | 'wait' | null {
    if (this.qi >= this.tasks.length) return this.scanDone ? null : 'wait'; // more of the page is still to be scanned
    const t = this.tasks[this.qi];
    if (t.key > this.vp.y + this.vp.h) return 'wait'; // drawn only once the viewer has scrolled to it
    if (t.parent && !t.parent.done) return 'wait'; // children wait for their parent box
    this.qi++;
    return t;
  }

  /**
   * Anything the viewer has scrolled well past without it being built appears at once,
   * so a fast scroll never leaves holes behind. Capped per frame to stay smooth.
   */
  private sweepPast(): void {
    const edge = this.vp.y - this.vp.h * 0.6;
    for (let n = 0; n < 60 && this.qi < this.tasks.length; n++) {
      const t = this.tasks[this.qi];
      if (t.key >= edge) break;
      this.qi++;
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
      const th = Math.max(1, t.lw);
      const horiz = Math.abs(t.pts[2] - t.pts[0]) >= Math.abs(t.pts[3] - t.pts[1]);
      Object.assign(d.style, {
        left: `${Math.min(t.pts[0], t.pts[2]) - (horiz ? 0 : th / 2)}px`, top: `${Math.min(t.pts[1], t.pts[3]) - (horiz ? th / 2 : 0)}px`,
        width: horiz ? `${Math.abs(t.pts[2] - t.pts[0])}px` : `${th}px`, height: horiz ? `${th}px` : `${Math.abs(t.pts[3] - t.pts[1])}px`, background: t.color,
      });
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
    const idle = this.cursors.filter((c) => !this.working.has(c));
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
      const t = this.next();
      if (t === null) break;
      if (t === 'wait') {
        await sleep(60); // nothing unlocked: this cursor follows the mouse (followMouse) until something is
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
    if (++this.finishedAgents === this.total && !this.dead) this.finish();
  }

  private finish(): void {
    for (const c of this.cursors) this.fx.burst(c.x, c.y, c.col, 28);
    this.finished = true;
    setTimeout(() => this.ui.fadeProgress(), 700);
    this.audio.chord();
    this.ui.showFinished();
    this.settle('finished');
    this.opts.onFinish?.();
  }
}
