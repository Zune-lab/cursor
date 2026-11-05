/**
 * Screenshots for media the page won't let us read (tainted <canvas>, cross-origin <video> / <iframe>).
 *
 * Only possible inside the Chrome extension: the background worker grabs the visible tab with
 * `chrome.tabs.captureVisibleTab` (allowed by `activeTab`, one call, before the overlay fades in),
 * and each element is cropped out of that one image. Elements that are not on screen at that
 * moment keep the neutral placeholder; the capture API is rate-limited, so there is no second try.
 */
import { stillFrame } from './snapshot';

const TIMEOUT_MS = 1500;
const MIN_VISIBLE = 0.8; // at least this much of the element must be on screen
const MIN_SIDE = 24;
const MAX_ELEMENTS = 12;

interface Runtime {
  id?: string;
  sendMessage(message: unknown): Promise<unknown> | void;
}

function runtime(): Runtime | null {
  const c = (globalThis as { chrome?: { runtime?: Runtime } }).chrome;
  return c?.runtime?.id && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
}

/** True inside the extension (a normal page has no `chrome.runtime.id`). */
export const canCapture = (): boolean => runtime() !== null;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The on-screen part of a box, or null when too little of it is visible to be worth a crop. */
export function visibleRect(r: { left: number; top: number; width: number; height: number }, vw: number, vh: number): Rect | null {
  const x = Math.max(0, r.left);
  const y = Math.max(0, r.top);
  const w = Math.min(vw, r.left + r.width) - x;
  const h = Math.min(vh, r.top + r.height) - y;
  if (w < MIN_SIDE || h < MIN_SIDE) return null;
  if (w * h < r.width * r.height * MIN_VISIBLE) return null;
  return { x, y, w, h };
}

/** Media under `root` that we cannot read ourselves and that is (mostly) on screen right now. */
export function unreadableMedia(root: Element): Element[] {
  const vw = innerWidth;
  const vh = innerHeight;
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll('canvas, video, iframe'))) {
    if (out.length >= MAX_ELEMENTS) break;
    if (el.closest('[data-swarm]')) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'iframe') {
      try {
        if ((el as HTMLIFrameElement).contentDocument?.body) continue; // same-origin: rebuilt from its own document
      } catch {
        /* cross-origin: needs a screenshot */
      }
    } else if (stillFrame(el, tag)) continue;
    if (visibleRect(el.getBoundingClientRect(), vw, vh)) out.push(el);
  }
  return out;
}

const withTimeout = <T>(p: Promise<T>): Promise<T | undefined> =>
  new Promise((res) => {
    const t = setTimeout(() => res(undefined), TIMEOUT_MS);
    p.then((v) => (clearTimeout(t), res(v)), () => (clearTimeout(t), res(undefined)));
  });

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(undefined);
    img.src = src;
  });
}

/** One tab capture, cropped per element into `stills`. Never throws; resolves with nothing added on any failure. */
export async function captureStills(els: Element[], stills: WeakMap<Element, string>): Promise<void> {
  const rt = runtime();
  if (!rt || !els.length) return;
  try {
    const vw = innerWidth;
    const vh = innerHeight;
    const wanted = els.flatMap((el) => {
      const v = visibleRect(el.getBoundingClientRect(), vw, vh);
      return v ? [{ el, v }] : [];
    });
    if (!wanted.length) return;
    const reply = (await withTimeout(Promise.resolve(rt.sendMessage({ type: 'swarm:capture' })))) as { dataUrl?: string } | undefined;
    if (!reply?.dataUrl) return;
    const img = await withTimeout(loadImage(reply.dataUrl));
    if (!img?.naturalWidth) return;
    const k = img.naturalWidth / vw;
    for (const { el, v } of wanted) {
      try {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(v.w * k));
        c.height = Math.max(1, Math.round(v.h * k));
        c.getContext('2d')?.drawImage(img, v.x * k, v.y * k, v.w * k, v.h * k, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.85);
        if (url && url !== 'data:,') stills.set(el, url);
      } catch {
        /* this one stays a placeholder */
      }
    }
  } catch {
    /* no screenshots: placeholders it is */
  }
}
