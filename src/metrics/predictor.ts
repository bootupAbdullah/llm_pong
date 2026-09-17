// Ball-path predictor.
//
// Standalone and pure — no DOM, no game imports, no metrics imports. Given the
// ball's current state and a target vertical plane (a paddle's contact face),
// it returns where and when the ball will cross that plane, the full bounce
// path to get there, and the piecewise-linear y(x) rule for that path.
//
// Consumed by: the metrics recorder (tracking accuracy, reaction direction,
// overshoot), the Phase 3 bot, and any future on-screen path / f(x) display.
//
// VERSION 1 — straight lines, perfect reflections off the top/bottom walls, no
// speed-up modelled (the ball only speeds up AT a paddle hit, and a prediction
// runs only as far as the next paddle plane, so within one leg V1 is exact bar
// sub-pixel integration drift). Bump PREDICTOR_VERSION when the model changes;
// consumers read `.version` and never reach past this interface.

export const PREDICTOR_VERSION = 1;

export interface PathPoint {
  x: number;
  y: number;
  /** Seconds from now. */
  t: number;
  kind: 'start' | 'wall' | 'intercept';
}

/** One straight span of the path, as y = slope·x + intercept, valid for
 *  x in [fromX, toX] (x is monotonic along a prediction — vx never flips). */
export interface PathSegment {
  fromX: number;
  toX: number;
  slope: number;
  intercept: number;
}

export interface Prediction {
  version: number;
  /** The plane this was predicted to. */
  targetX: number;
  /** y where the ball crosses targetX, or null if it isn't heading there. */
  interceptY: number | null;
  /** Seconds until it reaches targetX, or null. */
  timeToIntercept: number | null;
  /** Wall bounces before the intercept. */
  bounces: number;
  /** start → wall bounces → intercept. Always has the start point. */
  path: PathPoint[];
  /** Piecewise-linear y(x) over the path. */
  segments: PathSegment[];
}

export interface PredictorInput {
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
  ballR: number;
  /** Playfield height (canvas px). */
  height: number;
  /** Vertical plane to predict to (a paddle contact face, canvas px). */
  targetX: number;
}

const MAX_BOUNCES = 32;

export function predict(input: PredictorInput): Prediction {
  const { ballX, ballVx, ballVy, ballR, height, targetX } = input;
  const top = ballR;
  const bottom = height - ballR;
  const y0 = Math.max(top, Math.min(bottom, input.ballY));

  const result: Prediction = {
    version: PREDICTOR_VERSION,
    targetX,
    interceptY: null,
    timeToIntercept: null,
    bounces: 0,
    path: [{ x: ballX, y: y0, t: 0, kind: 'start' }],
    segments: [],
  };

  // Not heading toward the target plane -> no intercept (path stays just the
  // start point).
  const dirToTarget = Math.sign(targetX - ballX);
  if (ballVx === 0 || dirToTarget === 0 || Math.sign(ballVx) !== dirToTarget) {
    return result;
  }

  const vx = ballVx;
  let x = ballX;
  let y = y0;
  let vy = ballVy;
  let t = 0;
  let bounces = 0;

  for (let i = 0; i <= MAX_BOUNCES; i += 1) {
    const tToTarget = (targetX - x) / vx; // > 0: direction was checked
    let tToWall = Infinity;
    if (vy > 0) tToWall = (bottom - y) / vy;
    else if (vy < 0) tToWall = (top - y) / vy;

    if (tToTarget <= tToWall) {
      t += tToTarget;
      const iy = y + vy * tToTarget;
      result.path.push({ x: targetX, y: iy, t, kind: 'intercept' });
      result.interceptY = iy;
      result.timeToIntercept = t;
      break;
    }

    // wall first
    t += tToWall;
    x += vx * tToWall;
    y = vy > 0 ? bottom : top;
    vy = -vy;
    bounces += 1;
    result.path.push({ x, y, t, kind: 'wall' });
  }

  result.bounces = bounces;
  result.segments = segmentsFromPath(result.path);
  return result;
}

function segmentsFromPath(path: PathPoint[]): PathSegment[] {
  const segments: PathSegment[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    if (dx === 0) continue;
    const slope = (b.y - a.y) / dx;
    segments.push({ fromX: a.x, toX: b.x, slope, intercept: a.y - slope * a.x });
  }
  return segments;
}

/** Human-readable f(x), e.g. "y = -0.42x + 380". Multi-segment paths join the
 *  first `maxSegments` spans with " | " and append "…" if truncated. */
export function formatRule(prediction: Prediction, maxSegments = 2): string {
  if (prediction.segments.length === 0) return 'y = —';
  const parts = prediction.segments.slice(0, maxSegments).map((s) => {
    const sign = s.intercept < 0 ? '−' : '+';
    return `y = ${s.slope.toFixed(2)}x ${sign} ${Math.abs(s.intercept).toFixed(0)}`;
  });
  if (prediction.segments.length > maxSegments) parts.push('…');
  return parts.join('  |  ');
}
