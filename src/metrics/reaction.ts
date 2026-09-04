// Reaction-time metric — tuning, summary shapes, and per-game aggregation.
//
// Definition (agreed in design):
//   stimulus  — the moment the ball turns toward the player, i.e. the start of
//               a leg whose towardSide is the player's side (a serve at them, or
//               a bot/wall bounce that sends the ball their way).
//   response  — the first moment the player moves the paddle toward where the
//               ball is going.
//   if the paddle is already within `positionedTolerancePx` of the predicted
//   intercept at the stimulus, no reaction was required: recorded as null and
//   left out of the averages (not counted as zero).
//
// Two response estimates are captured per leg and neither is load-bearing yet:
//   derivedMs — from paddle motion (works in every control mode, ~1 frame of
//               latency + a speed threshold)
//   inputMs   — from the raw input event (keydown / paddle grab / slider nudge),
//               a cleaner timestamp where the mode gives us one
// Keep both; decide which is the more useful signal once there's real data.
//
// The per-frame detection lives in recorder.ts (it needs the live prediction);
// this module holds the pure pieces.

export const REACTION_TUNING = {
  /** Paddle within this of the predicted intercept at the stimulus => no
   *  reaction needed. Roughly half a paddle height. */
  positionedTolerancePx: 40,
  /** |paddle velocity| above this (px/s) counts as a deliberate move. */
  responseSpeedPxS: 30,
  /** Ignore "moving toward the intercept" when the paddle is basically there. */
  minGapPx: 6,
};

export type ReactionInputKind = 'key' | 'drag' | 'slider';

export interface LegReactionSummary {
  /** Was the paddle out of position at the stimulus? */
  needed: boolean;
  /** |paddle centre − predicted intercept| at the stimulus, px. */
  paddleOffsetAtStimulusPx: number;
  /** Response latency from paddle motion, ms. Null if never moved toward it. */
  derivedMs: number | null;
  /** Response latency from the raw input event, ms. Null if no input seen. */
  inputMs: number | null;
  inputKind: ReactionInputKind | null;
}

export interface GameReactionSummary {
  /** Legs where a reaction was needed and a derived latency was measured. */
  measured: number;
  /** Legs where the paddle was already in position. */
  noReactionNeeded: number;
  meanDerivedMs: number | null;
  medianDerivedMs: number | null;
  bestDerivedMs: number | null;
  meanInputMs: number | null;
}

export function summarizeReactions(
  all: Array<LegReactionSummary | null>,
): GameReactionSummary {
  const legs = all.filter((r): r is LegReactionSummary => r !== null);
  const needed = legs.filter((r) => r.needed);
  const derived = needed
    .map((r) => r.derivedMs)
    .filter((v): v is number => v !== null);
  const inputs = needed
    .map((r) => r.inputMs)
    .filter((v): v is number => v !== null);

  return {
    measured: derived.length,
    noReactionNeeded: legs.length - needed.length,
    meanDerivedMs: mean(derived),
    medianDerivedMs: median(derived),
    bestDerivedMs: derived.length ? Math.min(...derived) : null,
    meanInputMs: mean(inputs),
  };
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
