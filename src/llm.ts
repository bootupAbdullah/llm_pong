// Phase 4 — LLM layer. Batches recent rally metrics (already recorded by
// recorder.ts / read via getBotDebugInfo) into one request to a local Ollama
// model, expecting back short commentary plus a bounded bot-play nudge.
// Design + staging: .claude/phase-4-handoff.md.
//
// Stage 1 (current): batching + request plumbing only. Requests fire and are
// logged to the console; nothing yet reads getLlmNudge()/getLastCommentary().
// Module-singleton, same shape as difficulty.ts/prefs.ts — not per-instance
// state, since there's exactly one game/one LLM channel at a time.

import * as recorder from './metrics/recorder';
import type { BotDebugInfo } from './types';
import {
  LLM_BATCH_RALLIES,
  LLM_REQUEST_TIMEOUT_MS,
  OLLAMA_ENDPOINT,
  OLLAMA_MODEL,
} from './constants';

/** Bounded bot-play adjustment requested by the LLM, each axis -1..1.
 *  Combined with Phase 3's streak drift inside the same BOT_DRIFT_MAX_FRACTION
 *  envelope (Stage 3) rather than getting its own budget — see
 *  phase-4-handoff.md's "Bot-feedback seam". */
export interface LlmBotNudge {
  speed: number;
  reaction: number;
  tracking: number;
}

export type LlmStatus = 'idle' | 'pending' | 'ok' | 'error';

export interface LlmDebugInfo {
  status: LlmStatus;
  ralliesSinceLastCall: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastCommentary: string | null;
  lastNudge: LlmBotNudge;
}

const ZERO_NUDGE: LlmBotNudge = { speed: 0, reaction: 0, tracking: 0 };

const state = {
  ralliesSinceLastCall: 0,
  inFlight: false,
  status: 'idle' as LlmStatus,
  lastLatencyMs: null as number | null,
  lastError: null as string | null,
  lastCommentary: null as string | null,
  lastNudge: ZERO_NUDGE,
};

/** Single-subscriber hook for the commentary panel (Stage 2) — commentary
 *  updates are rare, discrete events (roughly once per batch), so a callback
 *  fits better here than the debug panel's poll-every-frame style. */
let commentaryListener: ((text: string) => void) | null = null;

