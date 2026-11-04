export type StyleBag = Record<string, string>;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Text shown in the toolbar. Override any subset via `SwarmOptions.labels`. */
export interface Labels {
  tour: string;
  autoScroll: string;
  ready: string;
  building: (percent: number) => string;
  done: string;
  replay: string;
  goLive: string;
  sound: string;
  close: string;
  /** Shown next to the sound button while the browser keeps audio locked. */
  tapForSound: string;
  preparing: string;
}

export interface SwarmOptions {
  /** Number of cursors that start building. Default 6. */
  agents?: number;
  /** Animation speed multiplier (1, 2, 3 in the toolbar). Default 1. */
  speed?: number;
  /** Play the pentatonic build sounds. Default true. */
  sound?: boolean;
  /** Spark bursts. Default: off when the user prefers reduced motion. */
  fx?: boolean;
  /** Cursor names, cycled. Only visible with `showNames`. */
  names?: string[];
  /** Show a name tag on each cursor. Default false (tags then appear only for size / distance readouts). */
  showNames?: boolean;
  /** Cursor colors (any CSS color), cycled. */
  colors?: string[];
  /** Scroll the page once (hidden) first so lazy images / reveal-on-scroll content exist. Default true. */
  prime?: boolean;
  /** Start with the auto-scroll tour already running. Default false. */
  tour?: boolean;
  /** Seed for cursor motion, so a take can be repeated (screen recordings, tests). */
  seed?: number;
  /** Hard cap on how many page elements are rebuilt. Default 1500. */
  maxTasks?: number;
  /** CSS selector of elements to leave out (their subtree is skipped). */
  exclude?: string;
  /** Toolbar text. */
  labels?: Partial<Labels>;
  /** Called with a 0..1 value every time one more element has been rebuilt. */
  onProgress?: (progress: number) => void;
  /** Called once when every element has been rebuilt. */
  onFinish?: () => void;
  /** Called once when the overlay is removed (Esc, close button, `stop()`, "Go live"). */
  onStop?: () => void;
}

export type SwarmOutcome = 'finished' | 'stopped';

export interface SwarmHandle {
  /** Remove the overlay and stop all timers. Safe to call more than once. */
  stop(): void;
  /** Resolves with `'finished'` when the page is fully rebuilt, or `'stopped'` if it was closed first. */
  done: Promise<SwarmOutcome>;
}

/* ---- internal ---- */

export interface TaskBase {
  b: Box;
  parent: RectTask | null;
  order: number;
  /** Sort key: top edge, but never earlier than the parent's key. */
  key: number;
  done?: boolean;
  /** Set when a repeated sibling should be Alt-dragged from this master box. */
  dupFrom?: Box;
  /** Set on the first text of a shared left edge: a ruler guide is dragged there first. */
  guideX?: number;
}

export interface LineTask extends TaskBase {
  kind: 'line';
  pts: [number, number, number, number];
  lw: number;
  color: string;
}

export interface RectTask extends TaskBase {
  kind: 'rect';
  cs: StyleBag;
}

export type MediaTag = 'img' | 'video' | 'canvas' | 'svg';

export interface MediaTask extends TaskBase {
  kind: 'media';
  tag: MediaTag;
  node: Element;
  cs: StyleBag;
  color: string;
  /** Still frame for canvas / video (data URL or poster), when it could be read. */
  src?: string;
}

export interface TextTask extends TaskBase {
  kind: 'text';
  html: string;
  cs: StyleBag;
}

export type Task = LineTask | RectTask | MediaTask | TextTask;
