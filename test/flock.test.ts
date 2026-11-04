import { describe, expect, it } from 'vitest';
import { flockStep, type Boid } from '../src/flock';

const boid = (x: number, y: number): Boid => ({ x, y, vx: 0, vy: 0, set(nx, ny) { this.x = nx; this.y = ny; } });

describe('flockStep', () => {
  it('pushes two overlapping boids apart', () => {
    const a = boid(100, 100), b = boid(104, 100);
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    for (let i = 0; i < 30; i++) flockStep([a, b], 100, 100);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(d0);
  });

  it('never exceeds the speed cap', () => {
    const list = Array.from({ length: 8 }, (_, i) => boid(i * 3, 0));
    for (let i = 0; i < 200; i++) {
      flockStep(list, 5000, 5000);
      for (const c of list) expect(Math.hypot(c.vx, c.vy)).toBeLessThanOrEqual(7 + 1e-9);
    }
  });

  it('pulls a lone boid toward the target', () => {
    const a = boid(0, 0);
    for (let i = 0; i < 400; i++) flockStep([a], 600, 0);
    expect(Math.hypot(a.x - 600, a.y)).toBeLessThan(600);
  });

  it('survives an empty list and a boid sitting on the target', () => {
    expect(() => flockStep([], 0, 0)).not.toThrow();
    const a = boid(10, 10);
    flockStep([a], 10, 10, true);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
  });
});
