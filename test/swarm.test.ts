import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwarmCursors, bindHotkey, isRunning, start, stop } from '../src/index';

const host = () => document.querySelector('[data-swarm]') as HTMLElement | null;
const quiet = { sound: false, fx: false } as const;

afterEach(() => {
  stop();
  document.body.innerHTML = '';
});

describe('lifecycle', () => {
  it('mounts one overlay with a shadow toolbar, and removes it on stop()', async () => {
    document.body.innerHTML = '<p>hi</p>';
    const h = start(quiet);
    expect(isRunning()).toBe(true);
    expect(host()).not.toBeNull();
    expect(host()!.shadowRoot!.querySelector('.bar')).not.toBeNull();
    h.stop();
    h.stop(); // idempotent
    expect(host()).toBeNull();
    expect(isRunning()).toBe(false);
    await expect(h.done).resolves.toBe('stopped');
  });

  it('clips its contents so cursors at the edge cannot enlarge the page', () => {
    start(quiet);
    expect(host()!.style.overflow).toBe('hidden');
  });

  it('starting again replaces the running swarm instead of stacking', () => {
    start(quiet);
    start(quiet);
    expect(document.querySelectorAll('[data-swarm]')).toHaveLength(1);
  });

  it('calls onStop once and honours custom labels', () => {
    const onStop = vi.fn();
    start({ ...quiet, onStop, labels: { tour: 'Tham quan', preparing: 'Đang chuẩn bị' } });
    const root = host()!.shadowRoot!;
    expect(root.querySelector('[data-a=tour]')!.textContent).toBe('Tham quan');
    expect(root.querySelector('.st')!.textContent).toBe('Đang chuẩn bị');
    stop();
    stop();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it, and the close button too', () => {
    start(quiet);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isRunning()).toBe(false);
    start(quiet);
    (host()!.shadowRoot!.querySelector('[data-a=x]') as HTMLElement).click();
    expect(isRunning()).toBe(false);
  });

  it('the sound button / M key toggle the icon without touching inputs', () => {
    start({ sound: true, fx: false });
    const snd = host()!.shadowRoot!.querySelector('[data-a=snd]')!;
    const before = snd.innerHTML;
    dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(snd.innerHTML).not.toBe(before);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const mid = snd.innerHTML;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    expect(snd.innerHTML).toBe(mid);
  });

  it('removes its global listeners on stop', () => {
    const rm = vi.spyOn(window, 'removeEventListener');
    start(quiet);
    stop();
    const names = rm.mock.calls.map((c) => c[0]);
    expect(names).toEqual(expect.arrayContaining(['mousemove', 'keydown']));
    rm.mockRestore();
  });
});

describe('hotkey', () => {
  it('Alt+Shift+S toggles, and unbinding works', () => {
    const unbind = bindHotkey(() => quiet);
    const press = () => dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyS', cancelable: true }));
    press();
    expect(isRunning()).toBe(true);
    press();
    expect(isRunning()).toBe(false);
    unbind();
    press();
    expect(isRunning()).toBe(false);
  });
});

describe('public api', () => {
  it('exposes the documented surface', () => {
    expect(Object.keys(SwarmCursors).sort()).toEqual(['bindHotkey', 'isRunning', 'start', 'stop', 'version']);
    expect(SwarmCursors.version).toBe('test');
  });
});

describe('tour', () => {
  const tourBtn = () => host()!.shadowRoot!.querySelector('[data-a=tour]')!;

  it('`tour: true` starts with the tour on; Space and the button toggle it', () => {
    start({ ...quiet, tour: true });
    expect(tourBtn().classList.contains('on')).toBe(true);
    dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
    expect(tourBtn().classList.contains('on')).toBe(false);
    (tourBtn() as HTMLElement).click();
    expect(tourBtn().classList.contains('on')).toBe(true);
  });

  it('Space does nothing while typing in a field', () => {
    start(quiet);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(tourBtn().classList.contains('on')).toBe(false);
  });

  it('the speed button matching `speed` starts highlighted', () => {
    start({ ...quiet, speed: 2 });
    const on = host()!.shadowRoot!.querySelector('.seg .on')!;
    expect((on as HTMLElement).dataset.a).toBe('s2');
  });
});
