// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('server-side import', () => {
  it('importing the module does not touch window/document', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.start).toBe('function');
    expect(mod.isRunning()).toBe(false);
  });

  it('start() fails with a clear message instead of a ReferenceError', async () => {
    const { start } = await import('../src/index');
    expect(() => start()).toThrow(/needs a browser/);
  });
});
