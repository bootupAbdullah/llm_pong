// Phase 2 metrics — the recorder (Stage 1: plumbing).
//
// A module singleton, like prefs.ts. The game loop drives it through a handful
// of hooks:
//
//   beginFrame(t, dt)      once per frame, before step()  — sets the clock
//   commitFrame(state)     once per frame, after step()   — pushes a FrameSample
//   onGameStart(side)      before the first serve of a game
//   onServe(towards, ...)  every serve                    — opens a rally + leg
//   onPaddleHit(side, ...) ball reversed off a paddle     — closes/opens a leg
//   onWallBounce()         ball reversed off a wall       — counts on the leg
//   onSideChange(side)     player switched left/right
//   onPoint(winner, side)  a point was scored             — closes the rally
//   onGameEnd(winner, ...) the winning point              — finalizes + saves
//
// Nothing here computes a derived metric yet — later stages read getFrames()
// and the rally/leg tree and fill in the numbers.

import type { Ball, ControlMode, Paddle, Side } from '../types';
import { getKeySpeedNotch } from '../prefs';
import { predict, type Prediction } from './predictor';
import type {
  FrameSample,
  GameSummary,
  LegRecord,
  RallyRecord,
  RecorderSnapshot,
} from './types';

const FRAME_CAPACITY = 20000; // ~5.5 min at 60fps
const GAMES_STORAGE_KEY = 'pongGames';
const MAX_SAVED_GAMES = 20;

// --- per-frame ring buffer -------------------------------------------------

const frames: FrameSample[] = [];
let frameHead = 0; // next write index
let frameCount = 0;

function pushFrame(s: FrameSample): void {
  frames[frameHead] = s;
  frameHead = (frameHead + 1) % FRAME_CAPACITY;
  if (frameCount < FRAME_CAPACITY) frameCount += 1;
}

/** All buffered frames, oldest first. */
export function getFrames(): FrameSample[] {
  if (frameCount < FRAME_CAPACITY) return frames.slice(0, frameCount);
  return frames.slice(frameHead).concat(frames.slice(0, frameHead));
}

// --- clock ---------------------------------------------------------------

let clockT = typeof performance !== 'undefined' ? performance.now() : 0;
let clockDt = 0;

export function beginFrame(t: number, dt: number): void {
  clockT = t;
  clockDt = dt;
}

// --- match segmentation --------------------------------------------------

let rallyIndex = -1;
let legIndex = -1;
let currentRally: RallyRecord | null = null;
let currentLeg: LegRecord | null = null;
let game: GameSummary | null = null;
let lastFrame: FrameSample | null = null;
let latestScore = { left: 0, right: 0 };
let gamesSaved = countSavedGames();

// --- playfield geometry (for the predictor) ------------------------------

interface Geometry {
  height: number;
  ballR: number;
  contactPlaneLeft: number;
  contactPlaneRight: number;
}

let geometry: Geometry | null = null;
let currentPrediction: Prediction | null = null;

/** Called once by the game with the fixed playfield geometry. */
export function configure(g: Geometry): void {
  geometry = g;
}

export function getCurrentPrediction(): Prediction | null {
  return currentPrediction;
}

function otherSide(s: Side): Side {
  return s === 'left' ? 'right' : 'left';
}

function closeLeg(endedBy: LegRecord['endedBy']): void {
  if (!currentLeg) return;
  currentLeg.endT = clockT;
  currentLeg.endedBy = endedBy;
  currentLeg = null;
}

function openLeg(
  towardSide: Side,
  playerSide: Side,
  controlMode: ControlMode,
): void {
  legIndex += 1;
  currentLeg = {
    index: legIndex,
    towardSide,
    towardPlayer: towardSide === playerSide,
    startT: clockT,
    endT: null,
    wallBounces: 0,
    endedBy: null,
    controlMode,
  };
  currentRally?.legs.push(currentLeg);
}

export function onGameStart(playerSide: Side): void {
  // any in-progress game is discarded — only finished games are saved
  game = {
    schemaVersion: 1,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: 0,
    winner: null,
    wonByPlayer: null,
    finalScore: { left: 0, right: 0 },
    playerSideAtEnd: playerSide,
    rallyCount: 0,
    rallies: [],
  };
  rallyIndex = -1;
  legIndex = -1;
  currentRally = null;
  currentLeg = null;
  latestScore = { left: 0, right: 0 };
}

