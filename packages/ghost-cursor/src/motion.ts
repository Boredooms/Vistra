export interface Pt {
  x: number;
  y: number;
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 550-900 ms, longer for longer trips. */
export function durationFor(distance: number): number {
  return Math.round(Math.min(900, Math.max(550, 550 + distance * 0.35)));
}

/** Control points bow the path sideways so the motion reads as a hand movement, not a straight line. */
export function controlPoints(a: Pt, b: Pt): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = Math.min(120, len * 0.25);
  return [
    { x: a.x + dx * 0.3 + nx * bow, y: a.y + dy * 0.3 + ny * bow },
    { x: a.x + dx * 0.75 + nx * bow * 0.4, y: a.y + dy * 0.75 + ny * bow * 0.4 },
  ];
}

export function bezier(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return { x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x, y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y };
}
