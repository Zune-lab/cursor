const svg = (d: string): string =>
  `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const IC = {
  play: svg('<path d="M4 2.5l7 4.5-7 4.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<path d="M4.5 3v8M9.5 3v8"/>'),
  on: svg('<path d="M2 5.5h2.5L8 2.5v9L4.5 8.5H2z" fill="currentColor"/><path d="M10 5a3 3 0 010 4"/>'),
  off: svg('<path d="M2 5.5h2.5L8 2.5v9L4.5 8.5H2z" fill="currentColor"/><path d="M10 5l3 4M13 5l-3 4"/>'),
  x: svg('<path d="M3 3l8 8M11 3l-8 8"/>'),
};
