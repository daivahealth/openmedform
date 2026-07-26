/**
 * Point-value colour coding — the Angular counterpart of the React renderer's
 * `pointColor`. Kept byte-for-byte equivalent so a scored checklist looks the
 * same in both frameworks (1→blue, 2→green, 3→amber, 5→red).
 */

export interface PointStyle {
  fg: string;
  bg: string;
}

export function pointColor(points: number): PointStyle {
  if (points >= 5) return { fg: '#c0392b', bg: '#fdecea' }; // red
  if (points >= 3) return { fg: '#b8860b', bg: '#fbf3e0' }; // amber
  if (points >= 2) return { fg: '#1e8e5a', bg: '#e8f6ee' }; // green
  return { fg: '#2d6cdf', bg: '#e9f0fc' }; // blue (1 pt / default)
}

/** Read the `options.omf` bag off a UI element, if present. */
export function readOmf(
  uischema: { options?: { omf?: Record<string, unknown> } } | undefined,
): Record<string, unknown> | undefined {
  return uischema?.options?.omf;
}
