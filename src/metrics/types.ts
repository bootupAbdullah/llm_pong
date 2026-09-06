// Phase 2 metrics — data shapes.
//
// FrameSample[] is the raw substrate (memory only). The derived metrics —
// paddle velocity, movement patterns, reaction time, accuracy, streaks — hang
// off LegRecord / RallyRecord / GameSummary. GameSummary is the persisted
// player record; it is schemaVersion 1 and FROZEN as of Phase 2 Stage 6:
// add fields, never repurpose one, and bump schemaVersion for a breaking
// change so old saved games can be filtered or migrated.

import type { ControlMode, Side } from '../types';
import type { Prediction } from './predictor';
import type { GameMovementSummary, MovementSummary } from './movement';
import type {
  GameReactionSummary,
  LegReactionSummary,
  ReactionInputKind,
} from './reaction';
import type { GameAccuracySummary, LegAccuracySummary } from './accuracy';
import type { StreakSummary } from './streaks';

/** One per-frame snapshot of raw game state, taken after the frame's step(). */
export interface FrameSample {
  /** Accumulated play time, ms from 0 (excludes paused time). */
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
  /** Player paddle velocity this frame, px/sec (0 on the first frame). */
  playerVy: number;
  /** Bot paddle velocity this frame, px/sec. */
  botVy: number;
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
  /** Keyboard-sensitivity notch at leg start (for reading keyboard-mode legs). */
  keySpeedNotch: number;
  /** Player paddle movement over this leg. Null until the leg closes. */
  movement: MovementSummary | null;
  /** Player reaction on this leg. Null on bot legs and until the leg closes. */
  reaction: LegReactionSummary | null;
  /** Contact + tracking accuracy + overshoot. Null on bot legs and until close. */
  accuracy: LegAccuracySummary | null;
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
  /** Ball-path predictor version behind the tracking/overshoot numbers. */
  predictorVersion: number;
  startedAt: number; // Date.now() at first serve
  endedAt: number | null; // Date.now() at the winning point
  durationMs: number; // wall-clock (includes pauses)
  winner: Side | null;
  wonByPlayer: boolean | null;
  finalScore: { left: number; right: number };
  playerSideAtEnd: Side;
  rallyCount: number;
  rallies: RallyRecord[];
  /** Player paddle movement over the whole game. Null until the game ends. */
  movement: GameMovementSummary | null;
  /** Player reaction time over the whole game. Null until the game ends. */
  reaction: GameReactionSummary | null;
  /** Player accuracy over the whole game. Null until the game ends. */
  accuracy: GameAccuracySummary | null;
  /** Win/loss streaks over the game. Null until the game ends. */
  streaks: StreakSummary | null;
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
  /** Player paddle velocity, px/sec: raw (last frame) and EMA-smoothed. */
  playerVy: number;
  playerVySmoothed: number;
  /** Movement so far this leg (live running totals), or null between legs. */
  currentLegMovement: MovementSummary | null;
  /** Live reaction state for the current player leg, or null. */
  reaction: LiveReaction | null;
  /** Live accuracy state for the current player leg, or null. */
  accuracy: LiveAccuracy | null;
  /** Win/loss streaks so far this game. */
  streaks: StreakSummary;
  /** The most recently completed player leg's finished metrics, or null. */
  lastPlayerLeg: {
    reaction: LegReactionSummary | null;
    accuracy: LegAccuracySummary | null;
  } | null;
}

export interface LiveAccuracy {
  meanTrackingErrorPx: number;
  overshootPx: number;
}

export interface LiveReaction {
  sinceStimulusMs: number;
  offsetAtStimulusPx: number;
  needed: boolean;
  derivedMs: number | null;
  inputMs: number | null;
  inputKind: ReactionInputKind | null;
}
