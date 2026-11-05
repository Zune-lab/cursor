import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio';
import { start, stop } from '../src/index';

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('background tabs', () => {
  it('muted audio plays nothing and never creates a context', () => {
    let created = 0;
    vi.stubGlobal('AudioContext', class { constructor() { created++; } });
    const a = new AudioEngine(true);
    a.muted = true;
    a.press(0);
    a.note(5000, 0.5, 0);
    expect(created).toBe(0);
  });

  it('listens for visibilitychange while running and lets go on stop()', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    start({ sound: false, fx: false, prime: false });
    expect(add.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true);
    stop();
    expect(remove.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true);
  });

  it('hiding and showing the tab does not throw', () => {
    start({ sound: false, fx: false, prime: false });
    const set = (hidden: boolean): void => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    expect(() => { set(true); set(true); set(false); set(false); }).not.toThrow();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
});
