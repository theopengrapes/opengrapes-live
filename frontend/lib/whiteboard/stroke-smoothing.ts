import { StrokePoint } from './stroke-protocol';

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export const TLDRAW_COLORS: Record<string, string> = {
  black: '#1e1e1e',
  grey: '#787878',
  violet: '#7c3aed',
  blue: '#3b82f6',
  'light-blue': '#06b6d4',
  yellow: '#eab308',
  orange: '#f97316',
  green: '#10b981',
  'light-green': '#84cc16',
  'light-red': '#ec4899',
  red: '#ef4444',
  white: '#ffffff',
};

/**
 * Maps Tldraw size keys ('s', 'm', 'l', 'xl') to page space stroke widths.
 */
export function getBaseWidth(tool: 'draw' | 'highlight', size: string): number {
  if (tool === 'highlight') {
    switch (size) {
      case 's': return 10;
      case 'm': return 16;
      case 'l': return 32;
      case 'xl': return 56;
      default: return 16;
    }
  } else {
    switch (size) {
      case 's': return 2;
      case 'm': return 5;
      case 'l': return 11;
      case 'xl': return 24;
      default: return 5;
    }
  }
}

/**
 * Draws a smooth Catmull-Rom spline on the canvas using cubic Bezier curves,
 * with line widths responding to pointer pressure.
 */
export function drawCatmullRom(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseWidth: number,
  color: string
) {
  if (points.length < 2) return;

  // Single point fallback (draws a dot)
  if (points.length === 2 && points[0].x === points[1].x && points[0].y === points[1].y) {
    ctx.save();
    ctx.beginPath();
    const radius = (baseWidth * (0.4 + points[0].pressure * 0.8)) / 2;
    ctx.arc(points[0].x, points[0].y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }

  // Extrapolate virtual start and end control points for Catmull-Rom boundaries
  const p0 = points[0];
  const p1 = points[1];
  const pn = points[points.length - 1];
  const pn_minus_1 = points[points.length - 2] || p0;

  const virtualStart: Point = {
    x: p0.x - (p1.x - p0.x),
    y: p0.y - (p1.y - p0.y),
    pressure: p0.pressure,
  };
  const virtualEnd: Point = {
    x: pn.x + (pn.x - pn_minus_1.x),
    y: pn.y + (pn.y - pn_minus_1.y),
    pressure: pn.pressure,
  };

  const extendedPoints = [virtualStart, ...points, virtualEnd];

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < extendedPoints.length - 2; i++) {
    const pPrev = extendedPoints[i - 1];
    const pCurr = extendedPoints[i];
    const pNext = extendedPoints[i + 1];
    const pNext2 = extendedPoints[i + 2];

    // Compute control points for Cubic Bezier segment
    const cp1x = pCurr.x + (pNext.x - pPrev.x) / 6;
    const cp1y = pCurr.y + (pNext.y - pPrev.y) / 6;
    const cp2x = pNext.x - (pNext2.x - pCurr.x) / 6;
    const cp2y = pNext.y - (pNext2.y - pCurr.y) / 6;

    ctx.beginPath();
    ctx.moveTo(pCurr.x, pCurr.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pNext.x, pNext.y);

    const avgPressure = (pCurr.pressure + pNext.pressure) / 2;
    ctx.lineWidth = baseWidth * (0.4 + avgPressure * 0.8);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/**
 * Playout buffer manager. Decouples network arrival time from rendering time
 * by playing back stroke coordinates with a constant delay, using LERP
 * to interpolate between points for 60fps jitter-free motion.
 */
export function updateStrokePlayout(
  stroke: {
    rawPoints: StrokePoint[];
    startTime: number;
    ended: boolean;
    bufferDelay: number;
  },
  now: number
): Point[] {
  const elapsed = now - stroke.startTime - stroke.bufferDelay;

  if (elapsed < 0) {
    // If playout hasn't started yet, render the first point to show immediate feedback
    return stroke.rawPoints.length > 0
      ? [{ x: stroke.rawPoints[0].x, y: stroke.rawPoints[0].y, pressure: stroke.rawPoints[0].pressure }]
      : [];
  }

  const result: Point[] = [];
  const raw = stroke.rawPoints;

  // Find the last raw point whose relative time 't' is <= 'elapsed'
  let lastIndex = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].t <= elapsed) {
      lastIndex = i;
    } else {
      break;
    }
  }

  if (lastIndex === -1) {
    return raw.length > 0
      ? [{ x: raw[0].x, y: raw[0].y, pressure: raw[0].pressure }]
      : [];
  }

  // Push all completed points up to lastIndex
  for (let i = 0; i <= lastIndex; i++) {
    result.push({
      x: raw[i].x,
      y: raw[i].y,
      pressure: raw[i].pressure,
    });
  }

  // Interpolate to the next point if available
  if (lastIndex < raw.length - 1) {
    const p1 = raw[lastIndex];
    const p2 = raw[lastIndex + 1];
    const dt = p2.t - p1.t;
    if (dt > 0) {
      const ratio = (elapsed - p1.t) / dt;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      result.push({
        x: p1.x + (p2.x - p1.x) * clampedRatio,
        y: p1.y + (p2.y - p1.y) * clampedRatio,
        pressure: p1.pressure + (p2.pressure - p1.pressure) * clampedRatio,
      });
    }
  }

  return result;
}
