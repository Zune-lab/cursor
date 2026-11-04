import { afterEach, describe, expect, it, vi } from 'vitest';
import { primeLazyContent } from '../src/prime';

afterEach(() => vi.restoreAllMocks());

describe('primeLazyContent', () => {
  it('skips short pages', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 100, configurable: true });
    await primeLazyContent(() => false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('walks down a long page and puts the scroll back', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 4000, configurable: true });
    await primeLazyContent(() => false);
    const tops = scroll.mock.calls.map((c) => (c[0] as ScrollToOptions).top);
    expect(tops.length).toBeGreaterThan(3);
    expect(tops.slice(0, -1)).toEqual([...tops.slice(0, -1)].sort((a, b) => (a as number) - (b as number)));
    expect(tops[tops.length - 1]).toBe(0); // restored
  });

  it('stops early when the swarm is closed', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 9000, configurable: true });
    await primeLazyContent(() => true);
    expect(scroll).toHaveBeenCalledTimes(1); // only the restore
  });
});
