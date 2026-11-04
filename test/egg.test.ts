import { describe, expect, it } from 'vitest';
import { EGGS, eggTarget } from '../src/egg';

describe('easter egg shapes', () => {
  it.each(EGGS)('%s: every cursor gets a finite target near the mouse', (kind) => {
    for (const t of [0, 0.7, 2.4]) {
      for (let i = 0; i < 6; i++) {
        const [x, y] = eggTarget(kind, i, 6, 500, 400, t);
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.hypot(x - 500, y - 400)).toBeLessThan(260);
      }
    }
  });

  it('heart is symmetric left/right and wave keeps the row centred', () => {
    const xs = Array.from({ length: 8 }, (_, i) => eggTarget('heart', i, 8, 0, 0, 0)[0]);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 5);
    const row = Array.from({ length: 5 }, (_, i) => eggTarget('wave', i, 5, 100, 0, 0)[0]);
    expect(row.reduce((a, b) => a + b, 0) / 5).toBeCloseTo(100, 5);
  });
});
