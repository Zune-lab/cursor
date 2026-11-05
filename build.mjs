import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');
const banner = `/*! swarm-cursors v${pkg.version} | ${pkg.license} */`;
const common = {
  bundle: true,
  target: 'es2020',
  banner: { js: banner },
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
};

mkdirSync('dist', { recursive: true });

const jobs = [
  { ...common, entryPoints: ['src/global.ts'], outfile: 'dist/swarm-cursors.js', format: 'iife' },
  { ...common, entryPoints: ['src/global.ts'], outfile: 'dist/swarm-cursors.min.js', format: 'iife', minify: true, sourcemap: true },
  { ...common, entryPoints: ['src/index.ts'], outfile: 'dist/swarm-cursors.mjs', format: 'esm', minify: false },
];

if (watch) {
  // dev server: rebuilds on save, serves the demo, and the demo reloads itself
  const ctx = await context(jobs[0]);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: '.', port: 5173 });
  console.log(`\n  demo: http://localhost:${port}/demo/\n  (save a file in src/ -> the page reloads)\n`);
} else {
  await Promise.all(jobs.map((j) => build(j)));
  // unpacked Chrome extension: dist/extension (chrome://extensions -> Load unpacked)
  mkdirSync('dist/extension', { recursive: true });
  const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
  manifest.version = pkg.version;
  writeFileSync('dist/extension/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  copyFileSync('extension/background.js', 'dist/extension/background.js');
  copyFileSync('dist/swarm-cursors.min.js', 'dist/extension/swarm-cursors.js');
  // userscript (Tampermonkey / Violentmonkey / Greasemonkey): runs on every site, Alt+Shift+S / Alt+Shift+P work, ?swarm starts it
  const header = [
    '// ==UserScript==',
    '// @name         Swarm Cursors',
    '// @namespace    https://github.com/Zune-lab/cursor',
    `// @version      ${pkg.version}`,
    '// @description  Blank any page, then a swarm of multiplayer cursors rebuilds it live. Alt+Shift+S toggles, Alt+Shift+P picks a section, ?swarm in the address starts it.',
    '// @match        *://*/*',
    '// @run-at       document-idle',
    '// @noframes',
    '// @grant        none',
    '// ==/UserScript==',
    '',
  ].join('\n');
  const boot = `\n;(function () { var S = window.SwarmCursors; if (S && new URLSearchParams(location.search).has('swarm')) S.start(); })();\n`;
  writeFileSync('dist/swarm-cursors.user.js', header + readFileSync('dist/swarm-cursors.min.js', 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '') + boot);
  // one bundled declaration file
  execFileSync('npx', ['dts-bundle-generator', '--no-banner', '--project', 'tsconfig.json', '-o', 'dist/index.d.ts', 'src/index.ts'], { stdio: 'inherit' });
}
