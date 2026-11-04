import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Scanner, snapshot } from '../src/snapshot';

/** jsdom has no layout: read boxes from a data-box="x,y,w,h" attribute instead. */
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { document.body.innerHTML = ''; });

const cards = (n: number) =>
  Array.from({ length: n }, (_, i) => `<div data-box="0,${i * 100},200,80" style="background:#eee"><p data-box="10,${i * 100 + 10},100,20">Card ${i}</p></div>`).join('');

describe('band scanning', () => {
  it('scans a long page band by band: every element exactly once, nothing cut off', () => {
    document.body.innerHTML = cards(200); // 20 000 px tall, 400 tasks
    const whole = snapshot().length;
    const s = new Scanner();
    const seen: number[] = [];
    let total = 0;
    for (let top = 0; top < 20000; top += 1500) {
      const part = s.scan(top === 0 ? -Infinity : top, top + 1500 >= 20000 ? Infinity : top + 1500);
      seen.push(part.length);
      total += part.length;
    }
    expect(total).toBe(whole);
    expect(whole).toBe(400);
    expect(seen.every((n) => n > 0)).toBe(true); // work is spread over the bands
  });

  it('a band only walks what touches it', () => {
    document.body.innerHTML = cards(200);
    const first = new Scanner().scan(-Infinity, 1000);
    expect(first.length).toBeLessThan(30);
    expect(first.every((t) => t.b.y < 1000)).toBe(true);
  });

  it('children found in a later band still link to their parent from an earlier one', () => {
    document.body.innerHTML = `<section data-box="0,0,300,3000" style="background:#eee"><p data-box="10,2500,100,20">Deep</p></section>`;
    const s = new Scanner();
    const a = s.scan(-Infinity, 1000);
    const b = s.scan(1000, Infinity);
    expect(a.map((t) => t.kind)).toEqual(['rect']);
    expect(b.map((t) => t.kind)).toEqual(['text']);
    expect(b[0].parent).toBe(a[0]);
  });

  it('maxTasks is a total cap across bands and reports `capped`', () => {
    document.body.innerHTML = cards(100);
    const s = new Scanner({ maxTasks: 10 });
    s.scan(-Infinity, 3000);
    expect(s.capped).toBe(true);
  });

  it('a repeated card far below its master becomes a new master instead of a long Alt-drag', () => {
    document.body.innerHTML = `<ul>${Array.from({ length: 4 }, (_, i) => `<li class="c" data-box="0,${i * 3000},100,100" style="background:red"></li>`).join('')}</ul>`;
    const out = snapshot();
    expect(out.filter((t) => t.dupFrom).length).toBeLessThan(3);
  });
});

describe('snapshot fixes', () => {
  it('draws position:fixed elements at the top of the page, not where the viewer happened to be', () => {
    Object.defineProperty(window, 'scrollY', { value: 5000, configurable: true });
    try {
      document.body.innerHTML = `<header data-box="0,0,800,60" style="position:fixed;background:#fff"></header>`;
      const [t] = snapshot();
      expect(t.b.y).toBe(0);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
  });

  it('does not draw content that is scrolled out of its scroll container', () => {
    document.body.innerHTML = `
      <div data-box="0,0,300,100" style="overflow:auto;background:#eee">
        <p data-box="10,10,100,20">Visible</p>
        <p data-box="10,400,100,20">Scrolled away</p>
      </div>`;
    const texts = snapshot().filter((t) => t.kind === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0].kind === 'text' && texts[0].html).toBe('Visible');
  });

  it('rebuilds same-origin iframe content, offset by the frame, and clipped to it', () => {
    document.body.innerHTML = `<iframe data-box="100,200,300,150"></iframe>`;
    const frame = document.querySelector('iframe')!;
    const doc = frame.contentDocument!;
    doc.body.innerHTML = `<p style="margin:0">In frame</p>`;
    doc.body.querySelector('p')!.getBoundingClientRect = () => ({ x: 5, y: 7, left: 5, top: 7, width: 80, height: 20, right: 85, bottom: 27, toJSON() {} }) as DOMRect;
    const out = snapshot();
    const t = out.find((x) => x.kind === 'text');
    expect(t?.b.x).toBe(105);
    expect(t?.b.y).toBe(207);
  });

  it('turns an unreadable (cross-origin) iframe into a placeholder', () => {
    document.body.innerHTML = `<iframe data-box="0,0,300,150"></iframe>`;
    const frame = document.querySelector('iframe')!;
    Object.defineProperty(frame, 'contentDocument', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    const t = snapshot().find((x) => x.kind === 'media');
    expect(t?.kind === 'media' && t.tag).toBe('iframe');
  });

  it('keeps bare text slotted into a web component', () => {
    document.body.innerHTML = `<my-label data-box="0,0,200,30">Slotted words</my-label>`;
    const host = document.querySelector('my-label')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<span data-box="0,0,200,30"><slot></slot></span>`;
    const slot = root.querySelector('slot')!;
    (slot as HTMLSlotElement).getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 30, right: 200, bottom: 30, toJSON() {} }) as DOMRect;
    const texts = snapshot().filter((t) => t.kind === 'text');
    expect(texts.map((t) => (t.kind === 'text' ? t.html : '')).join('')).toContain('Slotted words');
  });
});
