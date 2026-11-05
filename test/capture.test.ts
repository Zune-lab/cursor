import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCapture, captureStills, unreadableMedia, visibleRect } from '../src/capture';
import { Scanner } from '../src/snapshot';
import { start, stop } from '../src/index';

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('visibleRect', () => {
  it('returns the on-screen part of a fully visible box', () => {
    expect(visibleRect({ left: 10, top: 20, width: 100, height: 50 }, 800, 600)).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
  it('rejects boxes that are mostly off screen or tiny', () => {
    expect(visibleRect({ left: 0, top: 500, width: 200, height: 400 }, 800, 600)).toBeNull();
    expect(visibleRect({ left: 0, top: 0, width: 10, height: 10 }, 800, 600)).toBeNull();
    expect(visibleRect({ left: -500, top: 0, width: 600, height: 300 }, 800, 600)).toBeNull();
  });
  it('needs at least 80% of the box on screen', () => {
    expect(visibleRect({ left: 0, top: 570, width: 200, height: 40 }, 800, 600)).toBeNull(); // 75% visible
    expect(visibleRect({ left: 0, top: 100, width: 200, height: 520 }, 800, 600)).not.toBeNull(); // ~96% visible
  });
});

describe('outside the extension', () => {
  it('canCapture is false without chrome.runtime.id', () => {
    expect(canCapture()).toBe(false);
  });
  it('captureStills does nothing and never throws', async () => {
    const stills = new WeakMap<Element, string>();
    const el = document.createElement('canvas');
    await expect(captureStills([el], stills)).resolves.toBeUndefined();
    expect(stills.has(el)).toBe(false);
  });
});

describe('inside the extension', () => {
  const stubChrome = (reply: unknown): ReturnType<typeof vi.fn> => {
    const sendMessage = vi.fn().mockResolvedValue(reply);
    vi.stubGlobal('chrome', { runtime: { id: 'abc', sendMessage } });
    return sendMessage;
  };

  it('canCapture is true', () => {
    stubChrome({});
    expect(canCapture()).toBe(true);
  });

  it('asks the background worker for one capture only when something is on screen', async () => {
    const send = stubChrome({});
    const stills = new WeakMap<Element, string>();
    const el = document.createElement('canvas');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await captureStills([el], stills);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'swarm:capture' });
    const off = document.createElement('canvas'); // zero-sized: not worth a capture
    send.mockClear();
    await captureStills([off], stills);
    expect(send).not.toHaveBeenCalled();
  });

  it('survives a failed or empty capture', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'abc', sendMessage: vi.fn().mockRejectedValue(new Error('no')) } });
    const el = document.createElement('canvas');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    await expect(captureStills([el], new WeakMap())).resolves.toBeUndefined();
  });

  it('start() still fades in when the capture fails', async () => {
    stubChrome({}); // no dataUrl
    document.body.innerHTML = '<p>hi</p>';
    start({ sound: false, fx: false, prime: false });
    await new Promise((r) => setTimeout(r, 60));
    expect((document.querySelector('[data-swarm]') as HTMLElement).style.opacity).toBe('1');
  });

  it('captureMedia: false never talks to the extension', () => {
    const send = stubChrome({});
    start({ sound: false, fx: false, prime: false, captureMedia: false });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Scanner stills', () => {
  it('uses a screenshot for media it cannot read itself', () => {
    document.body.innerHTML = '<canvas id="c" width="10" height="10"></canvas>';
    const c = document.getElementById('c') as HTMLCanvasElement;
    c.getContext = (() => null) as never;
    c.toDataURL = () => { throw new Error('tainted'); };
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const stills = new WeakMap<Element, string>([[c, 'data:image/jpeg;base64,AAAA']]);
    const media = new Scanner({ stills }).scan().find((t) => t.kind === 'media');
    expect(media && media.kind === 'media' && media.src).toBe('data:image/jpeg;base64,AAAA');
  });

  it('unreadableMedia skips media inside the swarm overlay', () => {
    document.body.innerHTML = '<div data-swarm><canvas></canvas></div>';
    expect(unreadableMedia(document.body)).toEqual([]);
  });
});
