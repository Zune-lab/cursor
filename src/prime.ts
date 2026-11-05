import { sleep } from './util';

/**
 * Scroll through the page once (under the opaque overlay) so lazy images and
 * reveal-on-scroll sections exist before we snapshot, then put the scroll back.
 * `limit` stops the pass at that page height: the rest of a long page wakes up as it is scrolled to.
 * `from` starts it lower down (used when the effect is limited to one section).
 */
export async function primeLazyContent(isDead: () => boolean, maxMs = 2500, limit = Infinity, from = 0): Promise<void> {
  const de = document.documentElement;
  const H = Math.min(de.scrollHeight, limit);
  const vh = window.innerHeight;
  if (typeof window.scrollTo !== 'function' || H <= vh * 1.2) return;
  const x = window.scrollX;
  const y = window.scrollY;
  const t0 = performance.now();
  const step = Math.max(200, vh * 0.9);
  for (let top = Math.max(0, from); top < H - vh; top += step) {
    if (isDead() || performance.now() - t0 > maxMs) break;
    window.scrollTo({ left: x, top, behavior: 'instant' });
    await sleep(50);
  }
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  await sleep(120); // let layout settle before measuring
}
