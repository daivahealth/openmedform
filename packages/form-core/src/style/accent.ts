/**
 * Accent-colour helpers shared by every surface that renders `omf.accentColor`.
 *
 * WHY THIS IS IN form-core — a tinted callout needs a background derived from
 * the accent, which is hex→rgba arithmetic. Three surfaces draw it (React,
 * Angular, print), and a colour that comes out subtly different in one of them
 * is exactly the cross-renderer drift the contract forbids. `pointColor` is
 * already duplicated across the two renderers with a "keep in sync" comment;
 * this does not add a second one.
 *
 * No rendering here — just colour maths over strings.
 */

/** `#rgb` or `#rrggbb`, with or without the hash. */
const HEX = /^#?(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i;

/**
 * Parse a hex colour into its channels, or undefined for anything else.
 *
 * A definition may legitimately carry a colour this cannot read — a CSS
 * variable, `rgb(...)`, a named colour. Those are not errors: the caller keeps
 * the accent for borders and text (where the browser resolves it perfectly
 * well) and simply goes without the derived tint.
 */
export function parseHexColor(color: string | undefined): [number, number, number] | undefined {
  if (typeof color !== 'string') return undefined;
  const match = HEX.exec(color.trim());
  if (!match) return undefined;
  const hex = match[1]
    ? match[1]
        .split('')
        .map((c) => c + c)
        .join('')
    : match[2];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/**
 * A faint wash of the accent, for a callout's background.
 *
 * Alpha rather than a blended-to-white hex so the callout sits correctly on
 * whatever it is drawn over — a section band, a table cell, a dark theme.
 */
export function accentTint(color: string | undefined, alpha = 0.08): string | undefined {
  const rgb = parseHexColor(color);
  if (!rgb) return undefined;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Opaque version of the same wash, for PRINT.
 *
 * Print pipelines routinely drop alpha compositing, and a callout whose tint
 * silently disappears takes its meaning with it. Mixing against white up front
 * gives the same visual result with no transparency involved.
 */
export function accentTintOpaque(color: string | undefined, alpha = 0.08): string | undefined {
  const rgb = parseHexColor(color);
  if (!rgb) return undefined;
  const mix = (channel: number) => Math.round(channel * alpha + 255 * (1 - alpha));
  return `rgb(${mix(rgb[0])}, ${mix(rgb[1])}, ${mix(rgb[2])})`;
}
