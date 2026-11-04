export interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  set(x: number, y: number): void;
}

/**
 * One boids step: separation + alignment + a swirling pull toward (tx, ty).
 * With `ring` the swarm orbits at ~70px instead of collapsing on the target.
 */
export function flockStep(list: Boid[], tx: number, ty: number, ring = false): void {
  for (const c of list) {
    let sx = 0, sy = 0, ax = 0, ay = 0, n = 0;
    for (const o of list) {
      if (o === c) continue;
      const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy) || 1;
      if (d < 70) { sx += (dx / d) * (70 - d) * 0.02; sy += (dy / d) * (70 - d) * 0.02; }
      if (d < 260) { ax += o.vx; ay += o.vy; n++; }
    }
    if (n) { ax /= n; ay /= n; }
    const ox = tx - c.x, oy = ty - c.y, d = Math.hypot(ox, oy) || 1;
    const pull = (d - (ring ? 70 : 0)) * 0.0015;
    c.vx = (c.vx + (ox / d) * pull + (-oy / d) * 0.12 + sx + (ax - c.vx) * 0.05) * 0.96;
    c.vy = (c.vy + (oy / d) * pull + (ox / d) * 0.12 + sy + (ay - c.vy) * 0.05) * 0.96;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > 7) { c.vx *= 7 / sp; c.vy *= 7 / sp; }
    c.set(c.x + c.vx, c.y + c.vy);
  }
}
