# swarm-cursors

Blank the page, then a swarm of fake multiplayer cursors rebuilds it live: drag-drawn boxes, typed text,
revealed images, pen-tool lines, ruler guides, Alt-drag copies of repeated cards, pentatonic sound and sparks —
until the page looks like itself again. Zero runtime dependencies, ~35 kB minified, UI isolated in a shadow root.

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
| `data-sound="off"` `data-fx="off"` `data-eggs="off"` | mute / no sparks / no easter eggs |
| `data-trigger="query"` | start only when the URL has `?swarm` |
| `data-exclude=".ads, #cookie"` | CSS selector of things to leave out |
| `data-max-tasks="5000"` `data-prime="off"` `data-tour="on"` | cap on rebuilt elements / skip the hidden scroll pass / start touring |
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
| `agents` | `6` (`4` under 640px) | cursors that start building (fast scrolling summons up to 6 more) |
| `speed` | `1` | speed multiplier |
| `tour` | `false` | start with the auto-scroll tour already running (<kbd>Space</kbd> toggles it) |
| `seed` | – | makes cursor motion reproducible (screen recordings, tests) |
| `sound` | `true` | WebAudio build sounds (toggle with <kbd>M</kbd>) |
| `easterEggs` | `true` | occasional heart / ring / wave when the swarm is idle |
| `fx` | `!prefers-reduced-motion` | spark bursts |
| `colors` | built-ins | cycled per cursor |
| `showNames`, `names` | `false` | show a name tag on every cursor (`names` are cycled) |
| `maxTasks` | `20000` | cap on rebuilt elements (the page is scanned lazily, so this is only a safety net) |
| `prime` | `true` | scroll the first few screens once (hidden) so lazy images / reveal-on-scroll content exist; the rest wakes up as you scroll |
| `exclude` | – | CSS selector to skip |
| `labels` | English | toolbar strings (`tour`, `preparing`, `tapForSound`, …); `building` is `(percent) => string` |
| `onProgress`, `onFinish`, `onStop` | – | callbacks |

<kbd>Esc</kbd> closes, <kbd>M</kbd> toggles sound, <kbd>Space</kbd> toggles the tour, "Go live" fades the overlay out.

## Chrome extension

`npm run build` also writes an unpacked MV3 extension to `dist/extension/` (permissions: `activeTab`, `scripting` only).
`chrome://extensions` -> Developer mode -> **Load unpacked** -> pick `dist/extension`. Click the toolbar icon or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on any page. Chrome's own pages, the Web Store and the PDF viewer can't be scripted (badge shows ×).

## What's in 2.4

- **Idle cursors follow your mouse** (the same swirl that closes the show) instead of wandering, any time they have nothing to build.
- **Easter eggs**: once in a while, when the swarm has been idle and quiet for a while, the cursors pull off a small trick around your mouse
  (a beating heart, a fast ring, or a wave). `easterEggs: false` / `data-eggs="off"` turns them off.
- **Scrolled past = appears at once**: anything you scroll well beyond before a cursor got to it is placed instantly (no animation), so fast
  scrolling never leaves holes behind. Capped per frame so it stays smooth.
- **`?swarm` trigger**: `<script src="swarm-cursors.min.js" data-trigger="query">` starts only on URLs that contain `?swarm`.
- Fewer cursors by default on phones (4 instead of 6).

## What's in 2.3 (big pages)

- **Band scanning**: the page is no longer snapshotted in one go. Only the part around the viewer (plus about two screens ahead) is
  scanned, one band per frame, and the next band is scanned as you scroll or the tour moves. A huge page costs a few milliseconds per
  frame instead of one long freeze, and nothing is cut off at the bottom any more (the old 1500-element cap is now 20000 in total).
