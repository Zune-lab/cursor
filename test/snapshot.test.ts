import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from '../src/snapshot';

/** jsdom has no layout: read boxes from a data-box="x,y,w,h" attribute instead. */
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { document.body.innerHTML = ''; });

const kinds = () => snapshot().map((t) => t.kind);

describe('snapshot', () => {
  it('turns a painted box into a rect and its text into a text task', () => {
    document.body.innerHTML = `<div data-box="10,10,200,100" style="background:#fff;border:1px solid #ccc"><p data-box="20,20,100,20">Hello</p></div>`;
    const out = snapshot();
    expect(out.map((t) => t.kind)).toEqual(['rect', 'text']);
    expect(out[1].parent).toBe(out[0]);
  });

  it('turns a one-sided border into a pen line', () => {
    document.body.innerHTML = `<div data-box="0,50,300,2" style="border-top:2px solid red"></div>`;
    const [t] = snapshot();
    expect(t.kind).toBe('line');
    if (t.kind === 'line') {
      expect(t.lw).toBe(2);
      expect(t.pts).toEqual([0, 51, 300, 51]);
    }
  });

  it('keeps media as media tasks', () => {
    document.body.innerHTML = `<img data-box="0,0,50,50" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`;
    const [t] = snapshot();
    expect(t.kind).toBe('media');
    if (t.kind === 'media') expect(t.tag).toBe('img');
  });

  it('skips script/style, hidden, zero-size and data-swarm subtrees', () => {
    document.body.innerHTML = `
      <script data-box="0,0,10,10">1</script>
      <div data-box="0,0,10,10" style="display:none;background:red"></div>
      <div style="background:red"></div>
      <div data-swarm data-box="0,0,10,10" style="background:red"></div>`;
    expect(kinds()).toEqual([]);
  });

  it('honours `exclude`', () => {
    document.body.innerHTML = `<div class="skip" data-box="0,0,10,10" style="background:red"></div><div data-box="0,20,10,10" style="background:red"></div>`;
    expect(snapshot({ exclude: '.skip' })).toHaveLength(1);
  });

  it('honours `maxTasks`', () => {
    document.body.innerHTML = Array.from({ length: 50 }, (_, i) => `<div data-box="0,${i * 5},10,4" style="background:red"></div>`).join('');
    expect(snapshot({ maxTasks: 5 }).length).toBeLessThan(10);
  });

  it('sorts top-to-bottom and never puts a child before its parent', () => {
    document.body.innerHTML = `
      <div data-box="0,300,100,100" style="background:red"><span data-box="0,0,10,10" style="background:blue"></span></div>
      <div data-box="0,10,100,100" style="background:green"></div>`;
    const out = snapshot();
    expect(out.map((t) => t.b.y)).toEqual([10, 300, 0]);
    const child = out[2];
    expect(child.parent).toBe(out[1]);
    expect(child.key).toBeGreaterThanOrEqual(out[1].key);
  });

  it('marks repeated siblings as Alt-drag copies of the first', () => {
    document.body.innerHTML = `<ul>${[0, 1, 2, 3].map((i) => `<li class="c" data-box="${i * 120},0,100,100" style="background:red"></li>`).join('')}</ul>`;
    const out = snapshot();
    expect(out).toHaveLength(4);
    expect(out[0].dupFrom).toBeUndefined();
    expect(out.slice(1).every((t) => t.dupFrom === out[0].b)).toBe(true);
  });

  it('adds a ruler guide when 3+ texts share a left edge', () => {
    document.body.innerHTML = [60, 100, 140].map((y) => `<p data-box="40,${y},200,20">Line ${y}</p>`).join('');
    const texts = snapshot().filter((t) => t.kind === 'text');
    expect(texts).toHaveLength(3);
    expect(texts[0].guideX).toBe(40);
    expect(texts[1].guideX).toBeUndefined();
  });

  it('does not treat SVG class objects as "[object SVGAnimatedString]" in signatures', () => {
    document.body.innerHTML = `<div data-box="0,0,100,100" style="background:red"><svg class="a" data-box="0,0,10,10"></svg><svg class="b" data-box="0,0,10,10"></svg><svg class="a" data-box="0,0,10,10"></svg></div>`;
    expect(() => snapshot()).not.toThrow();
  });
});

describe('snapshot: shadow DOM, canvas, video', () => {
  it('enters open shadow roots', () => {
    document.body.innerHTML = `<my-card data-box="0,0,300,100"></my-card>`;
    const host = document.querySelector('my-card')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<div data-box="10,10,200,50" style="background:#abc"><p data-box="20,20,100,20">Inside shadow</p></div>`;
    const out = snapshot();
    expect(out.map((t) => t.kind)).toEqual(['rect', 'text']);
    expect(out[1].kind === 'text' && out[1].html).toBe('Inside shadow');
  });

  it('reads a still frame from a canvas, and tolerates a tainted one', () => {
    document.body.innerHTML = `<canvas id="a" data-box="0,0,100,100" width="10" height="10"></canvas><canvas id="b" data-box="0,120,100,100" width="10" height="10"></canvas>`;
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
      if (this.id === 'b') throw new DOMException('tainted', 'SecurityError');
      return 'data:image/png;base64,AAA';
    };
    try {
      const [a, b] = snapshot();
      expect(a.kind === 'media' && a.src).toBe('data:image/png;base64,AAA');
      expect(b.kind === 'media' && b.src).toBeUndefined();
    } finally {
      HTMLCanvasElement.prototype.toDataURL = orig;
    }
  });

  it('uses a video poster when no frame is available', () => {
    document.body.innerHTML = `<video data-box="0,0,100,100" poster="https://example.com/p.jpg"></video>`;
    const [t] = snapshot();
    expect(t.kind === 'media' && t.src).toContain('example.com/p.jpg');
  });
});
