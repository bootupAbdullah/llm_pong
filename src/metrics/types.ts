// Phase 2 metrics — data shapes.
//
// Stage 1 records only *raw* state: per-frame snapshots plus the segmentation of
// play into rallies and legs. No derived metrics yet (velocity, reaction time,
// accuracy, movement patterns) — those stages compute from FrameSample[] and
// hang their results off LegRecord / RallyRecord / GameSummary.

import type { ControlMode, Side } from '../types';
import type { Prediction } from './predictor';

/** One per-frame snapshot of raw game state, taken after the frame's step(). */
export interface FrameSample {
  /** rAF timestamp, ms (same timebase as performance.now()). */
  t: number;
  /** Frame delta, seconds (already clamped by the game loop). */
  dt: number;
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
  /** Player paddle top edge, canvas px. */
  playerY: number;
  /** Bot paddle top edge, canvas px. */
  botY: number;
  playerSide: Side;
  controlMode: ControlMode;
  /** Keyboard-sensitivity notch active this frame (meaningful in keyboard mode). */
  keySpeedNotch: number;
  rallyIndex: number;
  legIndex: number;
}

/** A stretch of a rally where the ball travels toward one end, bounded by a
 *  serve/paddle-hit at the start and a paddle-hit/point at the end. Wall bounces
 *  do not split a leg. */
export interface LegRecord {
  index: number;
  /** Which end the ball is travelling toward. */
  towardSide: Side;
  /** Whether that end is the player's paddle (re-evaluated on a side switch). */
  towardPlayer: boolean;
  startT: number;
  endT: number | null;
  wallBounces: number;
  endedBy: 'hit' | 'point' | 'gameEnd' | null;
  controlMode: ControlMode;
}

/** Serve to point. */
export interface RallyRecord {
  index: number;
  startT: number;
  endT: number | null;
  winner: Side | null;
  wonByPlayer: boolean | null;
  legs: LegRecord[];
}

/** The player's record of one finished game. Persisted to localStorage; shaped
 *  to migrate to a per-user store later. Frame samples are NOT included here —
 *  they stay in memory only. */
export interface GameSummary {
  schemaVersion: 1;
  startedAt: number; // Date.now() at first serve
  endedAt: number | null; // Date.now() at the winning point
  durationMs: number;
  winner: Side | null;
  wonByPlayer: boolean | null;
  finalScore: { left: number; right: number };
  playerSideAtEnd: Side;
  rallyCount: number;
  rallies: RallyRecord[];
}

/** Live view for the debug panel. */
export interface RecorderSnapshot {
  framesBuffered: number;
  frameCapacity: number;
  lastFrame: FrameSample | null;
  rallyIndex: number;
  legIndex: number;
  currentLeg: LegRecord | null;
  ralliesThisGame: number;
  score: { left: number; right: number };
  gamesSaved: number;
  /** Live ball-path prediction to the end the ball is currently heading toward. */
  prediction: Prediction | null;
}
