# swarm-cursors

Blank the page, then a swarm of fake multiplayer cursors rebuilds it live: drag-drawn boxes, typed text,
revealed images, pen-tool lines, ruler guides, Alt-drag copies of repeated cards, pentatonic sound and sparks —
until the page looks like itself again. Zero runtime dependencies, ~25 kB minified, UI isolated in a shadow root.

## Install / use

**Drop-in script** (same as before — `window.SwarmCursors`):

```html
<script src="swarm-cursors.min.js" data-auto></script>
```

| attribute | effect |
|---|---|
| `data-auto` | start on page load |
| `data-hotkey="off"` | disable <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> |
| `data-agents="8"` `data-speed="2"` | initial options |
| `data-sound="off"` `data-fx="off"` | mute / no sparks |
| `data-exclude=".ads, #cookie"` | CSS selector of things to leave out |
| `data-labels='{"tour":"Tham quan"}'` | toolbar text (JSON, any subset) |

**ES module / bundler** (SSR-safe: importing never touches `window`):

```ts
import { start, stop, bindHotkey, type SwarmOptions } from 'swarm-cursors';

const run = start({ agents: 6, speed: 1, onProgress: (p) => console.log(p) });
await run.done;            // 'finished' | 'stopped'
run.stop();

const unbind = bindHotkey(() => ({ sound: false })); // Alt+Shift+S
```

## Options

| option | default | |
|---|---|---|
| `agents` | `6` | cursors that start building (fast scrolling summons up to 6 more) |
| `speed` | `1` | speed multiplier |
| `tour` | `false` | start with the auto-scroll tour already running (<kbd>Space</kbd> toggles it) |
| `seed` | – | makes cursor motion reproducible (screen recordings, tests) |
| `sound` | `true` | WebAudio build sounds (toggle with <kbd>M</kbd>) |
| `fx` | `!prefers-reduced-motion` | spark bursts |
| `colors` | built-ins | cycled per cursor |
| `showNames`, `names` | `false` | show a name tag on every cursor (`names` are cycled) |
| `maxTasks` | `1500` | cap on rebuilt elements |
| `prime` | `true` | scroll the page once (hidden) first so lazy images / reveal-on-scroll content exist |
| `exclude` | – | CSS selector to skip |
| `labels` | English | toolbar strings (`tour`, `preparing`, `tapForSound`, …); `building` is `(percent) => string` |
| `onProgress`, `onFinish`, `onStop` | – | callbacks |

<kbd>Esc</kbd> closes, <kbd>M</kbd> toggles sound, <kbd>Space</kbd> toggles the tour, "Go live" fades the overlay out.

## Chrome extension

`npm run build` also writes an unpacked MV3 extension to `dist/extension/` (permissions: `activeTab`, `scripting` only).
`chrome://extensions` -> Developer mode -> **Load unpacked** -> pick `dist/extension`. Click the toolbar icon or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on any page. Chrome's own pages, the Web Store and the PDF viewer can't be scripted (badge shows ×).

## What's in 2.1

- **Intro**: the page dissolves while the cursors orbit the site's favicon; a hidden scroll pass wakes lazy content, then the swarm fans out.
- **Snapshot** enters open shadow roots and resolves `<slot>`s; `backdrop-filter` and background clip/origin are kept;
  `<canvas>` and `<video>` become still frames when the browser allows reading them (video falls back to its poster).
- **Sound** (all synthesized): keyboard click + thock (deeper on space), mouse press, guide snap, headings tick up in pitch,
  glass-piano notes quantised to an eighth-note grid, swell / arpeggio / finish chord / go-live sweep, and a "Tap for sound" hint when the browser blocks audio.
- Blinking caret while text is typed; installable as a Chrome extension; loading the bundle twice no longer double-binds the hotkey.

Known limits: bare text slotted into a web component is skipped (elements are fine); inner scroll containers are rebuilt only for the part inside the page's own scroll;
pseudo-elements (`::before` / `::after`) are not rebuilt.

## Performance notes

- Snapshot reads computed style and geometry once per element (a 180-element sample went from 242 / 541 reads to 181 / 181).
- One `requestAnimationFrame` pump drives the tour and the "scrolling fast -> more cursors" check (two `setInterval`s before); the tour is time-based, so it is frame-rate independent.
- The spark canvas only runs while sparks are alive; typing only touches the DOM when a new character appears.
- The overlay layer uses CSS containment, and everything off-screen is clipped by the host.

## Credits

The idea comes from **Swarm** by Joel Califa ([site](https://califa.github.io/swarm-site/), [source](https://github.com/califa/swarm-site))
and the **Swarm Rebuild** extension by Dhvanil Patel, which points the effect at any page. Neither repo ships a license, and no code
from either is included here: the 2.1 features were written independently from their public descriptions. Please go look at the originals.

## Project layout

```
src/
  index.ts      public API: start / stop / isRunning / bindHotkey
  global.ts     IIFE entry: window.SwarmCursors + <script data-*> options
  swarm.ts      one run: intro orbit, queue, agents, tools (pen, guide, drag-copy, typing)
  prime.ts      hidden scroll pass for lazy content
  snapshot.ts   live DOM  ->  ordered list of build tasks
  cursor.ts     arrow / crosshair / caret + name tag
  flock.ts      boids (separation, alignment, orbit)
  audio.ts      WebAudio synth
  fx.ts         spark canvas
  ui.ts         shadow-DOM overlay and toolbar   (styles.ts, icons.ts)
  types.ts, constants.ts, util.ts, version.ts
test/           vitest + jsdom (unit, snapshot, lifecycle, full run, SSR import)
extension/      MV3 manifest + background (copied into dist/extension)
demo/index.html
```

## Develop

```bash
npm i
npm test            # vitest
npm run typecheck   # tsc --noEmit (strict)
npm run build       # esbuild -> dist/ + bundled index.d.ts
npm run dev         # esbuild watch + dev server: http://localhost:5173/demo/ (auto-reloads on save)
```

Build output: `dist/swarm-cursors.js` (IIFE), `.min.js` (+ map), `.mjs` (ESM), `index.d.ts`.
Open `demo/index.html` after building.

## What changed from 1.x

- TypeScript (strict), split into modules, one `index.d.ts`.
- `start()` returns `{ stop, done }`; new options `names`, `colors`, `maxTasks`, `exclude`, `labels`, callbacks.
- Replay keeps all your options (it used to keep only `agents` and `speed`).
- Pressing <kbd>M</kbd> while typing in a form field no longer toggles sound.
- Copies of page markup are sanitized (no `on*` handlers / scripts re-run inside the overlay); SVGs are cloned, not re-parsed.
- A single failing element can no longer stall the whole swarm.
- AudioContext is closed on stop; missing WebAudio / `matchMedia` / canvas is handled.
- Repeated-sibling detection works for SVG elements (class was `[object SVGAnimatedString]`).
- Toolbar status is an `aria-live` region; the decorative layer is `aria-hidden`.
