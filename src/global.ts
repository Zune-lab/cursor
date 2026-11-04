/** IIFE entry: exposes `window.SwarmCursors` and reads the <script> data-* attributes. */
import { SwarmCursors, bindHotkey, start } from './index';
import type { Labels, SwarmOptions } from './types';

declare global {
  interface Window {
    SwarmCursors: typeof SwarmCursors;
  }
}

export function optionsFromScript(el: HTMLElement | null): SwarmOptions {
  const o: SwarmOptions = {};
  if (!el) return o;
  const d = el.dataset;
  if (d.agents && +d.agents > 0) o.agents = +d.agents;
  if (d.speed && +d.speed > 0) o.speed = +d.speed;
  if (d.sound === 'off') o.sound = false;
  if (d.fx === 'off') o.fx = false;
  if (d.exclude) o.exclude = d.exclude;
  if (d.labels) {
    try {
      o.labels = JSON.parse(d.labels) as Partial<Labels>;
    } catch {
      console.warn('[swarm-cursors] data-labels is not valid JSON');
    }
  }
  return o;
}

// Injected twice (extension toggled, script included twice)? Keep the first instance.
if (!window.SwarmCursors) {
  window.SwarmCursors = SwarmCursors;
  const me = document.currentScript as HTMLScriptElement | null;
  const opts = optionsFromScript(me);
  if (!(me && me.dataset.hotkey === 'off')) bindHotkey(() => opts);
  if (me && me.hasAttribute('data-auto')) addEventListener('load', () => void start(opts));
}
