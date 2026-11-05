import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describe as describeEl, pick } from '../src/picker';
import { bindHotkey, isRunning, pickAndStart, stop } from '../src/index';

let hit: Element | null = null;
beforeEach(() => {
  document.body.innerHTML = '<main id="m"><section id="hero" class="dark wide"><h2 id="h">Hi</h2></section></main>';
  hit = document.getElementById('h');
  document.elementFromPoint = (() => hit) as typeof document.elementFromPoint;
  Element.prototype.getBoundingClientRect = function () {
    return { left: 10, top: 40, width: 300, height: 120, right: 310, bottom: 160, x: 10, y: 40, toJSON() {} } as DOMRect;
  };
});
afterEach(() => {
  stop();
  document.body.innerHTML = '';
});

const move = (): boolean => dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 50 }));
const key = (k: string): boolean => dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const tagText = (): string => document.querySelector('[data-swarm-pick]')!.shadowRoot!.querySelector('.tag')!.textContent!;

describe('describe', () => {
  it('names tag, id, first class and size', () => {
    const el = document.getElementById('hero')!;
    expect(describeEl(el, { width: 800.4, height: 399.6 })).toBe('section#hero.dark 800×400');
  });
});

describe('pick', () => {
  it('outlines what is under the pointer and resolves with it on click', async () => {
    const p = pick();
    move();
    expect(tagText()).toBe('h2#h 300×120');
    const click = new MouseEvent('click', { clientX: 20, clientY: 50, cancelable: true });
    dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true); // the page's own click handler never sees it
    expect(await p).toBe(hit);
    expect(document.querySelector('[data-swarm-pick]')).toBeNull();
  });

  it('ArrowUp goes to the parent, ArrowDown back, Enter picks', async () => {
    const p = pick();
    move();
    key('ArrowUp');
    expect(tagText().startsWith('section#hero')).toBe(true);
    key('ArrowUp');
    expect(tagText().startsWith('main#m')).toBe(true);
    key('ArrowDown');
    expect(tagText().startsWith('section#hero')).toBe(true);
    key('Enter');
    expect(await p).toBe(document.getElementById('hero'));
  });

  it('Escape cancels with null and cleans up', async () => {
    const p = pick();
    key('Escape');
    expect(await p).toBeNull();
    expect(document.querySelector('[data-swarm-pick]')).toBeNull();
    expect(document.documentElement.style.cursor).toBe('');
  });

  it('never picks its own overlay or the swarm', async () => {
    const p = pick();
    const swarm = document.createElement('div');
    swarm.setAttribute('data-swarm', '');
    document.body.appendChild(swarm);
    hit = swarm;
    move();
    expect(tagText()).toBe(''); // nothing outlined
    key('Escape');
    await p;
  });
});

describe('pickAndStart', () => {
  const quiet = { sound: false, fx: false, prime: false } as const;

  it('starts the swarm on the picked section only', async () => {
    const p = pickAndStart(quiet);
    hit = document.getElementById('hero');
    move();
    dispatchEvent(new MouseEvent('click', { clientX: 20, clientY: 50, cancelable: true }));
    const handle = await p;
    expect(handle).not.toBeNull();
    expect(isRunning()).toBe(true);
    expect((document.querySelector('[data-swarm]') as HTMLElement).style.top).toBe('40px'); // the section's box, not the page
  });

  it('does nothing when cancelled', async () => {
    const p = pickAndStart(quiet);
    key('Escape');
    expect(await p).toBeNull();
    expect(isRunning()).toBe(false);
  });

  it('Alt+Shift+P starts picking', () => {
    const off = bindHotkey(() => quiet);
    dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyP', cancelable: true }));
    expect(document.querySelector('[data-swarm-pick]')).not.toBeNull();
    key('Escape');
    off();
  });
});
