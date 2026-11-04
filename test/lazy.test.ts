import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { start, stop } from '../src/index';

let scrollY = 0;
beforeEach(() => {
  scrollY = 0;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y - scrollY, width: w, height: h, right: x + w, bottom: y - scrollY + h, toJSON() {} } as DOMRect;
  };
  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 7400, configurable: true });
  window.scrollBy = ((o: ScrollToOptions) => {
    scrollY += o.top ?? 0;
    window.dispatchEvent(new Event('scroll'));
  }) as typeof window.scrollBy;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});
afterEach(() => {
  stop();
  document.body.innerHTML = '';
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('long page', () => {
  it('scans lazily while the tour scrolls, rebuilds the very bottom, and progress never goes back', async () => {
    document.body.innerHTML = Array.from({ length: 12 }, (_, i) =>
      `<section data-box="0,${i * 600},400,200" style="background:#eee"><h2 data-box="10,${i * 600 + 10},300,30">Part ${i}</h2></section>`).join('');
    const warn = vi.spyOn(console, 'warn');
    const progress: number[] = [];
    const h = start({ agents: 4, speed: 80, tour: true, sound: false, fx: false, prime: false, onProgress: (p) => progress.push(p) });
    await expect(h.done).resolves.toBe('finished');
    expect(warn).not.toHaveBeenCalled();
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
    expect(progress.filter((p) => p < 1).every((p) => p <= 0.99)).toBe(true);
    const root = document.querySelector('[data-swarm]')!.shadowRoot!;
    expect(root.textContent).toContain('Part 0');
    expect(root.textContent).toContain('Part 11'); // the far end of the page was not cut off
    h.stop();
  }, 60000);
});
