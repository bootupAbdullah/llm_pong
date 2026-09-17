// Fixed gameplay constants. Ported verbatim from the Phase 1 inline script;
// values unchanged.

import type { Difficulty } from './types';

export const PADDLE_W = 12;
export const PADDLE_H = 80;
export const PADDLE_MARGIN = 20;
export const BALL_R = 8;
export const WIN_SCORE = 11;
export const BOT_MAX_SPEED = 340; // px/sec
export const BALL_BASE_SPEED = 320; // px/sec
export const BALL_SPEED_STEP = 18; // px/sec added per paddle hit
export const BALL_MAX_SPEED = 620;

// Keyboard control mode: how fast the keys drive the paddle, px/sec. The player
// picks a notch on a slider shown under the mode picker when Keyboard is active.
// Notch 0 (550) is the default floor — the Phase 1 fixed speed of 420 tested too
// sluggish even as a floor. The top notch stays low enough to keep keyboard play
// a skill expression, not a cheat. The metrics layer records the active notch
// alongside keyboard-mode samples.
export const KEY_SPEED_NOTCHES = [550, 680, 810, 950, 1080] as const; // px/sec
export const DEFAULT_KEY_SPEED_NOTCH = 0; // default = the floor

// Bot difficulty (Phase 3). Stage 0: default tier only — the per-tier bot
// parameters land in a later stage.
export const DEFAULT_DIFFICULTY: Difficulty = 'medium';
