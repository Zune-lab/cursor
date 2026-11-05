import { IC } from './icons';
import { CSS } from './styles';
import type { Labels } from './types';
import { esc } from './util';

export const DEFAULT_LABELS: Labels = {
  tour: 'Tour',
  autoScroll: 'Auto-scroll',
  ready: 'Ready',
  building: (p) => `Building ${p}%`,
  done: 'Done',
  replay: 'Replay',
  goLive: 'Go live',
  helping: 'Helping',
  sound: 'Sound',
  close: 'Close',
  tapForSound: 'Tap for sound',
  preparing: 'Preparing…',
};

/** The overlay: host element + shadow root + toolbar. No animation logic lives here. */
export class Ui {
  readonly host: HTMLDivElement;
  readonly layer: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly ruler: HTMLDivElement;
  private readonly prog: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly bar: HTMLElement;
  private fav: HTMLImageElement | null = null;
  private soundOn = true;
  private locked = false;

  /** Section mode: the overlay only covers this box (document coordinates); `layer` still uses page coordinates. */
  private region: { x: number; y: number; w: number; h: number } | null;

  constructor(bg: string, width: number, height: number, private readonly L: Labels, region: { x: number; y: number; w: number; h: number } | null = null) {
    this.region = region;
    const host = document.createElement('div');
    host.setAttribute('data-swarm', '');
    Object.assign(host.style, {
      position: 'absolute', left: `${region?.x ?? 0}px`, top: `${region?.y ?? 0}px`, width: `${region?.w ?? width}px`, height: `${region?.h ?? height}px`,
      zIndex: '2147483646', background: bg, opacity: '0', transition: 'opacity .5s',
      overflow: 'hidden', // cursors / selection boxes near the edge must never enlarge the page
    });
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML =
      `<style>${CSS}</style><div class="layer" aria-hidden="true"></div><canvas class="fx" aria-hidden="true"></canvas>` +
      `<div class="ruler"></div><div class="prog"></div>` +
      `<div class="bar" role="toolbar" aria-label="Swarm controls">` +
      `<button data-a="tour" title="${esc(L.autoScroll)}">${IC.play}<span>${esc(L.tour)}</span></button><span class="sep"></span>` +
      `<span class="seg"><button data-a="s1" class="on">1×</button><button data-a="s2">2×</button><button data-a="s3">3×</button></span>` +
      `<span class="st" role="status" aria-live="polite">${esc(L.ready)}</span>` +
      `<button data-a="re" style="display:none">${esc(L.replay)}</button><button data-a="live" class="pri" style="display:none">${esc(L.goLive)}</button>` +
      `<button data-a="snd" aria-label="${esc(L.sound)}" title="${esc(L.sound)} (M)">${IC.on}</button>` +
      `<button data-a="x" aria-label="${esc(L.close)}" title="${esc(L.close)} (Esc)">${IC.x}</button></div>`;
    this.host = host;
    this.layer = sh.querySelector('.layer') as HTMLDivElement;
    this.canvas = sh.querySelector('.fx') as HTMLCanvasElement;
    this.ruler = sh.querySelector('.ruler') as HTMLDivElement;
    this.prog = sh.querySelector('.prog') as HTMLDivElement;
    this.status = sh.querySelector('.st') as HTMLElement;
    this.bar = sh.querySelector('.bar') as HTMLElement;
    this.fitLayer(width, height);
  }

  /** In section mode the layer is as big as the page and shifted back, so page coordinates keep working inside the clipped host. */
  private fitLayer(pageW: number, pageH: number): void {
    if (!this.region) return;
    Object.assign(this.layer.style, {
      inset: 'auto', left: `${-this.region.x}px`, top: `${-this.region.y}px`, width: `${pageW}px`, height: `${pageH}px`,
    });
  }

  /** Section mode: follow the section if it grew or moved (lazy content, images loading). */
  setRegion(box: { x: number; y: number; w: number; h: number }, pageW: number, pageH: number): void {
    if (!this.region) return;
    this.region = box;
    Object.assign(this.host.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
    this.fitLayer(pageW, pageH);
  }

  /** Delegated click on the toolbar: `cb(action, button)`. */
  onAction(cb: (action: string, btn: HTMLElement) => void): void {
    this.bar.onclick = (e) => {
      const btn = (e.target as Element | null)?.closest?.('button') as HTMLElement | null;
      const a = btn?.dataset.a;
      if (btn && a) cb(a, btn);
    };
  }

  private btn(a: string): HTMLElement {
    return this.bar.querySelector(`[data-a=${a}]`) as HTMLElement;
  }

  setProgress(p: number): void {
    this.prog.style.width = `${p * 100}%`;
    this.status.textContent = p >= 1 ? this.L.done : this.L.building(Math.round(p * 100));
  }

  fadeProgress(): void {
    this.prog.style.opacity = '0';
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    this.renderSound();
  }

  /** Browser keeps audio locked until a gesture: show a hint next to the speaker. */
  setSoundLocked(locked: boolean): void {
    this.locked = locked;
    this.renderSound();
  }

  private renderSound(): void {
    const hint = this.soundOn && this.locked ? `<span class="lock">${esc(this.L.tapForSound)}</span>` : '';
    this.btn('snd').innerHTML = (this.soundOn ? IC.on : IC.off) + hint;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  resizeTo(width: number, height: number): void {
    if (this.region) return this.fitLayer(width, height); // section mode: the host keeps the section's box
    this.host.style.width = `${width}px`;
    this.host.style.height = `${height}px`;
  }

  /** The site's favicon, shown while the cursors orbit it. */
  showFavicon(src: string): void {
    const img = document.createElement('img');
    img.className = 'fav';
    img.alt = '';
    img.src = src;
    img.onerror = () => img.remove();
    this.host.shadowRoot!.appendChild(img);
    this.fav = img;
  }

  hideFavicon(): void {
    const f = this.fav;
    if (!f) return;
    f.classList.add('gone');
    setTimeout(() => f.remove(), 600);
    this.fav = null;
  }

  setTour(on: boolean): void {
    const b = this.btn('tour');
    b.classList.toggle('on', on);
    b.innerHTML = `${on ? IC.pause : IC.play}<span>${esc(this.L.tour)}</span>`;
  }

  setSpeed(a: string): void {
    this.bar.querySelectorAll('[data-a^=s]').forEach((x) => {
      const el = x as HTMLElement;
      if (/^s\d$/.test(el.dataset.a ?? '')) el.classList.toggle('on', el.dataset.a === a);
    });
  }

  showFinished(): void {
    this.btn('live').style.display = '';
    this.btn('re').style.display = '';
    this.btn('tour').style.display = 'none';
  }

  setRuler(visible: boolean): void {
    this.ruler.style.opacity = visible ? '1' : '0';
  }
}
