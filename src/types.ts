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
  /** Tag of a cursor that steps in to help a busy colleague (the colleague's name follows). */
  helping: string;
}

export interface SwarmOptions {
  /** Number of cursors that start building. Default 6 (4 on a phone); a big page gets more, see `maxAgents`. */
  agents?: number;
  /** Ceiling for the swarm size. With `adaptive`, a bigger page starts with more cursors (about one extra per 150 elements) and more join while a big backlog waits. Default 14 (8 on a phone). */
  maxAgents?: number;
  /** Idle cursors take over chores from busy ones (carrying a typed text frame home) so the busy one can move on. Default true. */
  teamwork?: boolean;
  /** Type some text boxes in an empty spot nearby, then drag the finished frame into place; the rest are typed where they belong. `true` = about 15% of them, a number 0..1 sets the share, `false` = none. Default true. */
  stageText?: boolean | number;
  /** Speed up automatically (up to 3x, and without the text-staging detour) while a big backlog of unlocked work is waiting, so a dense page does not take forever. Default true. */
  adaptive?: boolean;
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
  /** Occasional easter eggs (a heart, a ring, a wave) when the swarm is idle. Default true. */
  easterEggs?: boolean;
  /** Seed for cursor motion, so a take can be repeated (screen recordings, tests). */
  seed?: number;
  /** Hard cap on how many page elements are rebuilt. The page is scanned band by band while you scroll, so the default is high. Default 20000. */
  maxTasks?: number;
  /** Chrome extension only: screenshot canvases / videos / iframes the page won't let us read (those on screen when it starts). Default true. */
  captureMedia?: boolean;
  /** Show a dashed "blueprint" outline for blocks that are unlocked but still waiting for a cursor. Default false. */
  blueprint?: boolean;
  /** Run the effect on one section only: a CSS selector or an element. Only that box is blanked and rebuilt; the rest of the page stays live. */
  target?: string | Element;
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
  /** A cursor has picked this task up (or it was placed without one); the queue skips it. */
  taken?: boolean;
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

export type MediaTag = 'img' | 'video' | 'canvas' | 'svg' | 'iframe';

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
