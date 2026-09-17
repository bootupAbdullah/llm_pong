// Shared game-state shapes. Kept deliberately small for Stage 0 — the metrics
// stages add their own types alongside these.

export type Side = 'left' | 'right';

/** How the player's paddle is currently being driven. */
export type ControlMode = 'slider' | 'drag' | 'keyboard';

/** Bot difficulty tier. Stage 0 (Phase 3): persisted pref only, not yet
 * wired to bot behaviour. */
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
