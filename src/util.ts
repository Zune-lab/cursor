import type { StyleBag } from './types';

/** Late-bound so importing the module in SSR / Node never touches `window`. */
export const raf = (cb: FrameRequestCallback): number => requestAnimationFrame(cb);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Cubic ease-in-out, 0..1 -> 0..1. */
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** Copy the named computed-style properties into a plain object. */
export function pick(cs: CSSStyleDeclaration, props: readonly string[]): StyleBag {
  const out: StyleBag = {};
  const src = cs as unknown as StyleBag;
  for (const p of props) out[p] = src[p];
  return out;
}

export function setStyle(el: HTMLElement, prop: string, value: string): void {
  (el.style as unknown as StyleBag)[prop] = value;
}

export const isTransparent = (c: string): boolean => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
export const isNone = (v: string): boolean => !v || v === 'none';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

/**
 * The text/media copies are made from the page's own markup, but we never want to
 * re-run its inline handlers or scripts inside the overlay.
 */
export function sanitize(root: Element): void {
  root.querySelectorAll('script,iframe,object,embed').forEach((n) => n.remove());
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      if (a.name.toLowerCase().startsWith('on')) el.removeAttribute(a.name);
    }
  }
}

export function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Size of the page's own layout area. `innerWidth/innerHeight` include the scrollbars, so an
 * overlay of that size would itself create a horizontal/vertical scrollbar.
 */
export function pageSize(): { w: number; h: number } {
  const de = document.documentElement;
  return {
    w: Math.max(de.clientWidth || window.innerWidth, de.scrollWidth),
    h: Math.max(de.clientHeight || window.innerHeight, de.scrollHeight),
  };
}
