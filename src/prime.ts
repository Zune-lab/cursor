import { sleep } from './util';

/**
 * Scroll through the page once (under the opaque overlay) so lazy images and
 * reveal-on-scroll sections exist before we snapshot, then put the scroll back.
 */
export async function primeLazyContent(isDead: () => boolean, maxMs = 2500): Promise<void> {
  const de = document.documentElement;
  const H = de.scrollHeight;
  const vh = window.innerHeight;
  if (typeof window.scrollTo !== 'function' || H <= vh * 1.2) return;
  const x = window.scrollX;
  const y = window.scrollY;
  const t0 = performance.now();
  const step = Math.max(200, vh * 0.9);
  for (let top = 0; top < H - vh; top += step) {
    if (isDead() || performance.now() - t0 > maxMs) break;
    window.scrollTo({ left: x, top, behavior: 'instant' });
    await sleep(50);
  }
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  await sleep(120); // let layout settle before measuring
}
