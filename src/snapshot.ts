import { DEFAULT_MAX_TASKS, MEDIA_PROPS, MEDIA_TAGS, RECT_PROPS, SIDES, SKIP_TAGS, TEXT_PROPS } from './constants';
import type { Box, MediaTag, RectTask, StyleBag, Task, TextTask } from './types';
import { esc, isNone, isTransparent, pick } from './util';

export interface SnapshotOptions {
  maxTasks?: number;
  exclude?: string;
}

const SKIP = new Set(SKIP_TAGS);
const MEDIA = new Set(MEDIA_TAGS);
const CLIPS = new Set(['hidden', 'scroll', 'auto', 'clip']);
const CLIP_WORD = /hidden|scroll|auto|clip/;
const clipsContent = (cs: CSSStyleDeclaration): boolean => CLIPS.has(cs.overflowX) || CLIPS.has(cs.overflowY) || CLIP_WORD.test(cs.overflow);
const BORDER_W = SIDES.map((s) => `border${s}Width`);
const BORDER_S = SIDES.map((s) => `border${s}Style`);
const BORDER_C = SIDES.map((s) => `border${s}Color`);
/** A repeated sibling further than this from its master becomes a new master (the cursor would travel too far). */
const DUP_REACH = 1200;
const MAX_STILL_PIXELS = 4_000_000;

/** Where a subtree is drawn: document offset of the current frame, offset used by `position: fixed`, and the clipping box. */
interface Ctx {
  ox: number;
  oy: number;
  fx: number;
  fy: number;
  clip: Box | null;
}

const overlaps = (a: Box, c: Box): boolean => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;

function intersect(a: Box, c: Box): Box {
  const x = Math.max(a.x, c.x);
  const y = Math.max(a.y, c.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, c.x + c.w) - x), h: Math.max(0, Math.min(a.y + a.h, c.y + c.h) - y) };
}

const isSlot = (el: Element): boolean => typeof HTMLSlotElement !== 'undefined' && el instanceof HTMLSlotElement;

/** Render children: open shadow roots are entered, and <slot>s resolve to what is slotted in. */
function childrenOf(el: Element): Element[] {
  if (isSlot(el)) {
    const a = (el as HTMLSlotElement).assignedElements({ flatten: true });
    return a.length ? a : Array.from(el.children);
  }
  return Array.from((el.shadowRoot ?? el).children);
}

/** Render child nodes (text included): shadow root content, slotted nodes, or plain children. */
function nodesOf(el: Element): Node[] {
  if (isSlot(el)) {
    const a = (el as HTMLSlotElement).assignedNodes({ flatten: true });
    return a.length ? a : Array.from(el.childNodes);
  }
  return Array.from((el.shadowRoot ?? el).childNodes);
}

function hasOwnText(el: Element): boolean {
  if (el.shadowRoot || isSlot(el)) return nodesOf(el).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true;
  return false;
}

/** innerHTML of the element, or of what it renders (shadow root / slotted nodes). */
function htmlOf(el: Element): string {
  if (!el.shadowRoot && !isSlot(el)) return el.innerHTML;
  return nodesOf(el).map((n) => (n.nodeType === 1 ? (n as Element).outerHTML : n.nodeType === 3 ? esc(n.textContent ?? '') : '')).join('');
}

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
        const c = el.ownerDocument.createElement('canvas');
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

/**
 * Turns the live DOM into build tasks, one horizontal band of the page at a time.
 *
 * A band scan only walks the part of the tree that touches the band, so a huge page costs a few
 * milliseconds per band instead of one long freeze. State is kept between scans (what was already
 * emitted, parent boxes, repeat masters), so scanning band after band yields each element once.
 */
export class Scanner {
  private readonly max: number;
  private count = 0;
  private order = 0;
  /** Elements that already produced a task (never emitted twice, even if layout shifts). */
  private readonly emitted = new WeakSet<Element>();
  /** Elements whose task is final: text / media. Revisits return immediately. */
  private readonly leaf = new WeakSet<Element>();
  /** Box tasks, so children found in a later band still link to their parent. */
  private readonly made = new WeakMap<Element, RectTask>();
  /** Repeat masters per parent, so a later band can still Alt-drag copies of an earlier card. */
  private readonly masters = new WeakMap<Element, Record<string, Task>>();

