import { pick, type PickOptions } from './picker';
import { Swarm } from './swarm';
import type { SwarmHandle, SwarmOptions } from './types';
import { VERSION } from './version';

export type { Labels, SwarmHandle, SwarmOptions, SwarmOutcome } from './types';
export { pick, type PickOptions } from './picker';
export { VERSION } from './version';

let current: Swarm | null = null;

/** Blank the page and let the swarm rebuild it. Replaces any run already in progress. */
export function start(opts: SwarmOptions = {}): SwarmHandle {
  if (typeof document === 'undefined') throw new Error('swarm-cursors needs a browser (document is undefined)');
  stop();
  const swarm: Swarm = new Swarm(opts, {
    replay: (o) => void start(o),
    disposed: () => { if (current === swarm) current = null; },
  });
  current = swarm;
  return { stop: () => swarm.stop(), done: swarm.done };
}

/**
 * Let the user click the section to rebuild, then run the swarm on it (picking `<body>` means the whole page).
 * Resolves with the handle, or null if the pick was cancelled. A run in progress is stopped first.
 */
export async function pickAndStart(opts: SwarmOptions & PickOptions = {}): Promise<SwarmHandle | null> {
  stop();
  const { hint, ...rest } = opts;
  const el = await pick({ hint });
  if (!el) return null;
  return start(el === document.body ? { ...rest, target: undefined } : { ...rest, target: el });
}

export function stop(): void {
  current?.stop();
}

export function isRunning(): boolean {
  return current !== null;
}

/**
 * Alt+Shift+S toggles the effect, Alt+Shift+P lets you click the section to rebuild. Returns a function that removes the listener.
 * `getOptions` is evaluated on every start so callers can keep options in sync.
 */
export function bindHotkey(getOptions: () => SwarmOptions = () => ({})): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.altKey && e.shiftKey && e.code === 'KeyS') {
      e.preventDefault();
      if (isRunning()) stop();
      else start(getOptions());
    } else if (e.altKey && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault();
      void pickAndStart(getOptions());
    }
  };
  addEventListener('keydown', onKey);
  return () => removeEventListener('keydown', onKey);
}

export const SwarmCursors = { start, stop, isRunning, bindHotkey, pick, pickAndStart, version: VERSION };
export default SwarmCursors;
