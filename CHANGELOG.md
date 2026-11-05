# Changelog

## Unreleased

- **Runs on any website**: `npm run build` now also writes `dist/swarm-cursors.user.js`, a self-contained userscript (`@match *://*/*`) for Tampermonkey / Violentmonkey in any browser:
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>P</kbd> work and `?swarm` in the address starts it. README has a new "Run it on any website" section (extension, userscript, console).

## 2.13

- **Shorter runs**: a free cursor no longer waits behind a box that is still being drawn. It looks at the next few waiting tasks, skips the ones whose parent is unfinished
  (only a box's own children wait for it) and takes the nearest of the rest, so there is less idle time and less travelling. Layers have their own z-index, so the picture is unchanged.
- **Catch-up** (`adaptive: true` / `data-adaptive="off"` to disable): while a lot of unlocked work is waiting per cursor, everyone speeds up smoothly (up to 3x) and text is typed in place
  instead of staged. A dense page of 90 blocks went from 8.0 s to 4.9 s in the test; small pages run at exactly the pace you set.
- **The bigger the page, the more cursors**: the run starts with one extra cursor per ~150 elements found (estimated from the first scan), and while more than ~12 unlocked tasks wait per cursor
  another one joins (every 0.45 s), up to `maxAgents` (default 14, 8 on a phone). On a 300-block page this took a run from 8.4 s to 2.1 s (2 -> 7 cursors). `adaptive: false` keeps exactly `agents`;
  `data-max-agents="N"` sets the ceiling from a `<script>` tag.
- **Big swarms look distinct**: the default colors are extended with evenly spread hues and the default names to 14, so no two cursors share a color or a name unless you pass your own `colors` / `names`.
- **No polling**: waiting cursors sleep until something happens (scroll, a finished task, newly scanned tasks, `stop()`) instead of waking every 40-60 ms.
- **Only a few texts are dragged home**: staging now applies to about 15% of the text boxes (`stageText: 0.3` for 30%, `stageText: 1` for all, `false` for none); the rest are typed right in place.
- **Lighter on the page**: the toolbar progress is repainted once per frame (not once per task), cursors skip style writes that did not change (name tag text, tiny arrow lean),
  the idle-cursor list is no longer rebuilt every frame, sounds share one stereo panner per position, and key clicks are rate-limited (fast typing by many cursors no longer floods the audio graph).
- Cleanup: one `lineGeom` shared by the pen tool and the instant placement, one `selectionBox` helper, one `labels()` merge.

## 2.12

- **Smarter teamwork** (replaces the two-cursors-draw-one-box idea of 2.11, which never saved any time): a cursor that has typed a text box in the wrong place *and still has more to build*
  hands the chore to an idle colleague. The nearest willing one (its `helpful` trait decides) wears a "Helping <name>" tag, goes over, grabs the finished frame and drags it home,
  while the typist moves straight on to its next task. With nothing else to build, or nobody free, the typist carries its own frame. The task only counts as done (progress, note, sparks)
  once the frame has arrived, and the run does not finish while a frame is still being carried. `teamwork: false` / `data-teamwork="off"` turns it off; the tag text is the `helping` label.

## 2.11

- **Personalities**: every cursor now has its own pace (0.8×–1.3×), a kind of work it is quickest at (text, boxes, media or lines; 1.3× faster on it), a short "thinking" pause before each task,
  and a `helpful` streak. Same `seed`, same personalities.

## 2.10

- **Text is built like a designer would**: a cursor drags out a text box in an empty spot near the target, types into it, then grabs the finished frame (selection handles, red `px` distance label)
  and drags it onto its exact place, with a snap sound on arrival. Tiny labels (< 600 px²) are still typed in place, the stage spot stays inside the viewport (and the section in section mode),
  and duplicates / `sweepPast` are unchanged. Turn off with `stageText: false` / `data-stage="off"`.

## 2.9

- **Pick a section with the mouse**: `SwarmCursors.pickAndStart()` outlines whatever is under the pointer; click (or Enter) to choose it, ArrowUp / ArrowDown to move to the parent / back,
  Esc to cancel. Page clicks are swallowed while picking. Choosing `<body>` rebuilds the whole page. `SwarmCursors.pick()` returns the chosen element if you want to use it yourself.
- Hotkey <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> (also in the Chrome extension, as a second command; no new permissions).

## 2.8

- **Screenshots for unreadable media** (Chrome extension only, `captureMedia`, on by default): canvases, videos and iframes the page won't let us read are no longer a grey placeholder.
  The extension takes one screenshot of the tab before the overlay fades in and crops each element out of it. Needs nothing beyond the existing `activeTab` permission.
  Only media that is mostly on screen at that moment is captured; the rest keeps the placeholder, because the capture API is rate-limited.

## 2.7

- **Background tabs**: the animation clock stops while the tab is hidden and sound is muted, so cursors no longer freeze and then jump to their end when you come back.

## 2.6

- **Blueprint** (`blueprint: true` / `data-blueprint="on"`, off by default): unlocked blocks still waiting for a cursor show a dashed outline that disappears the moment a cursor picks them up.
  Only blocks over ~1500 px² are outlined, at most 40 at a time.

## 2.5

- **Section mode** (`target: '#hero'` / `data-target="#hero"`): blank and rebuild one element only. The overlay is clipped to its box, the page scrolls to it first,
  the cursors gather around its visible part, the tour stops at its bottom edge, and the overlay follows the section if it grows.
  A selector that matches nothing falls back to the whole page with a console warning.

## 2.4

- **Idle cursors follow your mouse** (the same swirl that closes the show) instead of wandering, any time they have nothing to build.
- **Easter eggs**: once in a while, when the swarm has been idle and quiet for a while, the cursors pull off a small trick around your mouse
  (a beating heart, a fast ring, or a wave). `easterEggs: false` / `data-eggs="off"` turns them off.
- **Scrolled past = appears at once**: anything you scroll well beyond before a cursor got to it is placed instantly (no animation), so fast
  scrolling never leaves holes behind. Capped per frame so it stays smooth.
- **`?swarm` trigger**: `<script src="swarm-cursors.min.js" data-trigger="query">` starts only on URLs that contain `?swarm`.
- Fewer cursors by default on phones (4 instead of 6).

## 2.3 (big pages)

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

## 2.1

- **Intro**: the page dissolves while the cursors orbit the site's favicon; a hidden scroll pass wakes lazy content, then the swarm fans out.
- **Snapshot** enters open shadow roots and resolves `<slot>`s; `backdrop-filter` and background clip/origin are kept;
  `<canvas>` and `<video>` become still frames when the browser allows reading them (video falls back to its poster).
- **Sound** (all synthesized): keyboard click + thock (deeper on space), mouse press, guide snap, headings tick up in pitch,
  glass-piano notes quantised to an eighth-note grid, swell / arpeggio / finish chord / go-live sweep, and a "Tap for sound" hint when the browser blocks audio.
- Blinking caret while text is typed; installable as a Chrome extension; loading the bundle twice no longer double-binds the hotkey.

## 2.0 (changes from 1.x)

- TypeScript (strict), split into modules, one `index.d.ts`.
- `start()` returns `{ stop, done }`; new options `names`, `colors`, `maxTasks`, `exclude`, `labels`, callbacks.
- Replay keeps all your options (it used to keep only `agents` and `speed`).
- Pressing <kbd>M</kbd> while typing in a form field no longer toggles sound.
- Copies of page markup are sanitized (no `on*` handlers / scripts re-run inside the overlay); SVGs are cloned, not re-parsed.
- A single failing element can no longer stall the whole swarm.
- AudioContext is closed on stop; missing WebAudio / `matchMedia` / canvas is handled.
- Repeated-sibling detection works for SVG elements (class was `[object SVGAnimatedString]`).
- Toolbar status is an `aria-live` region; the decorative layer is `aria-hidden`.