  constructor(private readonly opts: SnapshotOptions = {}) {
    this.max = opts.maxTasks ?? DEFAULT_MAX_TASKS;
  }

  /** True once `maxTasks` tasks exist: nothing more will be produced. */
  get capped(): boolean {
    return this.count >= this.max;
  }

  /** Tasks whose top edge is above `bottom`, found by walking only what touches `[top, bottom)`. */
  scan(top = -Infinity, bottom = Infinity): Task[] {
    const out: Task[] = [];
    const { exclude } = this.opts;
    let cur: RectTask | null = null;
    // Nothing is written to the DOM while we walk it, so style and geometry can be read once per element.
    const styles = new WeakMap<Element, CSSStyleDeclaration>();
    const rects = new WeakMap<Element, DOMRect>();
    const styleOf = (el: Element): CSSStyleDeclaration => {
      let v = styles.get(el);
      if (!v) styles.set(el, (v = (el.ownerDocument.defaultView ?? window).getComputedStyle(el)));
      return v;
    };
    const rectOf = (el: Element): DOMRect => {
      let v = rects.get(el);
      if (!v) rects.set(el, (v = el.getBoundingClientRect()));
      return v;
    };
    const full = (): boolean => this.count + out.length >= this.max;
    const inline = (k: Element): boolean => {
      const d = styleOf(k).display;
      return d.startsWith('inline') || d === 'contents' || k.tagName === 'BR';
    };

    const visit = (el: Element, ctx0: Ctx): void => {
      if (full() || this.leaf.has(el) || el.hasAttribute('data-swarm')) return;
      if (exclude && el.matches(exclude)) return;
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(tag)) return;
      const cs = styleOf(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
      // fixed headers / banners are drawn at the top of the page, where they sit when you start reading
      const ctx: Ctx = cs.position === 'fixed' ? { ox: ctx0.fx, oy: ctx0.fy, fx: ctx0.fx, fy: ctx0.fy, clip: ctx0.clip } : ctx0;
      const r = rectOf(el);
      const b: Box = { x: r.left + ctx.ox, y: r.top + ctx.oy, w: r.width, h: r.height };
      const ok = b.w >= 1 && b.h >= 1;
      const doc = el.ownerDocument;
      const isRoot = el === doc.body || el === doc.documentElement;
      if (ok && !isRoot) {
        if (ctx.clip && !overlaps(b, ctx.clip)) return; // scrolled out of its container: not visible, must not be drawn
        if (b.y + b.h <= top || b.y >= bottom) return; // this subtree lives in another band
      }
      const fresh = !this.emitted.has(el);
      let mine: RectTask | null = this.made.get(el) ?? null;

      if (ok && MEDIA.has(tag)) {
        if (fresh) {
          out.push({ kind: 'media', tag: tag as MediaTag, b, node: el, cs: pick(cs, MEDIA_PROPS), color: cs.color, src: stillFrame(el, tag), parent: cur, order: this.order++, key: 0 });
          this.emitted.add(el);
          this.leaf.add(el);
        }
        return;
      }

      if (ok && fresh && !isRoot) {
        const css = cs as unknown as StyleBag;
        const hasBg = !isTransparent(cs.backgroundColor) || !isNone(cs.backgroundImage);
        let nSides = 0;
        let side = 0;
        for (let i = 0; i < 4; i++) {
          if (parseFloat(css[BORDER_W[i]]) > 0 && css[BORDER_S[i]] !== 'none') {
            nSides++;
            side = i;
          }
        }
        const noShadow = isNone(cs.boxShadow);
        if (nSides === 1 && !hasBg && noShadow) {
          // one-sided border -> pen-tool line
          const lw = parseFloat(css[BORDER_W[side]]);
          const h2 = lw / 2;
          const q = SIDES[side];
          const pts: [number, number, number, number] =
            q === 'Top' ? [b.x, b.y + h2, b.x + b.w, b.y + h2]
            : q === 'Bottom' ? [b.x, b.y + b.h - h2, b.x + b.w, b.y + b.h - h2]
            : q === 'Left' ? [b.x + h2, b.y, b.x + h2, b.y + b.h]
            : [b.x + b.w - h2, b.y, b.x + b.w - h2, b.y + b.h];
          out.push({ kind: 'line', b, pts, lw, color: css[BORDER_C[side]], parent: cur, order: this.order++, key: 0 });
          this.emitted.add(el);
        } else if (hasBg || nSides > 0 || !noShadow) {
          mine = { kind: 'rect', b, cs: pick(cs, RECT_PROPS), parent: cur, order: this.order++, key: 0 };
          out.push(mine);
          this.made.set(el, mine);
          this.emitted.add(el);
        }
      }

      // same-origin iframes are rebuilt from their own document, cross-origin ones become a placeholder
      if (tag === 'iframe') {
        if (!ok) return;
        const fr = el as HTMLIFrameElement;
        let inner: Document | null = null;
        try {
          inner = fr.contentDocument;
        } catch {
          /* cross-origin */
        }
        if (inner?.body) {
          const ox = b.x + fr.clientLeft;
          const oy = b.y + fr.clientTop;
          const prev = cur;
          if (mine) cur = mine;
          visit(inner.body, { ox, oy, fx: ox, fy: oy, clip: ctx.clip ? intersect(b, ctx.clip) : b });
          cur = prev;
        } else if (fresh && !this.leaf.has(el)) {
          out.push({ kind: 'media', tag: 'iframe', b, node: el, cs: pick(cs, MEDIA_PROPS), color: cs.color, parent: cur, order: this.order++, key: 0 });
          this.emitted.add(el);
          this.leaf.add(el);
        }
        return;
      }

      const kids = childrenOf(el);
      if (ok && fresh && hasOwnText(el) && kids.every(inline)) {
        const style = pick(cs, TEXT_PROPS);
        if (!kids.length && (tag === 'button' || cs.display.includes('flex'))) {
          style.display = 'flex';
          style.alignItems = 'center';
          style.justifyContent = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'flex-end' : 'flex-start';
        }
        out.push({ kind: 'text', b, html: htmlOf(el), cs: style, parent: cur, order: this.order++, key: 0 });
        this.emitted.add(el);
        this.leaf.add(el);
        return;
      }

      // children of a scroll container / overflow:hidden box are only drawn where the box shows them
      let kidCtx = ctx;
      if (ok && !isRoot && cs.display !== 'inline' && clipsContent(cs)) {
        kidCtx = { ...ctx, clip: ctx.clip ? intersect(b, ctx.clip) : b };
      }

      const prev = cur;
      if (mine) cur = mine;
      if (kids.length < 3) {
        for (const k of kids) visit(k, kidCtx);
      } else {
        // Repeated siblings (>= 3 of the same shape) -> first is built, the rest are Alt-dragged copies.
        const sigs = kids.map((k) => {
          const q = rectOf(k);
          return `${k.tagName}|${k.getAttribute('class') ?? ''}|${Math.round(q.width / 4)}|${Math.round(q.height / 4)}`;
        });
        const counts: Record<string, number> = {};
        for (const g of sigs) counts[g] = (counts[g] ?? 0) + 1;
        let masters = this.masters.get(el);
        if (!masters) this.masters.set(el, (masters = {}));
        kids.forEach((k, i) => {
          const i0 = out.length;
          visit(k, kidCtx);
          const g = sigs[i];
          if (counts[g] < 3 || out.length === i0) return;
          const m = masters[g];
          if (!m || Math.abs(out[i0].b.y - m.b.y) > DUP_REACH) masters[g] = out[i0];
          else out[i0].dupFrom = m.b;
        });
      }
      cur = prev;
    };

    visit(document.body, { ox: window.scrollX, oy: window.scrollY, fx: 0, fy: 0, clip: null });

    for (const t of out) t.key = Math.max(t.b.y, t.parent ? t.parent.key : -1e9); // a child never sorts before its parent
    out.sort((a, b) => a.key - b.key || a.order - b.order);

    // texts sharing a left edge -> the first one drags a ruler guide there
    const cols: Record<number, TextTask[]> = {};
    for (const t of out) {
      if (t.kind === 'text' && t.b.x > 20) (cols[Math.round(t.b.x)] ||= []).push(t);
    }
    for (const g of Object.values(cols)) if (g.length >= 3) g[0].guideX = g[0].b.x;

    this.count += out.length;
    return out;
  }
}

/** The whole page at once (no banding). Handy for tests and small pages. */
export function snapshot(opts: SnapshotOptions = {}): Task[] {
  return new Scanner(opts).scan();
}