export function subscribeCommentary(cb: (text: string) => void): void {
  commentaryListener = cb;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Call once per completed rally (awardPoint() in game.ts). Fires a batched
 *  request once LLM_BATCH_RALLIES rallies have accumulated. If a request is
 *  already in flight, the count keeps growing instead of resetting, so the
 *  next eligible rally after it resolves fires immediately — never more than
 *  one request in flight at a time, and no rally's worth of data is silently
 *  dropped from the next batch. */
export function onRallyComplete(botDebugInfo: BotDebugInfo): void {
  state.ralliesSinceLastCall += 1;
  if (state.ralliesSinceLastCall < LLM_BATCH_RALLIES) return;
  if (state.inFlight) return;
  state.ralliesSinceLastCall = 0;
  void requestUpdate(botDebugInfo);
}

export function getLlmNudge(): LlmBotNudge {
  return state.lastNudge;
}

export function getLastCommentary(): string | null {
  return state.lastCommentary;
}

export function getLlmDebugInfo(): LlmDebugInfo {
  return {
    status: state.status,
    ralliesSinceLastCall: state.ralliesSinceLastCall,
    lastLatencyMs: state.lastLatencyMs,
    lastError: state.lastError,
    lastCommentary: state.lastCommentary,
    lastNudge: state.lastNudge,
  };
}

interface RalliesPayloadLeg {
  reactionMs: number | null;
  trackingErrorPx: number | null;
  overshootPx: number | null;
  contactOffsetNorm: number | null;
}

interface RalliesPayloadEntry {
  wonByPlayer: boolean | null;
  legs: RalliesPayloadLeg[];
}

/** Player-perspective legs from the last LLM_BATCH_RALLIES completed
 *  rallies of the in-progress game (recorder.getCurrentGame() is live, not
 *  just populated at game end). */
function buildRalliesPayload(): RalliesPayloadEntry[] {
  const rallies = recorder.getCurrentGame()?.rallies ?? [];
  return rallies.slice(-LLM_BATCH_RALLIES).map((rally) => ({
    wonByPlayer: rally.wonByPlayer,
    legs: rally.legs
      .filter((leg) => leg.towardPlayer)
      .map((leg) => ({
        reactionMs: leg.reaction?.derivedMs ?? null,
        trackingErrorPx: leg.accuracy?.meanTrackingErrorPx ?? null,
        overshootPx: leg.accuracy?.overshootPx ?? null,
        contactOffsetNorm: leg.accuracy?.contactOffsetNorm ?? null,
      })),
  }));
}

function buildPrompt(botDebugInfo: BotDebugInfo): string {
  const snapshot = recorder.getSnapshot();
  const payload = {
    score: snapshot.score,
    difficulty: botDebugInfo.difficulty,
    currentBotTuning: {
      maxSpeed: Math.round(botDebugInfo.effMaxSpeed),
      reactionDelayMs: Math.round(botDebugInfo.effReactionDelayMs),
      trackingErrorPx: Math.round(botDebugInfo.effTrackingErrorPx),
    },
    streaks: snapshot.streaks,
    recentRallies: buildRalliesPayload(),
  };
  return [
    'You are a live, terse commentator for a game of Pong between a human player and a bot opponent.',
    'You are given recent rally data as JSON. Reply with ONLY a JSON object of exactly this shape, no other text, no markdown fences:',
    '{"commentary": string, "botNudge": {"speed": number, "reaction": number, "tracking": number}}',
    '"commentary" is one short sentence (<=25 words) reacting to how the player is doing right now.',
    '"botNudge" is a small adjustment to the bot\'s difficulty within its current tier, each axis from -1 (much easier) to 1 (much tougher). Use small values (-0.3 to 0.3) unless play has been extremely one-sided.',
    '',
    'Data:',
    JSON.stringify(payload),
  ].join('\n');
}

function isLlmBotNudge(v: unknown): v is LlmBotNudge {
  if (typeof v !== 'object' || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.speed === 'number' &&
    typeof n.reaction === 'number' &&
    typeof n.tracking === 'number'
  );
}

async function requestUpdate(botDebugInfo: BotDebugInfo): Promise<void> {
  state.inFlight = true;
  state.status = 'pending';
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildPrompt(botDebugInfo),
        format: 'json',
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
    const data = (await res.json()) as { response?: unknown };
    if (typeof data.response !== 'string') {
      throw new Error('Ollama response missing "response" string field');
    }
    const parsed = JSON.parse(data.response) as Record<string, unknown>;
    if (
      typeof parsed.commentary !== 'string' ||
      !isLlmBotNudge(parsed.botNudge)
    ) {
      throw new Error('LLM response failed shape validation');
    }
    state.lastCommentary = parsed.commentary;
    state.lastNudge = {
      speed: clamp(parsed.botNudge.speed, -1, 1),
      reaction: clamp(parsed.botNudge.reaction, -1, 1),
      tracking: clamp(parsed.botNudge.tracking, -1, 1),
    };
    state.status = 'ok';
    state.lastError = null;
    commentaryListener?.(state.lastCommentary);
    console.debug('[llm-pong] LLM update applied', {
      commentary: state.lastCommentary,
      nudge: state.lastNudge,
    });
  } catch (err) {
    state.status = 'error';
    state.lastError = err instanceof Error ? err.message : String(err);
    // Skip silently as far as gameplay is concerned -- prior commentary/nudge
    // stay in effect. Only a console note, no player-facing error.
    console.debug(
      '[llm-pong] LLM update failed, keeping prior state:',
      state.lastError,
    );
  } finally {
    clearTimeout(timeout);
    state.lastLatencyMs = Math.round(performance.now() - startedAt);
    state.inFlight = false;
  }
}
