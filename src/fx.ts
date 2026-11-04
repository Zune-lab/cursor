import { raf } from './util';

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; col: string; s: number;
}

/** Viewport-sized canvas for spark bursts. */
export class FxLayer {
  private readonly g: CanvasRenderingContext2D | null;
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);
  private readonly parts: Particle[] = [];
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly enabled: boolean,
    private readonly alive: () => boolean,
    private readonly rand: () => number = Math.random,
  ) {
    this.g = enabled ? canvas.getContext('2d') : null;
    this.fit();
    window.addEventListener('resize', this.fit);
    if (!this.g) canvas.style.display = 'none';
  }

  readonly fit = (): void => {
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
  };

  burst(x: number, y: number, col: string, n: number): void {
    if (!this.g) return;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283, v = 2 + this.rand() * 5;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, col, s: 2 + this.rand() * 3 });
    }
    if (!this.running) { // the loop only runs while sparks are alive
      this.running = true;
      raf(this.frame);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.fit);
  }

  private frame = (): void => {
    const g = this.g;
    if (!g || !this.alive()) { this.running = false; return; }
    const { scrollX, scrollY, innerWidth, innerHeight } = window;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.x += q.vx; q.y += q.vy; q.vy += 0.25; q.vx *= 0.98; q.life -= 0.02;
      if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      g.globalAlpha = q.life;
      g.fillStyle = q.col;
      g.fillRect(q.x - scrollX, q.y - scrollY, q.s, q.s);
    }
    g.globalAlpha = 1;
    if (this.parts.length) raf(this.frame);
    else this.running = false; // last spark gone: the canvas was cleared above, stop the loop
  };
}
