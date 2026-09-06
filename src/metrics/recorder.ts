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
// Stage 3 adds derived movement/velocity: per-frame player+bot paddle velocity
// on each sample, and MoveAccum accumulators fed every frame that finalise into
// a per-leg MovementSummary and a per-game GameMovementSummary.

import type { Ball, ControlMode, Paddle, Side } from '../types';
import { getKeySpeedNotch } from '../prefs';
import { predict, type Prediction } from './predictor';
import {
  MOVE_TUNING,
  feedMove,
  finalizeGameMove,
  finalizeMove,
  newMoveAccum,
  type MoveAccum,
} from './movement';
import {
  REACTION_TUNING,
  summarizeReactions,
  type LegReactionSummary,
  type ReactionInputKind,
} from './reaction';
import {
  feedAcc,
  finalizeAcc,
  newAccAccum,
  summarizeAccuracy,
  type AccAccum,
} from './accuracy';
import {
  cloneStreaks,
  newStreakSummary,
  pushOutcome,
  type StreakSummary,
} from './streaks';
import type {
  FrameSample,
  GameSummary,
  LegRecord,
  LiveReaction,
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

// Accumulated *play time* in ms, from 0. Only advances on beginFrame, which the
// game loop skips while paused or after a win — so paused time is naturally
// excluded from every leg / rally / reaction duration. (Wall-clock game length
// still comes from Date.now() in the GameSummary.)
let clockT = 0;
let clockDt = 0;

export function beginFrame(dt: number): void {
  clockT += Math.max(0, dt) * 1000;
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
  paddleH: number;
  contactPlaneLeft: number;
  contactPlaneRight: number;
}

let geometry: Geometry | null = null;
let currentPrediction: Prediction | null = null;

// --- derived movement / velocity ----------------------------------------

let prevPlayerY: number | null = null;
let prevBotY: number | null = null;
let prevPlayerVy: number | null = null;
let lastPlayerVy = 0;
let lastPlayerVySmoothed = 0;
let legMove: MoveAccum | null = null;
let gameMove: MoveAccum = newMoveAccum();
let restingHist: number[] = new Array(MOVE_TUNING.restingBins).fill(0);

function resetMovement(): void {
  prevPlayerY = null;
  prevBotY = null;
  prevPlayerVy = null;
  lastPlayerVy = 0;
  lastPlayerVySmoothed = 0;
  legMove = null;
  gameMove = newMoveAccum();
  restingHist = new Array(MOVE_TUNING.restingBins).fill(0);
}

// --- reaction time (per player leg) ------------------------------------

interface ReactionState {
  legIndex: number;
  stimulusT: number; // play-time ms at leg start (ball turned toward player)
  captured: boolean; // stimulus-frame paddle offset recorded yet
  offsetAtStimulus: number; // |paddle centre − predicted intercept|, px
  derivedT: number | null; // play-time ms of first deliberate move toward it
  inputT: number | null; // play-time ms of first raw input event
  inputKind: ReactionInputKind | null;
}

let reaction: ReactionState | null = null;

// --- accuracy + streaks ----------------------------------------------

let accAccum: AccAccum | null = null;
let streaks: StreakSummary = newStreakSummary();
let lastPlayerLeg: {
  reaction: LegReactionSummary | null;
  accuracy: LegRecord['accuracy'];
} | null = null;

function finalizeReaction(r: ReactionState): LegReactionSummary {
  return {
    needed: r.offsetAtStimulus > REACTION_TUNING.positionedTolerancePx,
    paddleOffsetAtStimulusPx: Math.round(r.offsetAtStimulus),
    derivedMs: r.derivedT !== null ? Math.round(r.derivedT - r.stimulusT) : null,
    inputMs: r.inputT !== null ? Math.round(r.inputT - r.stimulusT) : null,
    inputKind: r.inputKind,
  };
}

/** Raw input-event stamp — called by the game on keydown / paddle grab /
 *  slider nudge. Records the first event after the stimulus on a player leg. */
export function onPlayerInput(kind: ReactionInputKind): void {
  if (reaction && reaction.inputT === null && clockT >= reaction.stimulusT) {
    reaction.inputT = clockT;
    reaction.inputKind = kind;
  }
}

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

interface Contact {
  ballY: number;
  paddleCentreY: number;
}

function closeLeg(endedBy: LegRecord['endedBy'], contact?: Contact): void {
  if (!currentLeg) return;
  currentLeg.endT = clockT;
  currentLeg.endedBy = endedBy;
  if (legMove) currentLeg.movement = finalizeMove(legMove);
  if (reaction && reaction.legIndex === currentLeg.index) {
    currentLeg.reaction = finalizeReaction(reaction);
  }
  if (accAccum && geometry) {
    const halfH = geometry.paddleH / 2;
    let madeContact = false;
    let offsetPx = 0;
    if (endedBy === 'hit' && contact) {
      madeContact = true;
      offsetPx = Math.abs(contact.ballY - contact.paddleCentreY);
    } else if (lastFrame) {
      // conceded or game end — offset at the last recorded frame
      offsetPx = Math.abs(lastFrame.ballY - (lastFrame.playerY + halfH));
    }
    currentLeg.accuracy = finalizeAcc(accAccum, madeContact, offsetPx, halfH);
  }

  const wasPlayerLeg = accAccum !== null || reaction !== null;
  if (wasPlayerLeg) {
    lastPlayerLeg = {
      reaction: currentLeg.reaction,
      accuracy: currentLeg.accuracy,
    };
  }

  currentLeg = null;
  legMove = null;
  reaction = null;
  accAccum = null;
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
    movement: null,
    reaction: null,
    accuracy: null,
  };
  legMove = newMoveAccum();
  const playerLeg = towardSide === playerSide;
  reaction = playerLeg
    ? {
        legIndex,
        stimulusT: clockT,
        captured: false,
        offsetAtStimulus: 0,
        derivedT: null,
        inputT: null,
        inputKind: null,
      }
    : null;
  accAccum = playerLeg ? newAccAccum() : null;
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
    movement: null,
    reaction: null,
    accuracy: null,
    streaks: null,
  };
  rallyIndex = -1;
  legIndex = -1;
  currentRally = null;
  currentLeg = null;
  reaction = null;
  accAccum = null;
  streaks = newStreakSummary();
  lastPlayerLeg = null;
  latestScore = { left: 0, right: 0 };
  resetMovement();
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
  ballY: number,
  paddleCentreY: number,
): void {
  // ball was heading toward hitSide; it now reverses toward the other end.
  // If the player's paddle made the hit, that closes a player leg with contact.
  const contact: Contact | undefined =
    hitSide === playerSide ? { ballY, paddleCentreY } : undefined;
  closeLeg('hit', contact);
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
  pushOutcome(streaks, winner === playerSide);
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
  game.movement = finalizeGameMove(gameMove, restingHist);
  game.reaction = summarizeReactions(
    game.rallies.flatMap((r) => r.legs.map((l) => l.reaction)),
  );
  game.accuracy = summarizeAccuracy(
    game.rallies.flatMap((r) => r.legs.map((l) => l.accuracy)),
  );
  game.streaks = cloneStreaks(streaks);
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
  const dt = clockDt > 0 ? clockDt : 1 / 60;

  const playerDy = prevPlayerY === null ? 0 : st.player.y - prevPlayerY;
  const botDy = prevBotY === null ? 0 : st.bot.y - prevBotY;
  const playerVy = prevPlayerY === null ? 0 : playerDy / dt;
  const botVy = prevBotY === null ? 0 : botDy / dt;
  const playerAccel =
    prevPlayerVy === null ? null : (playerVy - prevPlayerVy) / dt;

  const sample: FrameSample = {
    t: clockT,
    dt: clockDt,
    ballX: st.ball.x,
    ballY: st.ball.y,
    ballVx: st.ball.vx,
    ballVy: st.ball.vy,
    playerY: st.player.y,
    botY: st.bot.y,
    playerVy,
    botVy,
    playerSide: st.playerSide,
    controlMode: st.controlMode,
    keySpeedNotch: getKeySpeedNotch(),
    rallyIndex,
    legIndex,
  };
  pushFrame(sample);
  lastFrame = sample;
  latestScore = { ...st.score };

  // movement accumulation (player paddle)
  const moveFrame = { dy: playerDy, vy: playerVy, accel: playerAccel };
  if (legMove) feedMove(legMove, moveFrame);
  feedMove(gameMove, moveFrame);
  if (geometry) {
    const centreY = st.player.y + geometry.paddleH / 2;
    const frac = centreY / geometry.height;
    const bin = Math.max(
      0,
      Math.min(MOVE_TUNING.restingBins - 1, Math.floor(frac * MOVE_TUNING.restingBins)),
    );
    restingHist[bin] += 1;
  }

  prevPlayerY = st.player.y;
  prevBotY = st.bot.y;
  prevPlayerVy = playerVy;
  lastPlayerVy = playerVy;
  lastPlayerVySmoothed =
    lastPlayerVySmoothed +
    MOVE_TUNING.smoothingAlpha * (playerVy - lastPlayerVySmoothed);

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

  // player-leg per-frame derived metrics (reaction, tracking, overshoot) —
  // all keyed off the gap between the paddle centre and the predicted intercept
  if (
    currentLeg &&
    geometry &&
    currentPrediction &&
    currentPrediction.interceptY !== null &&
    (reaction || accAccum)
  ) {
    const paddleCentre = st.player.y + geometry.paddleH / 2;
    const gap = currentPrediction.interceptY - paddleCentre;

    if (accAccum) feedAcc(accAccum, gap);

    if (reaction && reaction.legIndex === currentLeg.index) {
      if (!reaction.captured) {
        reaction.offsetAtStimulus = Math.abs(gap);
        reaction.captured = true;
      }
      if (
        reaction.derivedT === null &&
        Math.abs(playerVy) > REACTION_TUNING.responseSpeedPxS &&
        Math.abs(gap) > REACTION_TUNING.minGapPx &&
        Math.sign(playerVy) === Math.sign(gap)
      ) {
        reaction.derivedT = clockT;
      }
    }
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
    playerVy: lastPlayerVy,
    playerVySmoothed: lastPlayerVySmoothed,
    currentLegMovement: legMove ? finalizeMove(legMove) : null,
    reaction: liveReaction(),
    accuracy: accAccum
      ? {
          meanTrackingErrorPx: accAccum.frames
            ? Math.round(accAccum.sumTrackErr / accAccum.frames)
            : 0,
          overshootPx: Math.round(Math.max(0, accAccum.maxOvershootPx)),
        }
      : null,
    streaks: cloneStreaks(streaks),
    lastPlayerLeg,
  };
}

function liveReaction(): LiveReaction | null {
  if (!reaction || !reaction.captured) return null;
  return {
    sinceStimulusMs: Math.round(clockT - reaction.stimulusT),
    offsetAtStimulusPx: Math.round(reaction.offsetAtStimulus),
    needed: reaction.offsetAtStimulus > REACTION_TUNING.positionedTolerancePx,
    derivedMs:
      reaction.derivedT !== null
        ? Math.round(reaction.derivedT - reaction.stimulusT)
        : null,
    inputMs:
      reaction.inputT !== null
        ? Math.round(reaction.inputT - reaction.stimulusT)
        : null,
    inputKind: reaction.inputKind,
  };
}

/** In-memory summary of the game currently being played (unfinished). */
export function getCurrentGame(): GameSummary | null {
  return game;
}
