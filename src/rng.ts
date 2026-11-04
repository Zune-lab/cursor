/** Mulberry32: tiny seeded PRNG. Without a seed it is just Math.random. */
export function createRng(seed?: number): () => number {
  if (seed === undefined || !Number.isFinite(seed)) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
