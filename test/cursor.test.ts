import { describe, expect, it } from 'vitest';
import { Cursor } from '../src/cursor';

const tag = (c: Cursor) => (c as unknown as { tag: HTMLElement }).tag;
const make = (showName?: boolean) => new Cursor(0, document.body, ['#f00'], ['Mai'], showName);

describe('Cursor name tag', () => {
  it('is hidden by default', () => {
    const t = tag(make());
    expect(t.style.display).toBe('none');
    expect(t.textContent).toBe('');
  });

  it('shows size/distance readouts, then hides again on reset()', () => {
    const c = make();
    c.say('120 × 40');
    expect(tag(c).style.display).toBe('');
    expect(tag(c).textContent).toBe('120 × 40');
    c.reset();
    expect(tag(c).style.display).toBe('none');
  });

  it('shows the name when showNames is on', () => {
    const c = make(true);
    expect(tag(c).textContent).toBe('Mai');
    c.say('5 px', true);
    c.reset();
    expect(tag(c).textContent).toBe('Mai');
    expect(tag(c).style.display).toBe('');
  });
});
