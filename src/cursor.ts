import { ALERT } from './constants';
import { clamp } from './util';
import type { Persona } from './persona';

export type CursorMode = 'arrow' | 'cross' | 'text';

/** One fake multiplayer cursor: arrow / crosshair / text caret + a name tag. */
export class Cursor {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  rot = 0;
  readonly name: string;
  readonly col: string;
  /** Set by the swarm; a neutral personality until then. */
  persona: Persona = { pace: 1, likes: 'text', helpful: 0.6, think: 0 };
  private shown: string | null = null; // tag text currently in the DOM
  private shownRot = 0;
  private readonly el: HTMLDivElement;
  private readonly arrow: SVGElement;
  private readonly tag: HTMLDivElement;

  constructor(readonly i: number, parent: HTMLElement, colors: string[], names: string[], private readonly showName = false) {
    this.col = colors[i % colors.length];
    this.name = names[i % names.length];
    const el = document.createElement('div');
    el.className = 'cur';
    el.dataset.m = 'arrow';
    el.innerHTML =
      `<svg class="a" width="16" height="20" viewBox="0 0 16 20"><path d="M1 1v15l4-4 3 7 3-1-3-7h6z" fill="${this.col}" stroke="#fff" stroke-width="1.2"/></svg>` +
      `<svg class="c" width="20" height="20" viewBox="-10 -10 20 20" style="left:-10px;top:-10px"><path d="M-9 0H9M0-9V9" stroke="#fff" stroke-width="3"/><path d="M-9 0H9M0-9V9" stroke="#111" stroke-width="1"/></svg>` +
      `<svg class="t" width="10" height="20" viewBox="-5 -10 10 20" style="left:-5px;top:-10px"><path d="M-3-9h6M0-9v18M-3 9h6" stroke="#111" stroke-width="1.5" fill="none"/></svg>`;
    this.arrow = el.querySelector('.a') as SVGElement;
    this.arrow.style.transformOrigin = '1px 1px';
    this.tag = document.createElement('div');
    this.tag.className = 'tag';
    el.appendChild(this.tag);
    parent.appendChild(el);
    this.el = el;
    this.reset();
  }

  set(x: number, y: number): void {
    const dx = x - this.x;
    this.rot += (clamp(dx * 2.2, -28, 28) - this.rot) * 0.2; // lean into the motion
    this.x = x;
    this.y = y;
    this.el.style.transform = `translate(${x}px,${y}px)`;
    if (Math.abs(this.rot - this.shownRot) >= 0.1) { // an imperceptible lean is not worth a style write every frame
      this.shownRot = this.rot;
      this.arrow.style.transform = `rotate(${this.rot}deg)`;
    }
  }

  mode(m: CursorMode): void {
    this.el.dataset.m = m;
  }

  /** Replace the tag text; `alert` paints it red (distance / guide readouts). */
  say(text: string, alert = false): void {
    this.tag.style.display = '';
    if (this.shown !== text) {
      this.shown = text;
      this.tag.textContent = text;
    }
    if (alert) this.tag.style.background = ALERT;
  }

  /** Back to the resting tag: hidden, or just "<name>" when `showNames` is on. */
  reset(): void {
    this.tag.style.background = this.col;
    this.shown = this.showName ? this.name : '';
    this.tag.textContent = this.shown;
    this.tag.style.display = this.showName ? '' : 'none';
  }

  /** Change only the tag color, keep its text. */
  tint(alert: boolean): void {
    this.tag.style.background = alert ? ALERT : this.col;
  }
}
