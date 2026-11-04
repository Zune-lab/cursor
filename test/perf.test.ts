import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '../src/snapshot';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

/** Guards the snapshot against re-reading layout/style for the same element over and over. */
describe('snapshot cost', () => {
  it('reads style and geometry about once per element', () => {
    const cards = Array.from({ length: 60 }, (_, i) =>
      `<div class="card" data-box="${(i % 3) * 300},${i * 40},280,120" style="background:#fff;border:1px solid #ddd">
         <h3 data-box="10,${i * 40 + 10},200,24">Title ${i}</h3><p data-box="10,${i * 40 + 40},200,20">Body ${i}</p></div>`).join('');
    document.body.innerHTML = cards;
    const total = document.body.querySelectorAll('*').length + 1;
    const gcs = vi.spyOn(window, 'getComputedStyle');
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    snapshot();
    console.log(`elements=${total} getComputedStyle=${gcs.mock.calls.length} getBoundingClientRect=${rect.mock.calls.length}`);
    expect(gcs.mock.calls.length).toBeLessThanOrEqual(total);
    expect(rect.mock.calls.length).toBeLessThanOrEqual(total);
  });
});
