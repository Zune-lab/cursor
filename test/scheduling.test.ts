import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { start, stop } from '../src/index';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { stop(); document.body.innerHTML = ''; });

/** Run a page to the end and report how long it took. */
const timeRun = async (opts: Record<string, unknown>): Promise<number> => {
  const t0 = performance.now();
  const h = start({ agents: 2, speed: 8, seed: 3, sound: false, fx: false, prime: false, easterEggs: false, ...opts });
  await expect(h.done).resolves.toBe('finished');
  const ms = performance.now() - t0;
  h.stop();
  return ms;
};

describe('scheduling', () => {
  it('a box still being drawn does not leave the other cursors idle', async () => {
    // one big section with a child, plus independent boxes after it: the free cursor takes those instead of waiting
    document.body.innerHTML =
      `<section data-box="0,0,600,300" style="background:#eee"><p data-box="20,20,300,40" style="background:#ddd"></p></section>` +
      Array.from({ length: 6 }, (_, i) => `<div data-box="${20 + i * 90},320,80,80" style="background:#fc0"></div>`).join('');
    const root = (): ShadowRoot => document.querySelector('[data-swarm]')!.shadowRoot!;
    const h = start({ agents: 2, speed: 8, seed: 3, sound: false, fx: false, prime: false, easterEggs: false });
    // while the section (cursor 1) is still being dragged out, the other cursor is already building the independent boxes
    let early = 0;
    for (let i = 0; i < 400 && early === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const n = root().querySelectorAll('.ph, .pop').length;
      if (n >= 2) early = n;
    }
    expect(early).toBeGreaterThanOrEqual(2);
    await expect(h.done).resolves.toBe('finished');
    expect(root().querySelectorAll('.pop').length).toBeGreaterThanOrEqual(8);
    h.stop();
  }, 30000);

  it('a dense page runs faster with the catch-up boost than without it', async () => {
    document.body.innerHTML = Array.from({ length: 90 }, (_, i) => `<div data-box="${20 + (i % 9) * 60},${20 + Math.floor(i / 9) * 60},50,50" style="background:#fc0"></div>`).join('');
    const slow = await timeRun({ adaptive: false });
    document.body.innerHTML = Array.from({ length: 90 }, (_, i) => `<div data-box="${20 + (i % 9) * 60},${20 + Math.floor(i / 9) * 60},50,50" style="background:#fc0"></div>`).join('');
    const fast = await timeRun({ adaptive: true });
    expect(fast).toBeLessThan(slow * 0.85);
  }, 60000);

  it('a small page is not sped up', async () => {
    document.body.innerHTML = Array.from({ length: 4 }, (_, i) => `<div data-box="${20 + i * 60},20,50,50" style="background:#fc0"></div>`).join('');
    const a = await timeRun({ adaptive: false });
    document.body.innerHTML = Array.from({ length: 4 }, (_, i) => `<div data-box="${20 + i * 60},20,50,50" style="background:#fc0"></div>`).join('');
    const b = await timeRun({ adaptive: true });
    expect(Math.abs(a - b)).toBeLessThan(Math.max(400, a * 0.4)); // same pace (generous: timers in jsdom jitter)
  }, 30000);

  it('stop() ends parked cursors at once (no timers left behind)', async () => {
    document.body.innerHTML = `<div data-box="0,3000,100,100" style="background:#fc0"></div>`; // locked until scrolled to: the cursors wait
    const h = start({ agents: 3, speed: 8, sound: false, fx: false, prime: false, easterEggs: false });
    await new Promise((r) => setTimeout(r, 300));
    h.stop();
    await expect(h.done).resolves.toBe('stopped');
  });
});

describe('swarm size follows the page', () => {
  const grid = (n: number): string =>
    Array.from({ length: n }, (_, i) => `<div data-box="${10 + (i % 30) * 30},${10 + Math.floor(i / 30) * 30},24,24" style="background:#fc0"></div>`).join('');
  /** Run to the end and report how many cursors took part. */
  const cursorsAfter = async (n: number, opts: Record<string, unknown>): Promise<number> => {
    document.body.innerHTML = grid(n);
    const h = start({ speed: 40, seed: 3, sound: false, fx: false, prime: false, easterEggs: false, ...opts });
    await expect(h.done).resolves.toBe('finished');
    const count = document.querySelector('[data-swarm]')!.shadowRoot!.querySelectorAll('.cur').length;
    h.stop();
    return count;
  };

  it('a big page brings in more cursors than were asked for, up to maxAgents', async () => {
    const n = await cursorsAfter(300, { agents: 2 });
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThanOrEqual(14);
  }, 60000);

  it('maxAgents caps the swarm', async () => {
    expect(await cursorsAfter(300, { agents: 2, maxAgents: 3 })).toBeLessThanOrEqual(3);
  }, 60000);

  it('adaptive: false keeps exactly the cursors you asked for', async () => {
    expect(await cursorsAfter(100, { agents: 2, adaptive: false })).toBe(2);
  }, 60000);

  it('a small page keeps the default number of cursors', async () => {
    expect(await cursorsAfter(4, {})).toBe(6);
  }, 30000);
});
