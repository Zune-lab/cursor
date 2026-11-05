/** Shadow-DOM stylesheet. Kept as one string so the bundle stays a single file. */
export const CSS = `
:host{all:initial}
.layer{position:absolute;inset:0;isolation:isolate;contain:layout style}
.ph{background:rgba(120,120,120,.16);outline:1px solid #0d99ff}
.ph.txt{background:transparent}
.cur{position:absolute;left:0;top:0;pointer-events:none;z-index:2147483000;will-change:transform}
.cur svg{position:absolute;display:none;overflow:visible;filter:drop-shadow(0 2px 3px #0005)}
.cur[data-m=arrow] .a,.cur[data-m=cross] .c,.cur[data-m=text] .t{display:block}
.tag{position:absolute;left:12px;top:16px;font:600 11px/1 system-ui,sans-serif;color:#fff;padding:3px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px #0004}
.bar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:5px;
 background:rgba(20,20,22,.78);backdrop-filter:blur(14px) saturate(160%);border:1px solid rgba(255,255,255,.12);border-radius:14px;
 box-shadow:0 8px 30px rgba(0,0,0,.28);font:500 12.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;color:#fff;z-index:2147483647}
.bar button{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:9px;color:#e8e8ea;transition:background .15s,color .15s}
.bar button:hover{background:rgba(255,255,255,.12);color:#fff}
.bar button.on{background:rgba(255,255,255,.2);color:#fff}
.bar button.pri{background:#0d99ff;color:#fff}
.bar button.pri:hover{background:#2aa8ff}
.bar button:focus-visible{outline:2px solid #0d99ff;outline-offset:1px}
.bar .seg{display:flex;gap:2px;padding:2px;background:rgba(255,255,255,.08);border-radius:11px}
.bar .seg button{height:26px;padding:0 9px;border-radius:8px}
.bar .sep{width:1px;height:18px;background:rgba(255,255,255,.14);margin:0 5px}
.bar .st{min-width:74px;padding:0 10px;color:#a8a8ad;white-space:nowrap}
.prog{position:fixed;left:0;top:0;height:2px;width:0;background:linear-gradient(90deg,#0d99ff,#9747ff,#ff4fa3);z-index:2147483647;transition:width .25s,opacity .5s}
.fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147482200}
.pop{animation:pop .4s cubic-bezier(.2,.8,.2,1)}
@keyframes pop{from{opacity:.4;transform:scale(.975)}}
.ruler{position:fixed;left:0;top:0;bottom:0;width:18px;background:#2b2b2bcc;opacity:0;transition:opacity .25s;z-index:2147482500;pointer-events:none}
.guide{position:absolute;top:0;bottom:0;width:0;border-left:1px solid #f24822;z-index:2147481000;pointer-events:none}
.bp{position:absolute;box-sizing:border-box;border:1px dashed rgba(13,153,255,.55);background:rgba(13,153,255,.04);pointer-events:none;z-index:0}
.sel{position:absolute;outline:1px solid #0d99ff;z-index:2147482000;pointer-events:none}
.sel i{position:absolute;width:7px;height:7px;margin:-3.5px;background:#fff;border:1px solid #0d99ff;box-sizing:border-box}
.caret{display:inline-block;width:1px;height:1em;margin-left:1px;vertical-align:text-bottom;background:currentColor;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.fav{position:fixed;left:50%;top:50%;width:32px;height:32px;margin:-16px 0 0 -16px;border-radius:8px;opacity:.9;transition:opacity .5s,transform .5s;pointer-events:none}
.fav.gone{opacity:0;transform:scale(.6)}
.bar .lock{color:#ffd24a;font-size:11.5px}
@media (prefers-reduced-motion:reduce){.pop{animation:none}.prog{transition:none}.caret{animation:none}}`;