export function onServe(
  towards: Side,
  playerSide: Side,
  controlMode: ControlMode,
): void {
  // defensive: close anything left open from a prior rally
  closeLeg('point');
  if (currentRally && currentRally.endT === null) currentRally.endT = clockT;

  rallyIndex += 1;
  legIndex = -1;
  currentRally = {
    index: rallyIndex,
    startT: clockT,
    endT: null,
    winner: null,
    wonByPlayer: null,
    legs: [],
  };
  game?.rallies.push(currentRally);
  openLeg(towards, playerSide, controlMode);
}

export function onPaddleHit(
  hitSide: Side,
  playerSide: Side,
  controlMode: ControlMode,
): void {
  // ball was heading toward hitSide; it now reverses toward the other end
  closeLeg('hit');
  openLeg(otherSide(hitSide), playerSide, controlMode);
}

export function onWallBounce(): void {
  if (currentLeg) currentLeg.wallBounces += 1;
}

export function onSideChange(playerSide: Side): void {
  if (currentLeg) {
    currentLeg.towardPlayer = currentLeg.towardSide === playerSide;
  }
}

export function onPoint(winner: Side, playerSide: Side): void {
  closeLeg('point');
  if (currentRally) {
    currentRally.endT = clockT;
    currentRally.winner = winner;
    currentRally.wonByPlayer = winner === playerSide;
  }
  currentRally = null;
}

export function onGameEnd(
  winner: Side,
  playerSide: Side,
  score: { left: number; right: number },
): void {
  closeLeg('gameEnd');
  if (currentRally && currentRally.endT === null) currentRally.endT = clockT;
  currentRally = null;

  if (!game) return;
  game.endedAt = Date.now();
  game.durationMs = game.endedAt - game.startedAt;
  game.winner = winner;
  game.wonByPlayer = winner === playerSide;
  game.finalScore = { ...score };
  game.playerSideAtEnd = playerSide;
  game.rallyCount = game.rallies.length;
  saveGame(game);
}

// --- per-frame sample --------------------------------------------------

interface FrameState {
  ball: Ball;
  player: Paddle;
  bot: Paddle;
  playerSide: Side;
  controlMode: ControlMode;
  score: { left: number; right: number };
}

export function commitFrame(st: FrameState): void {
  const sample: FrameSample = {
    t: clockT,
    dt: clockDt,
    ballX: st.ball.x,
    ballY: st.ball.y,
    ballVx: st.ball.vx,
    ballVy: st.ball.vy,
    playerY: st.player.y,
    botY: st.bot.y,
    playerSide: st.playerSide,
    controlMode: st.controlMode,
    keySpeedNotch: getKeySpeedNotch(),
    rallyIndex,
    legIndex,
  };
  pushFrame(sample);
  lastFrame = sample;
  latestScore = { ...st.score };

  if (geometry && currentLeg) {
    currentPrediction = predict({
      ballX: st.ball.x,
      ballY: st.ball.y,
      ballVx: st.ball.vx,
      ballVy: st.ball.vy,
      ballR: geometry.ballR,
      height: geometry.height,
      targetX:
        currentLeg.towardSide === 'left'
          ? geometry.contactPlaneLeft
          : geometry.contactPlaneRight,
    });
  } else {
    currentPrediction = null;
  }
}

// --- persistence ------------------------------------------------------

function countSavedGames(): number {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (e) {
    return 0;
  }
}

function saveGame(g: GameSummary): void {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list: GameSummary[] = Array.isArray(parsed) ? parsed : [];
    list.push(g);
    while (list.length > MAX_SAVED_GAMES) list.shift();
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(list));
    gamesSaved = list.length;
  } catch (e) {
    // localStorage unavailable — the in-memory summary still exists this session
  }
}

/** Saved game summaries, oldest first. */
export function getSavedGames(): GameSummary[] {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// --- live view / dev access ------------------------------------------

export function getSnapshot(): RecorderSnapshot {
  return {
    framesBuffered: frameCount,
    frameCapacity: FRAME_CAPACITY,
    lastFrame,
    rallyIndex,
    legIndex,
    currentLeg,
    ralliesThisGame: game ? game.rallies.length : 0,
    score: { ...latestScore },
    gamesSaved,
    prediction: currentPrediction,
  };
}

/** In-memory summary of the game currently being played (unfinished). */
export function getCurrentGame(): GameSummary | null {
  return game;
}
