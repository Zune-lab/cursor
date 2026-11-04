import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio';

afterEach(() => vi.unstubAllGlobals());

function fakeContext() {
  const osc = { type: '', frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  const panner = { pan: { value: 0 }, connect: vi.fn() };
  const ctx = {
    state: 'running', currentTime: 0, destination: {},
    createOscillator: () => osc, createGain: () => gain, createStereoPanner: () => panner,
    close: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined),
  };
  return { ctx, osc, panner };
}

describe('AudioEngine', () => {
  it('reports a locked (suspended) context and unlocks on the first gesture', () => {
    const { ctx } = fakeContext();
    ctx.state = 'suspended';
    vi.stubGlobal('AudioContext', function () { return ctx; });
    const onLock = vi.fn();
    const a = new AudioEngine(true, onLock);
    a.warm();
    expect(onLock).toHaveBeenCalledWith(true);
    dispatchEvent(new Event('pointerdown'));
    expect(ctx.resume).toHaveBeenCalled();
    a.close();
  });

  it('key / press / snap / swell / arpeggio / chord / sweep never throw, even on a minimal context', () => {
    const { ctx } = fakeContext(); // no filter / buffer nodes: noise parts are skipped
    vi.stubGlobal('AudioContext', function () { return ctx; });
    const a = new AudioEngine(true);
    expect(() => {
      a.key(0, false); a.key(0.5, true); a.press(0); a.snap(0); a.tickUp(0.5, 0);
      a.swell(); a.arpeggio(); a.chord(); a.sweepDown();
    }).not.toThrow();
  });

  it('tickUp is throttled', () => {
    const { ctx, osc } = fakeContext();
    vi.stubGlobal('AudioContext', function () { return ctx; });
    const a = new AudioEngine(true);
    a.tickUp(0.1, 0);
    a.tickUp(0.2, 0);
    expect(osc.start).toHaveBeenCalledTimes(1);
  });

  it('is a silent no-op without WebAudio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const a = new AudioEngine(true);
    expect(() => { a.click(0); a.tone(440, 1, 'sine', 0.1, 0); a.chord(); }).not.toThrow();
  });

  it('creates nothing while disabled', () => {
    const { ctx } = fakeContext();
    const Ctor = vi.fn(function () { return ctx; });
    vi.stubGlobal('AudioContext', Ctor);
    new AudioEngine(false).tone(440, 1, 'sine', 0.1, 0);
    expect(Ctor).not.toHaveBeenCalled();
  });

  it('plays a clamped, panned tone and closes cleanly', () => {
    const { ctx, osc, panner } = fakeContext();
    vi.stubGlobal('AudioContext', function () { return ctx; });
    const a = new AudioEngine(true);
    a.tone(440, 1, 'triangle', 0.1, 5);
    expect(osc.frequency.value).toBe(440);
    expect(osc.start).toHaveBeenCalled();
    expect(panner.pan.value).toBe(1);
    a.close();
    expect(ctx.close).toHaveBeenCalled();
    a.tone(440, 1, 'sine', 0.1, 0); // after close: ignored
    expect(osc.start).toHaveBeenCalledTimes(1);
  });

  it('note() ignores tiny boxes and plays one note per eighth-note slot', () => {
    const { ctx, osc } = fakeContext();
    vi.stubGlobal('AudioContext', function () { return ctx; });
    const a = new AudioEngine(true);
    a.note(100, 0.5, 0);
    expect(osc.start).not.toHaveBeenCalled();
    a.note(5000, 0.5, 0);
    const first = osc.start.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    a.note(5000, 0.5, 0); // same eighth-note slot -> skipped
    expect(osc.start.mock.calls.length).toBe(first);
  });
});
