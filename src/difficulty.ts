// Bot difficulty preference. Stage 0 (Phase 3): persisted pref only, not yet
// read by the bot — updateBotPaddle() in game.ts still uses the fixed
// BOT_MAX_SPEED. Later Phase 3 stages make the bot read this. Own persistence,
// same shape as prefs.ts (keyboard sensitivity) — a game-control preference,
// not a site-wide setting, so it stays out of the settings menu.

import type { Difficulty } from './types';
import { DEFAULT_DIFFICULTY } from './constants';

const STORAGE_KEY = 'pongDifficulty';
const VALID: readonly Difficulty[] = ['easy', 'medium', 'hard'];

function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (VALID as readonly string[]).includes(v);
}

function loadDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isDifficulty(raw)) return raw;
  } catch (e) {
    // localStorage unavailable -- fall back to the default
  }
  return DEFAULT_DIFFICULTY;
}

let difficulty = loadDifficulty();

export function getDifficulty(): Difficulty {
  return difficulty;
}

export function setDifficulty(next: Difficulty): void {
  difficulty = next;
  try {
    localStorage.setItem(STORAGE_KEY, difficulty);
  } catch (e) {
    // localStorage unavailable -- applies for this session only
  }
}