- **Scroll-driven**: an element is drawn only once the viewer has scrolled to it (bottom edge of the viewport). Press Tour / Space for auto-scroll.
- **Progress** is estimated from the part of the page scanned so far; it never goes backwards and reaches 100% only when the whole page is built.
- **Hidden scroll pass** stops a few screens below the viewer instead of burning its whole 2.5 s on the top of a very long page.
- **Fixed / sticky headers and banners** are drawn at the top of the page, where they sit when you start reading.
- **Scroll containers** (`overflow: auto | scroll | hidden`) only rebuild what they actually show; content scrolled out of the box is no longer
  drawn on top of the rest of the page.
- **Same-origin iframes** are rebuilt from their own document; cross-origin ones become a neutral placeholder.
- **Bare text slotted into a web component** is kept.
- Repeated cards far from their master become a new master instead of a very long Alt-drag.
- Speed: no forced layout per element in the run loop (viewport is cached from scroll/resize events), style/geometry reads skipped for
  subtrees outside the band, fewer allocations while walking, and elements are never emitted twice when layout shifts.

## What's in 2.1

- **Intro**: the page dissolves while the cursors orbit the site's favicon; a hidden scroll pass wakes lazy content, then the swarm fans out.
- **Snapshot** enters open shadow roots and resolves `<slot>`s; `backdrop-filter` and background clip/origin are kept;
  `<canvas>` and `<video>` become still frames when the browser allows reading them (video falls back to its poster).
- **Sound** (all synthesized): keyboard click + thock (deeper on space), mouse press, guide snap, headings tick up in pitch,
  glass-piano notes quantised to an eighth-note grid, swell / arpeggio / finish chord / go-live sweep, and a "Tap for sound" hint when the browser blocks audio.
- Blinking caret while text is typed; installable as a Chrome extension; loading the bundle twice no longer double-binds the hotkey.

Known limits: pseudo-elements (`::before` / `::after`) are not rebuilt; cross-origin iframes are a placeholder; sticky elements are drawn where they were when the
band was scanned; content that moves a lot after it was scanned (late-loading images above it) can end up slightly off.

## Performance notes

- Snapshot reads computed style and geometry once per element, and only for the band being scanned (a 180-element sample went from 242 / 541 reads to 181 / 181).
- One `requestAnimationFrame` pump drives the tour and the "scrolling fast -> more cursors" check (two `setInterval`s before); the tour is time-based, so it is frame-rate independent.
- The spark canvas only runs while sparks are alive; typing only touches the DOM when a new character appears.
- The overlay layer uses CSS containment, and everything off-screen is clipped by the host.

## Ideas, and where they came from

Nothing here is copied. Joel Califa's Swarm site is published as a built bundle with no license, so ideas come from the public descriptions of it
and of the projects it inspired. Worth looking at: the original, [Swarm Rebuild](https://github.com/DhvanilPatel/swarm-cursors),
[DA Swarm](https://github.com/decio-afs/da-swarm) (scrolled-past content appears at once, `?swarm` trigger),
[Swarm-Rebuild by MaximeBoulle](https://github.com/MaximeBoulle/Swarm-Rebuild) (scoped / on-scroll-into-view triggers).
Ideas not built yet: a dashed "blueprint" for blocks still waiting for a cursor, pausing in background tabs, a media-only screenshot to fill
canvases / videos the page won't let us read, and starting the effect on one section instead of the whole page.

## Credits

The idea comes from **Swarm** by Joel Califa ([site](https://califa.github.io/swarm-site/), [source](https://github.com/califa/swarm-site))
and the **Swarm Rebuild** extension by Dhvanil Patel, which points the effect at any page. Neither repo ships a license, and no code
from either is included here: the 2.1 features were written independently from their public descriptions. Please go look at the originals.

## Project layout

```
src/
  egg.ts        easter-egg shapes (heart / ring / wave)
  index.ts      public API: start / stop / isRunning / bindHotkey
  global.ts     IIFE entry: window.SwarmCursors + <script data-*> options
  swarm.ts      one run: intro orbit, queue, agents, tools (pen, guide, drag-copy, typing)
  prime.ts      hidden scroll pass for lazy content
  snapshot.ts   live DOM  ->  build tasks, one band of the page per scan (Scanner); snapshot() = the whole page
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
