import { describe, expect, it, vi } from 'vitest';

describe('global entry', () => {
  it('is idempotent: loading the bundle twice binds the hotkey once', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    vi.resetModules();
    await import('../src/global');
    const first = add.mock.calls.filter((c) => c[0] === 'keydown').length;
    vi.resetModules();
    await import('../src/global');
    const second = add.mock.calls.filter((c) => c[0] === 'keydown').length;
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(typeof window.SwarmCursors.start).toBe('function');
    add.mockRestore();
  });

  it('parses data-* options', async () => {
    const { optionsFromScript } = await import('../src/global');
    const s = document.createElement('script');
    s.dataset.agents = '9';
    s.dataset.sound = 'off';
    s.dataset.adaptive = 'off';
    s.dataset.maxAgents = '12';
    s.dataset.labels = '{"tour":"Tham quan"}';
    expect(optionsFromScript(s)).toEqual({ agents: 9, sound: false, adaptive: false, maxAgents: 12, labels: { tour: 'Tham quan' } });
    s.dataset.labels = '{nope';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(optionsFromScript(s).labels).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
