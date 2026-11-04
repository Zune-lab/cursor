/** Easter eggs: shapes the idle swarm sometimes forms around the real mouse. */
export type EggKind = 'heart' | 'ring' | 'wave';

export const EGGS: readonly EggKind[] = ['heart', 'ring', 'wave'];

/**
 * Where cursor `i` of `n` should be, `t` seconds into the egg. Pure, so it is easy to test:
 * a heart outline, a fast ring, or a row that does the wave.
 */
export function eggTarget(kind: EggKind, i: number, n: number, cx: number, cy: number, t: number): [number, number] {
  const u = n > 1 ? i / n : 0;
  if (kind === 'heart') {
    const a = u * Math.PI * 2;
    const k = 5.2 + Math.sin(t * 6) * 0.35; // beating
    return [cx + k * 16 * Math.pow(Math.sin(a), 3), cy - k * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) + 10];
  }
  if (kind === 'ring') {
    const a = u * Math.PI * 2 + t * 5;
    return [cx + Math.cos(a) * 80, cy + Math.sin(a) * 80];
  }
  const gap = 46;
  return [cx + (i - (n - 1) / 2) * gap, cy + Math.sin(t * 7 - i * 0.9) * 22];
}
