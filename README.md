# swarm-cursors

Blank the page, then a swarm of fake multiplayer cursors rebuilds it live: drag-drawn boxes, typed text,
revealed images, pen-tool lines, ruler guides, Alt-drag copies of repeated cards, pentatonic sound and sparks —
until the page looks like itself again. Zero runtime dependencies, ~48 kB minified, UI isolated in a shadow root.

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
| `data-teamwork="off"` | every cursor works alone |
| `data-stage="off"` | type text where it belongs instead of dragging it there afterwards |
| `data-adaptive="off"` | never speed up or add cursors on a dense page (see `adaptive`) |
| `data-max-agents="N"` | most cursors the swarm may grow to on a big page (default 14, 8 on a phone) |
| `data-blueprint="on"` | show the dashed blueprint |
| `data-target="#hero"` | run on one section only (the rest of the page stays live) |
| `data-max-tasks="5000"` `data-prime="off"` `data-tour="on"` | cap on rebuilt elements / skip the hidden scroll pass / start touring |
| `data-labels='{"tour":"Tham quan"}'` | toolbar text (JSON, any subset) |

**ES module / bundler** (SSR-safe: importing never touches `window`):

```ts
import { start, stop, bindHotkey, type SwarmOptions } from 'swarm-cursors';

const run = start({ agents: 6, speed: 1, onProgress: (p) => console.log(p) });
await run.done;            // 'finished' | 'stopped'
run.stop();

const unbind = bindHotkey(() => ({ sound: false })); // Alt+Shift+S toggles, Alt+Shift+P picks a section
```

## Options

| option | default | |
|---|---|---|
| `agents` | `6` (`4` under 640px) | cursors that start building (fast scrolling summons up to 6 more, and a big page grows the swarm up to `maxAgents`) |
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
| `teamwork` | `true` | an idle cursor carries a typed text frame home so the cursor that typed it can move on to its next task |
| `adaptive` | `true` | a big page gets more cursors (about one extra per 150 elements at the start, and more join while a backlog waits), and while many unlocked elements still wait per cursor everyone speeds up (up to 3×) and text is typed in place, so a dense or huge page does not take forever; small pages are untouched |
| `maxAgents` | `14` (`8` on a phone) | ceiling for how many cursors the swarm may grow to (`agents` is how many start) |
| `stageText` | `true` | a few text boxes (~15%) are typed in a nearby spot first, then dragged into place; the rest are typed where they belong. A number `0..1` sets the share, `false` = none |
| `captureMedia` | `true` | Chrome extension only: screenshot canvases / videos / iframes the page won't let us read (those on screen when it starts) |
| `blueprint` | `false` | dashed outline for blocks still waiting for a cursor |
| `target` | – | CSS selector or element: blank and rebuild only this section, the rest of the page stays live (a selector that matches nothing falls back to the whole page) |
| `exclude` | – | CSS selector to skip |
| `labels` | English | toolbar strings (`tour`, `preparing`, `tapForSound`, `helping`, …); `building` is `(percent) => string` |
| `onProgress`, `onFinish`, `onStop` | – | callbacks |

<kbd>Esc</kbd> closes, <kbd>M</kbd> toggles sound, <kbd>Space</kbd> toggles the tour, "Go live" fades the overlay out.

## Chrome extension

`npm run build` also writes an unpacked MV3 extension to `dist/extension/` (permissions: `activeTab`, `scripting` only).
`chrome://extensions` -> Developer mode -> **Load unpacked** -> pick `dist/extension`. Click the toolbar icon or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on any page; <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> lets you click one section to rebuild instead of the whole page. Chrome's own pages, the Web Store and the PDF viewer can't be scripted (badge shows ×).
The extension also takes one screenshot of the tab (`captureVisibleTab`, covered by `activeTab`) so media the page won't let us read can be shown as an image.

## Features

**Rebuilding**
- Boxes are drag-drawn, text is typed (with a caret) in a nearby spot and then dragged into its exact place, images are revealed, one-sided borders become pen-tool lines, repeated cards are Alt-dragged copies of the first,
  and texts that share a left edge get a ruler guide.
- Reads open shadow roots and `<slot>`s, same-origin iframes, `backdrop-filter`, and still frames of `<canvas>` / `<video>` (video falls back to its poster).
  What the page won't let us read (tainted canvas, cross-origin video / iframe) is a placeholder, or, in the Chrome extension, a screenshot cropped from one tab capture taken before the overlay appears. Scroll containers only rebuild what they actually show; fixed / sticky headers are drawn at the top.

**The swarm**
- Every cursor has a personality: its own pace, a kind of work it is quickest at, a thinking pause, and how readily it helps. A cursor that typed a text frame in the wrong place and still has more to build
  hands the "drag it home" chore to an idle colleague and moves on (`teamwork: false` to turn it off).

**Big pages**
- The page is scanned band by band while you scroll, so a huge page costs a few milliseconds per frame instead of one freeze. Elements are drawn once the viewer has
  scrolled to them; anything scrolled well past appears at once. Progress never goes backwards. Press Tour / <kbd>Space</kbd> for auto-scroll.

**Where and when it runs**
- Whole page by default, or one section with `target` (the rest of the page stays live). No selector at hand? <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> or
  `SwarmCursors.pickAndStart()` lets you click the section. `?swarm` trigger (`data-trigger="query"`), hotkey, or `data-auto`.
- `blueprint: true` outlines the blocks that are waiting for a cursor.
- Fewer cursors on phones; idle cursors follow your mouse and occasionally pull off an easter egg.
- Hidden tabs pause the animation and mute sound instead of freezing and jumping.

**Sound and intro**
- Everything is synthesized: key clicks, mouse press, guide snap, pitch-rising headings, glass-piano notes on an eighth-note grid, swell / arpeggio / finish chord,
  and a "Tap for sound" hint when the browser blocks audio.
- Intro: the page dissolves while the cursors orbit the favicon, and a hidden scroll pass wakes lazy content first.

**Robustness**
- Page markup copies are sanitized (no `on*` handlers or scripts re-run); a single failing element can't stall the swarm; the AudioContext is closed on stop;
  the toolbar status is an `aria-live` region.

Known limits: pseudo-elements (`::before` / `::after`) are not rebuilt; cross-origin iframes are a placeholder (a screenshot in the extension, for those on screen at the start); sticky elements are drawn where they were when the
band was scanned; content that moves a lot after it was scanned (late-loading images above it) can end up slightly off.

Version history: see [CHANGELOG.md](CHANGELOG.md).

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
Every idea on the original list is built now; new ones go here.

## Credits

The idea comes from **Swarm** by Joel Califa ([site](https://califa.github.io/swarm-site/), [source](https://github.com/califa/swarm-site))
and the **Swarm Rebuild** extension by Dhvanil Patel, which points the effect at any page. Neither repo ships a license, and no code
from either is included here: the later features were written independently from their public descriptions. Please go look at the originals.

## Project layout

```
src/
  egg.ts        easter-egg shapes (heart / ring / wave)
  index.ts      public API: start / stop / isRunning / bindHotkey / pick / pickAndStart
  global.ts     IIFE entry: window.SwarmCursors + <script data-*> options
  swarm.ts      one run: intro orbit, queue, agents, tools (pen, guide, drag-copy, typing)
  prime.ts      hidden scroll pass for lazy content
  capture.ts    extension-only screenshot of unreadable media
  picker.ts     point-and-click chooser for `target`
  persona.ts    per-cursor personality (pace, favourite work, helpfulness)
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

