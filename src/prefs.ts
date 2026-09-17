// Cross-module preference state. The keyboard-sensitivity slider (in game.ts,
// under the mode picker) writes it; the game loop reads it every frame while in
// keyboard mode. Owns its own persistence — this is a game-control preference,
// not a site-wide setting, so it stays out of the settings menu.

import { DEFAULT_KEY_SPEED_NOTCH, KEY_SPEED_NOTCHES } from './constants';

const STORAGE_KEY = 'pongKeySpeed';
const MAX_NOTCH = KEY_SPEED_NOTCHES.length - 1;

function clampNotch(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_KEY_SPEED_NOTCH;
  return Math.max(0, Math.min(MAX_NOTCH, Math.round(n)));
}

function loadNotch(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return clampNotch(Number(raw));
  } catch (e) {
    // localStorage unavailable -- fall back to the default
  }
  return DEFAULT_KEY_SPEED_NOTCH;
}

let notch = loadNotch();

/** Current slider notch, 0..(KEY_SPEED_NOTCHES.length - 1). */
export function getKeySpeedNotch(): number {
  return notch;
}

export function setKeySpeedNotch(n: number): void {
  notch = clampNotch(n);
  try {
    localStorage.setItem(STORAGE_KEY, String(notch));
  } catch (e) {
    // localStorage unavailable -- applies for this session only
  }
}

/** Resolved keyboard paddle speed, px/sec. Read every frame in keyboard mode. */
export function getKeySpeed(): number {
  return KEY_SPEED_NOTCHES[notch] ?? KEY_SPEED_NOTCHES[DEFAULT_KEY_SPEED_NOTCH];
}
