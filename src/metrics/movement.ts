// Movement-pattern accumulation — pure, no DOM/game/recorder deps.
//
// Fed one player-paddle frame at a time; finalised into a per-leg or per-game
// summary when the leg/game closes. Four of the five agreed movement metrics
// live here — distance travelled, direction changes, idle time, resting
// position — plus the paddle-velocity stats (peak / mean-while-moving /
// acceleration). The fifth, overshoot, needs the predicted intercept and lands
// in Stage 5 alongside accuracy.

export const MOVE_TUNING = {
  /** |velocity| below this (px/s) counts as "not moving". */
  idleSpeedPxS: 8,
  /** ignore direction flips from jitter below this |velocity| (px/s). */
  dirDeadbandPxS: 20,
  /** bins for the resting-position histogram (paddle-centre y over a game). */
  restingBins: 8,
  /** EMA factor for the smoothed velocity readout. */
  smoothingAlpha: 1 / 3,
};

export interface MoveAccum {
  frames: number;
  travel: number; // Σ |Δy|, px
  idleFrames: number;
  movingFrames: number;
  sumMovingSpeed: number; // Σ |v| over moving frames, px/s
  peakSpeed: number; // max |v|, px/s
  directionChanges: number;
  lastDirSign: -1 | 0 | 1;
  sumAbsAccel: number;
  accelSamples: number;
}

export function newMoveAccum(): MoveAccum {
  return {
    frames: 0,
    travel: 0,
    idleFrames: 0,
    movingFrames: 0,
    sumMovingSpeed: 0,
    peakSpeed: 0,
    directionChanges: 0,
    lastDirSign: 0,
    sumAbsAccel: 0,
    accelSamples: 0,
  };
}

export interface MoveFrameInput {
  /** playerY - prevPlayerY, px. */
  dy: number;
  /** player paddle velocity this frame, px/s. */
  vy: number;
  /** (vy - prevVy) / dt, px/s²; null on the first frame. */
  accel: number | null;
}

export function feedMove(a: MoveAccum, f: MoveFrameInput): void {
  a.frames += 1;
  a.travel += Math.abs(f.dy);

  const speed = Math.abs(f.vy);
  if (speed > a.peakSpeed) a.peakSpeed = speed;

  if (speed < MOVE_TUNING.idleSpeedPxS) {
    a.idleFrames += 1;
  } else {
    a.movingFrames += 1;
    a.sumMovingSpeed += speed;
  }

  const sign: -1 | 0 | 1 =
    f.vy > MOVE_TUNING.dirDeadbandPxS
      ? 1
      : f.vy < -MOVE_TUNING.dirDeadbandPxS
        ? -1
        : 0;
  if (sign !== 0) {
    if (a.lastDirSign !== 0 && sign !== a.lastDirSign) a.directionChanges += 1;
    a.lastDirSign = sign;
  }

  if (f.accel !== null) {
    a.sumAbsAccel += Math.abs(f.accel);
    a.accelSamples += 1;
  }
}

export interface MovementSummary {
  travelPx: number;
  idleFraction: number;
  directionChanges: number;
  peakSpeedPxS: number;
  meanMovingSpeedPxS: number;
  meanAbsAccelPxS2: number;
}

export function finalizeMove(a: MoveAccum): MovementSummary {
  return {
    travelPx: Math.round(a.travel),
    idleFraction: a.frames ? round3(a.idleFrames / a.frames) : 0,
    directionChanges: a.directionChanges,
    peakSpeedPxS: Math.round(a.peakSpeed),
    meanMovingSpeedPxS: a.movingFrames
      ? Math.round(a.sumMovingSpeed / a.movingFrames)
      : 0,
    meanAbsAccelPxS2: a.accelSamples
      ? Math.round(a.sumAbsAccel / a.accelSamples)
      : 0,
  };
}

export interface GameMovementSummary extends MovementSummary {
  /** frame counts by player paddle-centre y, top band first. */
  restingHistogram: number[];
}

export function finalizeGameMove(
  a: MoveAccum,
  restingHistogram: number[],
): GameMovementSummary {
  return { ...finalizeMove(a), restingHistogram: [...restingHistogram] };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
