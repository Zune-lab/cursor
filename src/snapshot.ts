import { DEFAULT_MAX_TASKS, MEDIA_PROPS, MEDIA_TAGS, RECT_PROPS, SIDES, SKIP_TAGS, TEXT_PROPS } from './constants';
import type { Box, MediaTag, RectTask, Task, TextTask } from './types';
import { esc, isNone, isTransparent, pick } from './util';

export interface SnapshotOptions {
  maxTasks?: number;
  exclude?: string;
}

/** Render children: open shadow roots are entered, and <slot>s resolve to what is slotted in. */
function childrenOf(el: Element): Element[] {
  if (typeof HTMLSlotElement !== 'undefined' && el instanceof HTMLSlotElement) {
    const a = el.assignedElements({ flatten: true });
    return a.length ? a : Array.from(el.children);
  }
  return Array.from((el.shadowRoot ?? el).children);
}

function nodesOf(el: Element): Node[] {
  return Array.from((el.shadowRoot ?? el).childNodes);
}

/** innerHTML of the element, or of its shadow root's content. */
function htmlOf(el: Element): string {
  if (!el.shadowRoot) return el.innerHTML;
  return nodesOf(el).map((n) => (n.nodeType === 1 ? (n as Element).outerHTML : n.nodeType === 3 ? esc(n.textContent ?? '') : '')).join('');
}

const MAX_STILL_PIXELS = 4_000_000;

/**
 * A still image for <canvas> / <video> when the browser lets us read one
 * (not tainted, not huge). Videos fall back to their poster.
 */
function stillFrame(el: Element, tag: string): string | undefined {
  try {
    if (tag === 'canvas') {
      const c = el as HTMLCanvasElement;
      if (c.width * c.height > MAX_STILL_PIXELS) return undefined;
      return c.toDataURL('image/png') || undefined;
    }
    if (tag === 'video') {
      const v = el as HTMLVideoElement;
      if (v.readyState >= 2 && v.videoWidth && v.videoWidth * v.videoHeight <= MAX_STILL_PIXELS) {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')?.drawImage(v, 0, 0);
        return c.toDataURL('image/jpeg', 0.8);
      }
      return v.poster || undefined;
    }
  } catch {
    /* tainted canvas / cross-origin video: placeholder it is */
  }
  return undefined;
}

/** Walk the live DOM and flatten it into an ordered list of "build tasks". */
export function snapshot(opts: SnapshotOptions = {}): Task[] {
  const max = opts.maxTasks ?? DEFAULT_MAX_TASKS;
  const out: Task[] = [];
  let order = 0;
  let cur: RectTask | null = null;
  const sx = window.scrollX;
  const sy = window.scrollY;
  // Nothing is written to the DOM while we walk it, so style and geometry can be read once per element.
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const rects = new WeakMap<Element, DOMRect>();
  const styleOf = (el: Element): CSSStyleDeclaration => {
    let v = styles.get(el);
    if (!v) styles.set(el, (v = getComputedStyle(el)));
    return v;
  };
  const rectOf = (el: Element): DOMRect => {
    let v = rects.get(el);
    if (!v) rects.set(el, (v = el.getBoundingClientRect()));
    return v;
  };

  const visit = (el: Element): void => {
    if (out.length > max || el.hasAttribute('data-swarm')) return;
    if (opts.exclude && el.matches(opts.exclude)) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.includes(tag)) return;
    const cs = styleOf(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const r = rectOf(el);
    const b: Box = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height };
    const ok = b.w >= 1 && b.h >= 1;
    let mine: RectTask | null = null;

    if (ok && MEDIA_TAGS.includes(tag)) {
      out.push({ kind: 'media', tag: tag as MediaTag, b, node: el, cs: pick(cs, MEDIA_PROPS), color: cs.color, src: stillFrame(el, tag), parent: cur, order: order++, key: 0 });
      return;
    }

    if (ok && el !== document.body && el !== document.documentElement) {
      const hasBg = !isTransparent(cs.backgroundColor) || !isNone(cs.backgroundImage);
      const sides = SIDES.filter((q) => parseFloat(cs[`border${q}Width`]) > 0 && cs[`border${q}Style`] !== 'none');
      const noShadow = isNone(cs.boxShadow);
      if (sides.length === 1 && !hasBg && noShadow) {
        // one-sided border -> pen-tool line
        const q = sides[0];
        const lw = parseFloat(cs[`border${q}Width`]);
        const h2 = lw / 2;
        const pts: [number, number, number, number] =
          q === 'Top' ? [b.x, b.y + h2, b.x + b.w, b.y + h2]
          : q === 'Bottom' ? [b.x, b.y + b.h - h2, b.x + b.w, b.y + b.h - h2]
          : q === 'Left' ? [b.x + h2, b.y, b.x + h2, b.y + b.h]
          : [b.x + b.w - h2, b.y, b.x + b.w - h2, b.y + b.h];
        out.push({ kind: 'line', b, pts, lw, color: cs[`border${q}Color`], parent: cur, order: order++, key: 0 });
      } else if (hasBg || sides.length > 0 || !noShadow) {
        mine = { kind: 'rect', b, cs: pick(cs, RECT_PROPS), parent: cur, order: order++, key: 0 };
        out.push(mine);
      }
    }

    const kids = childrenOf(el);
    const ownText = nodesOf(el).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    const inlineOnly = kids.every((k) => {
      const d = styleOf(k).display;
      return d.startsWith('inline') || d === 'contents' || k.tagName === 'BR';
    });
    if (ok && ownText && inlineOnly) {
      const style = pick(cs, TEXT_PROPS);
      if (!kids.length && (tag === 'button' || cs.display.includes('flex'))) {
        style.display = 'flex';
        style.alignItems = 'center';
        style.justifyContent = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'flex-end' : 'flex-start';
      }
      out.push({ kind: 'text', b, html: htmlOf(el), cs: style, parent: cur, order: order++, key: 0 });
      return;
    }

    const prev = cur;
    if (mine) cur = mine;
    // Repeated siblings (>= 3 of the same shape) -> first is built, the rest are Alt-dragged copies.
    const sig = (k: Element): string => {
      const q = rectOf(k);
      return `${k.tagName}|${k.getAttribute('class') ?? ''}|${Math.round(q.width / 4)}|${Math.round(q.height / 4)}`;
    };
    const sigs = kids.map(sig);
    const counts: Record<string, number> = {};
    const masters: Record<string, Task> = {};
    for (const g of sigs) counts[g] = (counts[g] ?? 0) + 1;
    kids.forEach((k, i) => {
      const g = sigs[i];
      const i0 = out.length;
      visit(k);
      if (counts[g] < 3 || out.length === i0) return;
      if (!masters[g]) masters[g] = out[i0];
      else out[i0].dupFrom = masters[g].b;
    });
    cur = prev;
  };

  visit(document.body);

  for (const t of out) t.key = Math.max(t.b.y, t.parent ? t.parent.key : -1e9); // a child never sorts before its parent
  out.sort((a, b) => a.key - b.key || a.order - b.order);

  // texts sharing a left edge -> the first one drags a ruler guide there
  const cols: Record<number, TextTask[]> = {};
  for (const t of out) {
    if (t.kind === 'text' && t.b.x > 20) (cols[Math.round(t.b.x)] ||= []).push(t);
  }
  for (const g of Object.values(cols)) if (g.length >= 3) g[0].guideX = g[0].b.x;

  return out;
}
