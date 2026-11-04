import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { start, stop } from '../src/index';

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const raw = this.getAttribute('data-box');
    const [x, y, w, h] = raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { stop(); document.body.innerHTML = ''; });

describe('full run', () => {
  it('rebuilds every kind of task and resolves done = "finished"', async () => {
    document.body.innerHTML = `
      <h1 data-box="40,40,400,60">Title that is long enough to type</h1>
      <div data-box="0,120,300,2" style="border-top:2px solid #ccc"></div>
      <section data-box="40,140,500,200" style="background:#eee;border:1px solid #999">
        <p data-box="60,160,300,20" onclick="alert(1)">Body copy one</p>
        <p data-box="60,190,300,20">Body copy two</p>
        <p data-box="60,220,300,20">Body copy three</p>
      </section>
      <ul>${[0, 1, 2].map((i) => `<li class="c" data-box="${40 + i * 160},360,140,90" style="background:#fc0"></li>`).join('')}</ul>
      <img alt="" data-box="40,470,100,60" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <svg data-box="200,470,40,40" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red" onclick="x()"/></svg>
      <video data-box="260,470,80,50"></video>`;
    const progress: number[] = [];
    const onFinish = vi.fn();
    const warn = vi.spyOn(console, 'warn');
    const h = start({ agents: 3, speed: 60, sound: false, fx: false, onProgress: (p) => progress.push(p), onFinish });
    await expect(h.done).resolves.toBe('finished');
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);

    const root = document.querySelector('[data-swarm]')!.shadowRoot!;
    // inline handlers copied from the page must not survive in the overlay
    expect(root.innerHTML).not.toMatch(/onclick=/);
    // typed text is complete
    expect(root.textContent).toContain('Title that is long enough to type');
    expect(root.querySelector('.caret')).toBeNull(); // typing caret cleaned up
    expect(root.querySelector('[data-a=live]')!.getAttribute('style')).not.toMatch(/none/);
    h.stop();
  }, 30000);

  it('"Go live" fades the overlay out and removes it', async () => {
    document.body.innerHTML = `<div data-box="0,0,50,50" style="background:red"></div>`;
    const h = start({ agents: 1, speed: 60, sound: false, fx: false });
    await h.done;
    (document.querySelector('[data-swarm]')!.shadowRoot!.querySelector('[data-a=live]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 650));
    expect(document.querySelector('[data-swarm]')).toBeNull();
  }, 30000);
});
