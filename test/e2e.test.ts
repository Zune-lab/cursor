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

describe('staged text', () => {
  const texts = `
    <h1 data-box="40,40,400,60">Heading typed away from home first</h1>
    <p data-box="60,160,300,40">Paragraph that is also typed elsewhere</p>
    <p data-box="60,230,300,40">Another paragraph, another detour</p>`;
  const finalBoxes = (): string[] =>
    Array.from(document.querySelector('[data-swarm]')!.shadowRoot!.querySelectorAll<HTMLElement>('.pop'))
      .filter((el) => el.textContent)
      .map((el) => `${parseFloat(el.style.left)},${parseFloat(el.style.top)}`)
      .sort();

  const HOME = new Set(['40,40', '60,160', '60,230']);
  /** Where each text frame was first created (before any dragging). */
  const watchSpawns = (): string[] => {
    const spawns: string[] = [];
    new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          const el = n as HTMLElement;
          if (el.classList?.contains('txt')) spawns.push(`${parseFloat(el.style.left)},${parseFloat(el.style.top)}`);
        });
    }).observe(document.querySelector('[data-swarm]')!.shadowRoot!, { subtree: true, childList: true });
    return spawns;
  };

  it('ends exactly where the page had each text, after being dragged into place', async () => {
    document.body.innerHTML = texts;
    const h = start({ agents: 2, speed: 60, sound: false, fx: false });
    const spawns = watchSpawns();
    await expect(h.done).resolves.toBe('finished');
    expect(finalBoxes()).toEqual([...HOME].sort());
    expect(spawns.length).toBe(3);
    expect(spawns.every((p) => !HOME.has(p))).toBe(true); // each was typed somewhere else first
    h.stop();
  }, 30000);

  it('stageText: false types in place and ends in the same spots', async () => {
    document.body.innerHTML = texts;
    const h = start({ agents: 2, speed: 60, sound: false, fx: false, stageText: false });
    const spawns = watchSpawns();
    await expect(h.done).resolves.toBe('finished');
    expect(finalBoxes()).toEqual([...HOME].sort());
    expect(spawns.length).toBe(3);
    expect(spawns.every((p) => HOME.has(p))).toBe(true); // typed right where it belongs
    h.stop();
  }, 30000);
});

describe('teamwork', () => {
  // a big text first, and a box far below the fold that stays locked until the viewer scrolls: so the cursor that types the text
  // "has more to build" while the other cursors have nothing to do
  const page = `
    <h1 data-box="40,40,500,80">Typed in the wrong place, carried home by a colleague</h1>
    <div data-box="40,2400,300,100" style="background:#fc0"></div>`;

  interface Seen { helping: boolean; home: boolean }

  /** Run for a moment; report whether a cursor ever wore a "Helping <name>" tag and whether the text frame got home. */
  const observe = async (opts: Record<string, unknown>): Promise<Seen> => {
    document.body.innerHTML = page;
    const seen: Seen = { helping: false, home: false };
    const h = start({ agents: 4, speed: 60, sound: false, fx: false, ...opts });
    const root = document.querySelector('[data-swarm]')!.shadowRoot!;
    new MutationObserver((list) => {
      for (const m of list) if ((m.target.textContent ?? '').startsWith('Helping ')) seen.helping = true;
    }).observe(root, { subtree: true, childList: true, characterData: true });
    await new Promise((r) => setTimeout(r, 700));
    const frame = Array.from(root.querySelectorAll<HTMLElement>('.pop')).find((el) => el.textContent?.startsWith('Typed'));
    seen.home = frame?.style.left === '40px' && frame?.style.top === '40px';
    h.stop();
    document.body.innerHTML = '';
    return seen;
  };

  it('an idle cursor carries the typed frame home so the typist can move on', async () => {
    let helped: Seen | null = null;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = await observe({ seed });
      if (r.helping) { helped = r; break; }
    }
    expect(helped).not.toBeNull();
    expect(helped!.home).toBe(true); // and the frame still ends exactly where it belongs
  }, 30000);

  it('teamwork: false means the typist carries its own frame', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = await observe({ seed, teamwork: false });
      expect(r.helping).toBe(false);
      expect(r.home).toBe(true);
    }
  }, 30000);

  it('a hand-off never leaves the run unfinished or a helper stuck in a pose', async () => {
    document.body.innerHTML = `<h1 data-box="40,40,500,80">Typed in the wrong place</h1><p data-box="40,140,400,60">And another paragraph that needs carrying</p>`;
    const h = start({ agents: 4, speed: 60, sound: false, fx: false, seed: 1 });
    await expect(h.done).resolves.toBe('finished');
    const root = document.querySelector('[data-swarm]')!.shadowRoot!;
    expect(root.querySelector('.cur[data-m="cross"]')).toBeNull();
    expect(root.querySelector('.sel')).toBeNull();
    h.stop();
  }, 30000);
});
