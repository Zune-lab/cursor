/**
 * Point-and-click chooser for the `target` option: hover to outline an element, click (or Enter) to pick it,
 * ArrowUp / ArrowDown to go to the parent / back to the child, Escape to cancel.
 * Page clicks are swallowed while picking, so choosing a link does not follow it.
 */
export interface PickOptions {
  /** Text of the hint bar at the bottom of the screen. */
  hint?: string;
}

export const DEFAULT_PICK_HINT = 'Click a section · ↑ parent · ↓ child · Esc cancel';
const ACCENT = '#0d99ff';

const STYLE = `
.box{position:fixed;box-sizing:border-box;border:2px solid ${ACCENT};background:rgba(13,153,255,.12);border-radius:2px;display:none}
.tag{position:fixed;font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;background:${ACCENT};color:#fff;padding:3px 6px;border-radius:3px;display:none;white-space:nowrap}
.hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);font:13px/1.2 system-ui,sans-serif;background:#111;color:#fff;padding:8px 12px;border-radius:8px;white-space:nowrap}`;

/** `section#hero.dark 800×400`: enough to tell candidates apart. */
export function describe(el: Element, r: { width: number; height: number }): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls} ${Math.round(r.width)}×${Math.round(r.height)}`;
}

/** Resolves with the chosen element, or null if the user cancelled. */
export function pick(opts: PickOptions = {}): Promise<Element | null> {
  return new Promise((resolve) => {
    const de = document.documentElement;
    const host = document.createElement('div');
    host.setAttribute('data-swarm-pick', '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${STYLE}</style><div class="box"></div><div class="tag"></div><div class="hint"></div>`;
    const box = sh.querySelector('.box') as HTMLElement;
    const tag = sh.querySelector('.tag') as HTMLElement;
    (sh.querySelector('.hint') as HTMLElement).textContent = opts.hint ?? DEFAULT_PICK_HINT;

    let current: Element | null = null;
    let below: Element[] = []; // where ArrowDown goes back to after ArrowUp
    const prevCursor = de.style.cursor;

    const show = (el: Element | null): void => {
      current = el;
      if (!el) {
        box.style.display = tag.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      tag.textContent = describe(el, r);
      tag.style.display = 'block';
      tag.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 160))}px`;
      tag.style.top = `${r.top > 24 ? r.top - 22 : r.top + 4}px`;
    };

    const under = (x: number, y: number): Element | null => {
      const el = document.elementFromPoint?.(x, y) ?? null;
      if (!el || el === de) return document.body;
      return el.closest('[data-swarm],[data-swarm-pick]') ? null : el;
    };

    const finish = (el: Element | null): void => {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('click', onClick, true);
      removeEventListener('keydown', onKey, true);
      removeEventListener('scroll', onScroll, true);
      for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart'] as const) removeEventListener(t, swallow, true);
      de.style.cursor = prevCursor;
      host.remove();
      resolve(el);
    };

    const onMove = (e: MouseEvent): void => {
      below = [];
      show(under(e.clientX, e.clientY));
    };
    const swallow = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent): void => {
      swallow(e);
      const el = current ?? under(e.clientX, e.clientY);
      if (el) finish(el);
    };
    const onScroll = (): void => show(current);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        swallow(e);
        finish(null);
      } else if (e.key === 'Enter' && current) {
        swallow(e);
        finish(current);
      } else if (e.key === 'ArrowUp' && current) {
        swallow(e);
        const p = current.parentElement;
        if (p && p !== de) {
          below.push(current);
          show(p);
        }
      } else if (e.key === 'ArrowDown' && below.length) {
        swallow(e);
        show(below.pop()!);
      }
    };

    de.style.cursor = 'crosshair';
    de.appendChild(host);
    addEventListener('mousemove', onMove, true);
    addEventListener('click', onClick, true);
    addEventListener('keydown', onKey, true);
    addEventListener('scroll', onScroll, true);
    for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart'] as const) addEventListener(t, swallow, true);
  });
}
