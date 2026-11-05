import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { start, stop } from '../src/index';
import { optionsFromScript } from '../src/global';
import { Scanner } from '../src/snapshot';

/** jsdom has no layout: read boxes from a data-box="x,y,w,h" attribute instead. */
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});
afterEach(() => {
  stop();
  document.body.innerHTML = '';
});

const page = `
  <header data-box="0,0,800,80" style="background:#111"><h1 data-box="20,20,200,30">Site</h1></header>
  <section id="hero" data-box="0,600,800,400" style="background:#fafafa">
    <h2 data-box="20,620,300,40">Hero</h2>
    <p data-box="20,680,300,20">Only this section</p>
  </section>
  <footer data-box="0,1200,800,100" style="background:#222"><p data-box="20,1220,200,20">Footer</p></footer>`;

describe('Scanner root', () => {
  it('only rebuilds the root subtree', () => {
    document.body.innerHTML = page;
    const hero = document.getElementById('hero')!;
    const out = new Scanner({ root: hero }).scan();
    expect(out.map((t) => t.kind)).toEqual(['rect', 'text', 'text']); // the section box itself, then its two texts
    expect(out.every((t) => t.b.y >= 600 && t.b.y < 1000)).toBe(true);
  });

  it('without a root it still takes the whole page', () => {
    document.body.innerHTML = page;
    expect(new Scanner().scan().length).toBeGreaterThan(3);
  });
});

describe('target option', () => {
  const host = () => document.querySelector('[data-swarm]') as HTMLElement | null;
  const quiet = { sound: false, fx: false, prime: false } as const;

  it('covers only the section, not the whole page', () => {
    document.body.innerHTML = page;
    start({ ...quiet, target: '#hero' });
    const h = host()!;
    expect(h.style.left).toBe('0px');
    expect(h.style.top).toBe('600px');
    expect(h.style.height).toBe('400px');
    expect(h.style.overflow).toBe('hidden');
  });

  it('takes an element as well as a selector', () => {
    document.body.innerHTML = page;
    start({ ...quiet, target: document.getElementById('hero')! });
    expect(host()!.style.top).toBe('600px');
  });

  it('paints the overlay with the background the section shows', () => {
    document.body.innerHTML = '<div style="background:rgb(1, 2, 3)"><section id="s" data-box="0,100,300,200"><p data-box="0,100,50,20">x</p></section></div>';
    start({ ...quiet, target: '#s' });
    expect(host()!.style.background).toBe('rgb(1, 2, 3)');
  });

  it('a selector that matches nothing falls back to the whole page, with a warning', () => {
    document.body.innerHTML = page;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start({ ...quiet, target: '#nope' });
    expect(host()!.style.top).toBe('0px');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('an invalid selector does not throw', () => {
    document.body.innerHTML = page;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => start({ ...quiet, target: '##' })).not.toThrow();
    warn.mockRestore();
  });
});

describe('data-target', () => {
  it('is read from the script tag', () => {
    const s = document.createElement('script');
    s.setAttribute('data-target', '#hero');
    expect(optionsFromScript(s).target).toBe('#hero');
  });
});

describe('blueprint', () => {
  const host = () => document.querySelector('[data-swarm]') as HTMLElement | null;
  it('is read from data-blueprint and off by default', () => {
    const s = document.createElement('script');
    expect(optionsFromScript(s).blueprint).toBeUndefined();
    s.setAttribute('data-blueprint', 'on');
    expect(optionsFromScript(s).blueprint).toBe(true);
  });
  it('mounts without errors when enabled', () => {
    document.body.innerHTML = '<section data-box="0,0,300,200" style="background:#eee"><p data-box="0,0,50,20">x</p></section>';
    expect(() => start({ sound: false, fx: false, prime: false, blueprint: true })).not.toThrow();
    expect(host()).not.toBeNull();
  });
});
