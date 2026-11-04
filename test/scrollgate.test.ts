import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { start, stop } from '../src/index';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3200, configurable: true });
});
afterEach(() => { stop(); document.body.innerHTML = ''; });

describe('scroll-driven drawing', () => {
  it('draws only what the viewer has scrolled to', async () => {
    document.body.innerHTML = `
      <div data-box="40,40,300,100" style="background:#eee"><p data-box="50,50,200,20">Near</p></div>
      <div data-box="40,3000,300,100" style="background:#eee"><p data-box="50,3010,200,20">Far</p></div>`;
    const warn = vi.spyOn(console, 'warn');
    const h = start({ agents: 2, speed: 40, sound: false, fx: false, prime: false, easterEggs: false });
    const root = () => document.querySelector('[data-swarm]')!.shadowRoot!;
    for (let i = 0; i < 150 && !root().textContent!.includes('Near'); i++) await new Promise((r) => setTimeout(r, 100));
    expect(root().textContent).toContain('Near');
    await new Promise((r) => setTimeout(r, 2500));
    expect(root().textContent).not.toContain('Far'); // not scrolled to: not drawn
    expect(warn).not.toHaveBeenCalled();
    h.stop();
  }, 40000);

  it('what the viewer already scrolled past appears at once, with no cursor needed', async () => {
    Object.defineProperty(window, 'scrollY', { value: 2500, configurable: true });
    const base = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) { // like a real browser: relative to the viewport
      const r = base.call(this);
      return { ...r, top: r.top - 2500, bottom: r.bottom - 2500, y: r.y - 2500, toJSON() {} } as DOMRect;
    };
    try {
      document.body.innerHTML = `<div data-box="40,40,300,100" style="background:#eee"><p data-box="50,50,200,20">Way above</p></div>`;
      const h = start({ agents: 1, speed: 1, sound: false, fx: false, prime: false, easterEggs: false });
      const root = () => document.querySelector('[data-swarm]')!.shadowRoot!;
      // speed 1: a cursor would need seconds to travel and type this; the sweep places it within a few frames
      for (let i = 0; i < 40 && !root().textContent!.includes('Way above'); i++) await new Promise((r) => setTimeout(r, 100));
      expect(root().textContent).toContain('Way above');
      h.stop();
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
  }, 20000);
});
