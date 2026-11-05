import { describe, expect, it } from 'vitest';
import { COLORS, NAMES, palette } from '../src/constants';

describe('palette', () => {
  it('keeps the hand-picked colors first and never repeats one for a big swarm', () => {
    const p = palette(30);
    expect(p).toHaveLength(30);
    expect(p.slice(0, COLORS.length)).toEqual(COLORS);
    expect(new Set(p).size).toBe(30);
  });

  it('is just the base colors for a small swarm', () => {
    expect(palette(4)).toEqual(COLORS);
  });

  it('there is a name for every cursor of a default-sized swarm', () => {
    expect(new Set(NAMES).size).toBeGreaterThanOrEqual(14);
  });
});
