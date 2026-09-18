// Shared game-state shapes. Kept deliberately small for Stage 0 — the metrics
// stages add their own types alongside these.

export type Side = 'left' | 'right';

/** How the player's paddle is currently being driven. */
export type ControlMode = 'slider' | 'drag' | 'keyboard';

/** Bot difficulty tier. Drives BOT_TUNING in constants.ts (Phase 3 Stage 1). */
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Paddle {
  /** Top edge of the paddle, in canvas px. */
  y: number;
  /** Value of `y` on the previous frame, so velocity can be derived later. */
  prevY: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Score {
  left: number;
  right: number;
}

/** Live bot state for the #debug panel (Phase 3 Stage 4) — the selected
 * tier plus its currently-effective parameters after drift is applied. */
export interface BotDebugInfo {
  difficulty: Difficulty;
  driftFraction: number;
  effMaxSpeed: number;
  effReactionDelayMs: number;
  effTrackingErrorPx: number;
}
