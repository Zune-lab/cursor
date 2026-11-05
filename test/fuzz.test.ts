import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/rng';
import { start, stop } from '../src/index';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { stop(); document.body.innerHTML = ''; });

/** A random tree of nested boxes, text, lines and images, all inside the first screen. */
function randomPage(seed: number): { html: string; words: string[] } {
  const r = createRng(seed);
  const words: string[] = [];
  let n = 0;
  const node = (x: number, y: number, w: number, h: number, depth: number): string => {
    const box = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`;
    const roll = r();
    if (depth >= 3 || w < 90 || h < 50 || roll < 0.3) {
      const k = r();
      if (k < 0.5) {
        const word = `w${seed}x${n++}`;
        words.push(word);
        return `<p data-box="${box}">${word} some text to type</p>`;
      }
      if (k < 0.75) return `<div data-box="${box}" style="background:#fc0"></div>`;
      if (k < 0.9) return `<div data-box="${box}" style="border-top:2px solid #999"></div>`;
      return `<img alt="" data-box="${box}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`;
    }
    const cols = 1 + Math.floor(r() * 3);
    const kids = Array.from({ length: cols }, (_, i) => node(x + 6 + (i * (w - 12)) / cols, y + 6, (w - 12) / cols - 4, h - 12, depth + 1)).join('');
    return `<section data-box="${box}" style="background:#eee;border:1px solid #999">${kids}</section>`;
  };
  const html = Array.from({ length: 4 }, (_, i) => node(10, 10 + i * 170, 760, 160, 0)).join('');
  return { html, words };
}

describe('random pages', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: always finishes, builds every text, leaves nothing half-done`, async () => {
      const { html, words } = randomPage(seed);
      document.body.innerHTML = html;
      const warn = vi.spyOn(console, 'warn');
      const h = start({ agents: 2 + (seed % 4), speed: 60, seed, stageText: seed % 2 ? 1 : 0.3, sound: false, fx: false, prime: false, easterEggs: false });
      const finished = await Promise.race([h.done, new Promise((r) => setTimeout(() => r('timeout'), 20000))]);
      expect(finished).toBe('finished');
      await new Promise((r) => setTimeout(r, 80)); // the very last selection frame removes itself a few ms after the run ends
      const root = document.querySelector('[data-swarm]')!.shadowRoot!;
      for (const w of words) expect(root.textContent).toContain(w);
      expect(root.querySelector('.sel')).toBeNull();
      expect(root.querySelector('.caret')).toBeNull();
      expect(warn).not.toHaveBeenCalled();
      h.stop();
    }, 30000);
  }
});
