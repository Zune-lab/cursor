import { describe, expect, it } from 'vitest';
import { makePersona, paceFor } from '../src/persona';
import { createRng } from '../src/rng';

describe('persona', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([0, 1, 2, 3].map((i) => makePersona(a, i))).toEqual([0, 1, 2, 3].map((i) => makePersona(b, i)));
  });

  it('stays inside its documented ranges and differs between cursors', () => {
    const r = createRng(1);
    const ps = Array.from({ length: 12 }, (_, i) => makePersona(r, i));
    for (const p of ps) {
      expect(p.pace).toBeGreaterThanOrEqual(0.8);
      expect(p.pace).toBeLessThanOrEqual(1.3);
      expect(p.helpful).toBeGreaterThanOrEqual(0.35);
      expect(p.helpful).toBeLessThanOrEqual(1);
      expect(p.think).toBeGreaterThanOrEqual(0);
      expect(p.think).toBeLessThan(200);
    }
    expect(new Set(ps.map((p) => p.pace)).size).toBe(12);
    expect(new Set(ps.slice(0, 4).map((p) => p.likes)).size).toBe(4); // the first four cover every kind of work
  });

  it('is quicker at the work it likes', () => {
    const p = makePersona(createRng(3), 0); // likes text
    expect(paceFor(p, 'text')).toBeCloseTo(p.pace * 1.3);
    expect(paceFor(p, 'rect')).toBeCloseTo(p.pace);
  });
});
