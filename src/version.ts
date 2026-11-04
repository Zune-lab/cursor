declare const __VERSION__: string;
/** Injected by esbuild at build time (see build.mjs). */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
