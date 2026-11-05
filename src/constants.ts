export const COLORS = ['#ff5b5b', '#ffb02e', '#2ecc71', '#20b2ff', '#8b5cf6', '#ff4fa3', '#00c2a8', '#f97316'];
export const NAMES = ['Mai', 'Linh', 'Khoa', 'Nam', 'Hà', 'Bảo', 'Vy', 'Tuấn', 'Phúc', 'Trang', 'Dũng', 'Lan', 'Hải', 'Quân'];

/** `n` cursor colors: the hand-picked eight first, then evenly spread hues (golden angle) so a big swarm never repeats a color. */
export function palette(n: number): string[] {
  const out = [...COLORS];
  for (let i = out.length; i < n; i++) out.push(`hsl(${Math.round(((i - COLORS.length) * 137.508 + 20) % 360)} 72% 52%)`);
  return out;
}

export const ACCENT = '#0d99ff';
export const ALERT = '#f24822';

export const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
export const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const;
export const RADII: string[] = CORNERS.map((c) => `border${c}Radius`);

export const RECT_PROPS: string[] = [
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundOrigin', 'backgroundClip', 'backdropFilter', 'boxShadow',
  ...SIDES.flatMap((s) => ['Width', 'Style', 'Color'].map((k) => `border${s}${k}`)),
  ...RADII,
];
export const TEXT_PROPS: string[] = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'lineHeight', 'letterSpacing', 'textAlign',
  'textTransform', 'textDecorationLine', 'whiteSpace', 'wordBreak', 'textIndent',
  ...SIDES.map((s) => `padding${s}`),
];
export const MEDIA_PROPS: string[] = ['objectFit', 'objectPosition', 'boxShadow', ...RADII];

export const SKIP_TAGS = ['script', 'style', 'noscript', 'textarea', 'select', 'option', 'template', 'link', 'meta'];
export const MEDIA_TAGS = ['img', 'video', 'canvas', 'svg'];

/** E major pentatonic. */
export const PENTA = [329.6, 370, 415.3, 493.9, 554.4];

export const DEFAULT_MAX_TASKS = 20000;
