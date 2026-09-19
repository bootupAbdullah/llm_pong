// Phase 2 metrics — the #debug panel.
//
// Shown only when the URL contains "#debug". A developer view of the raw
// recorder state while building the metrics stages — not a shipping UI, but it
// should still be readable, so: grouped into sections named after the metric
// they feed, plain-word labels, explicit units, and a "?" toggle in the header
// that reveals a one-line "what this is for" under every row and section.
//
// The DOM is built once; each tick only rewrites the value cells, so native
// tooltips and the help toggle stay stable. Refreshes ~7x/sec.

import { getSnapshot } from './recorder';
import type { RecorderSnapshot } from './types';
import type { BotDebugInfo } from '../types';
import { formatRule } from './predictor';
import { getLlmDebugInfo, type LlmDebugInfo } from '../llm';
import { LLM_BATCH_RALLIES } from '../constants';

const REFRESH_MS = 140;

interface RowSpec {
  label: string;
  help: string;
  get: (s: RecorderSnapshot) => string;
}

interface SectionSpec {
  title: string;
  help: string;
  rows: RowSpec[];
}

function n(v: number, d = 0): string {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// Bot info doesn't come from the recorder (it's game/bot state, not player
// metrics), so it's cached here each tick instead of flowing through
// RecorderSnapshot like every other row. See initDebugPanel()'s render().
let latestBotInfo: BotDebugInfo | null = null;

// LLM info (Phase 4) is a module-singleton in llm.ts, not routed through
// GameApi like BotDebugInfo -- imported and cached the same way regardless.
let latestLlmInfo: LlmDebugInfo | null = null;

const SECTIONS: SectionSpec[] = [
  {
    title: 'Match',
    help: 'How play is sliced up so stats can be per-point and per-approach.',
    rows: [
      {
        label: 'rally',
        help: 'One rally = a serve until someone scores.',
        get: (s) => `#${s.rallyIndex}`,
      },
      {
        label: 'leg',
        help: 'One leg = the ball travelling toward one end (paddle hit to paddle hit). Reaction time and accuracy are measured per leg.',
        get: (s) =>
          s.currentLeg
            ? `#${s.legIndex}  → ${s.currentLeg.towardSide} (${
                s.currentLeg.towardPlayer ? 'you' : 'bot'
              })`
            : `#${s.legIndex}`,
      },
      {
        label: 'wall bounces',
        help: 'Top/bottom bounces so far this leg — a leg with bounces is harder to read, flagged separately later.',
        get: (s) => (s.currentLeg ? String(s.currentLeg.wallBounces) : '—'),
      },
      {
        label: 'score',
        help: 'Live score by physical side — sanity check that the recorder agrees with the game.',
        get: (s) => `${s.score.left} : ${s.score.right}`,
      },
      {
        label: 'rallies / game',
        help: 'Points played this game.',
        get: (s) => String(s.ralliesThisGame),
      },
      {
        label: 'games saved',
        help: 'Finished games written to browser storage (the player record).',
        get: (s) => String(s.gamesSaved),
      },
      {
        label: 'frames',
        help: 'Per-frame snapshots held in memory. Every derived metric is computed by reading back over these.',
        get: (s) => `${s.framesBuffered} / ${s.frameCapacity}`,
      },
    ],
  },
  {
    title: 'Ball',
    help: 'Raw inputs for the trajectory predictor and for detecting leg starts/ends.',
    rows: [
      {
        label: 'position',
        help: 'Ball centre, canvas pixels.',
        get: (s) =>
          s.lastFrame
            ? `(${n(s.lastFrame.ballX)}, ${n(s.lastFrame.ballY)})`
            : '—',
      },
      {
        label: 'velocity',
        help: 'Ball speed, pixels per second.',
        get: (s) =>
          s.lastFrame
            ? `(${n(s.lastFrame.ballVx)}, ${n(s.lastFrame.ballVy)}) px/s`
            : '—',
      },
    ],
  },
  {
    title: 'Prediction',
    help: 'Where the ball will reach the end it is heading toward. Feeds tracking accuracy, reaction direction, overshoot, and the Phase 3 bot.',
    rows: [
      {
        label: 'crosses at',
        help: 'Predicted y where the ball meets the paddle plane.',
        get: (s) =>
          s.prediction && s.prediction.interceptY !== null
            ? `y ${n(s.prediction.interceptY)}`
            : '—',
      },
      {
        label: 'time to reach',
        help: 'How long until the ball gets there.',
        get: (s) =>
          s.prediction && s.prediction.timeToIntercept !== null
            ? `${n(s.prediction.timeToIntercept * 1000)} ms`
            : '—',
      },
      {
        label: 'bounces',
        help: 'Wall bounces between now and the intercept.',
        get: (s) => (s.prediction ? String(s.prediction.bounces) : '—'),
      },
      {
        label: 'f(x)',
        help: 'The path as a piecewise line, y as a function of x. Model version shown.',
        get: (s) =>
          s.prediction ? `v${s.prediction.version} ${formatRule(s.prediction, 1)}` : '—',
      },
    ],
  },
  {
    title: 'Paddle · you',
    help: 'Raw signal for velocity, distance travelled, and tracking accuracy.',
    rows: [
      {
        label: 'position',
        help: 'Top edge of your paddle, canvas pixels.',
        get: (s) => (s.lastFrame ? `y ${n(s.lastFrame.playerY)}` : '—'),
      },
      {
        label: 'velocity',
        help: 'Your paddle speed now, and a smoothed value in ( ). Pixels per second.',
        get: (s) => `${n(s.playerVy)} px/s  (~${n(s.playerVySmoothed)})`,
      },
      {
        label: 'mode',
        help: 'Active control mode and side. Every metric is tagged with these so modes can be compared.',
        get: (s) =>
          s.lastFrame
            ? `${s.lastFrame.controlMode}${
                s.lastFrame.controlMode === 'keyboard'
                  ? ` · notch ${s.lastFrame.keySpeedNotch}`
                  : ''
              } · ${s.lastFrame.playerSide}`
            : '—',
      },
    ],
  },
  {
    title: 'Reaction · this leg',
    help: 'How long from the ball turning toward you until you move toward where it is going. Player legs only. If you were already in position it reads "not needed" and is left out of the averages.',
    rows: [
      {
        label: 'status',
        help: 'Whether the paddle was out of position when the ball turned toward you.',
        get: (s) =>
          s.reaction
            ? s.reaction.needed
              ? `needed (off ${n(s.reaction.offsetAtStimulusPx)} px)`
              : `not needed (off ${n(s.reaction.offsetAtStimulusPx)} px)`
            : '—',
      },
      {
        label: 'since stimulus',
        help: 'Time since the ball turned toward you this leg.',
        get: (s) => (s.reaction ? `${n(s.reaction.sinceStimulusMs)} ms` : '—'),
      },
      {
        label: 'from movement',
        help: 'Latency measured from the first deliberate paddle move toward the intercept. Works in every mode.',
        get: (s) =>
          s.reaction && s.reaction.derivedMs !== null
            ? `${n(s.reaction.derivedMs)} ms`
            : s.reaction
              ? 'waiting…'
              : '—',
      },
      {
        label: 'from input',
        help: 'Latency measured from the raw input event (keypress / paddle grab / slider nudge). Blank if the mode gives no such event.',
        get: (s) =>
          s.reaction && s.reaction.inputMs !== null
            ? `${n(s.reaction.inputMs)} ms (${s.reaction.inputKind})`
            : s.reaction
              ? 'waiting…'
              : '—',
      },
    ],
  },
  {
    title: 'Accuracy',
    help: 'Contact = how cleanly the ball met the paddle (0 centre, ~1 edge, >1 miss); it measures control, not shot choice. Tracking = how closely the paddle followed the predicted path. Overshoot = sailed past the target and came back.',
    rows: [
      {
        label: 'tracking err (leg)',
        help: 'Mean distance between paddle centre and the predicted intercept, so far this leg.',
        get: (s) =>
          s.accuracy ? `${n(s.accuracy.meanTrackingErrorPx)} px` : '—',
      },
      {
        label: 'overshoot (leg)',
        help: 'Furthest the paddle has gone past the predicted intercept this leg.',
        get: (s) => (s.accuracy ? `${n(s.accuracy.overshootPx)} px` : '—'),
      },
      {
        label: 'last approach',
        help: 'The last completed leg where the ball came at you: contact offset (normalised) and reaction latency.',
        get: (s) => {
          const l = s.lastPlayerLeg;
          if (!l) return '—';
          const a = l.accuracy
            ? l.accuracy.madeContact
              ? `contact ${l.accuracy.contactOffsetNorm}`
              : `missed (${l.accuracy.contactOffsetNorm})`
            : 'contact —';
          const r =
            l.reaction && l.reaction.needed && l.reaction.derivedMs !== null
              ? ` · ${l.reaction.derivedMs} ms`
              : l.reaction && !l.reaction.needed
                ? ' · in position'
                : '';
          return a + r;
        },
      },
    ],
  },
  {
    title: 'Streaks',
    help: 'Rally outcomes from your point of view, and the longest runs.',
    rows: [
      {
        label: 'recent',
        help: 'Last rallies, newest on the right. W = you won the point.',
        get: (s) => s.streaks.outcomes.slice(-14).join('') || '—',
      },
      {
        label: 'current',
        help: 'Current win or loss run.',
        get: (s) =>
          s.streaks.currentWin > 0
            ? `${s.streaks.currentWin} W`
            : s.streaks.currentLoss > 0
              ? `${s.streaks.currentLoss} L`
              : '—',
      },
      {
        label: 'longest',
        help: 'Longest win run / longest loss run this game.',
        get: (s) => `${s.streaks.longestWin} W  /  ${s.streaks.longestLoss} L`,
      },
    ],
  },
  {
    title: 'Bot',
    help: 'Phase 3 adaptive bot: the selected tier, its current in-tier drift from the streak rule above, and the effective parameters that result.',
    rows: [
      {
        label: 'tier',
        help: 'Selected difficulty (the gear-icon dropdown, top right).',
        get: () => (latestBotInfo ? latestBotInfo.difficulty : '—'),
      },
      {
        label: 'drift',
        help: 'Current in-tier adjustment from the win/loss-streak rule. Positive = harder, negative = easier, capped at BOT_DRIFT_MAX_FRACTION.',
        get: () =>
          latestBotInfo
            ? `${latestBotInfo.driftFraction >= 0 ? '+' : ''}${n(latestBotInfo.driftFraction * 100, 1)} %`
            : '—',
      },
      {
        label: 'max speed',
        help: 'Effective paddle speed cap after drift.',
        get: () =>
          latestBotInfo ? `${n(latestBotInfo.effMaxSpeed)} px/s` : '—',
      },
      {
        label: 'reaction delay',
        help: "Effective time for the bot's aim to catch up to a new ball direction.",
        get: () =>
          latestBotInfo ? `${n(latestBotInfo.effReactionDelayMs)} ms` : '—',
      },
      {
        label: 'tracking error',
        help: 'Effective max +/- random aim offset, re-rolled each leg.',
        get: () =>
          latestBotInfo ? `${n(latestBotInfo.effTrackingErrorPx)} px` : '—',
      },
    ],
  },
  {
    title: 'LLM',
    help: 'Phase 4: batched requests to a local Ollama model for commentary + a bounded bot-play nudge. The nudge is folded into the effective values shown in the Bot section above, not tracked separately there.',
    rows: [
      {
        label: 'status',
        help: 'idle = no request yet. pending = request in flight. ok = last request succeeded. error = last request failed (network, timeout, or bad response shape) -- prior commentary/nudge stay in effect either way.',
        get: () => (latestLlmInfo ? latestLlmInfo.status : '—'),
      },
      {
        label: 'batch',
        help: `Rallies accumulated toward the next request -- fires every ${LLM_BATCH_RALLIES}.`,
        get: () =>
          latestLlmInfo
            ? `${latestLlmInfo.ralliesSinceLastCall} / ${LLM_BATCH_RALLIES}`
            : '—',
      },
      {
        label: 'last latency',
        help: 'Round-trip time of the most recent request.',
        get: () =>
          latestLlmInfo && latestLlmInfo.lastLatencyMs !== null
            ? `${latestLlmInfo.lastLatencyMs} ms`
            : '—',
      },
      {
        label: 'last error',
        help: 'Why the most recent request failed, if it did.',
        get: () => latestLlmInfo?.lastError ?? '—',
      },
      {
        label: 'nudge',
        help: "The LLM's requested bot-play adjustment, each axis -1..1 (speed / reaction / tracking) -- combined with streak drift in the Bot section above.",
        get: () =>
          latestLlmInfo
            ? `${n(latestLlmInfo.lastNudge.speed, 2)} / ${n(latestLlmInfo.lastNudge.reaction, 2)} / ${n(latestLlmInfo.lastNudge.tracking, 2)}`
            : '—',
      },
      {
        label: 'commentary',
        help: 'The latest commentary string shown in the player-facing panel under the game.',
        get: () => latestLlmInfo?.lastCommentary ?? '—',
      },
    ],
  },
  {
    title: 'Movement · this leg',
    help: 'The other four movement-pattern metrics (overshoot is in Accuracy above). Resets each leg.',
    rows: [
      {
        label: 'distance moved',
        help: 'Total paddle travel this leg — low = economical, high = busy.',
        get: (s) =>
          s.currentLegMovement ? `${n(s.currentLegMovement.travelPx)} px` : '—',
      },
      {
        label: 'direction changes',
        help: 'Times you reversed (past a jitter deadband) — few = decisive, many = scrambling.',
        get: (s) =>
          s.currentLegMovement
            ? String(s.currentLegMovement.directionChanges)
            : '—',
      },
      {
        label: 'idle',
        help: 'Share of the leg spent not moving the paddle.',
        get: (s) =>
          s.currentLegMovement
            ? `${n(s.currentLegMovement.idleFraction * 100)} %`
            : '—',
      },
      {
        label: 'peak speed',
        help: 'Fastest the paddle moved this leg.',
        get: (s) =>
          s.currentLegMovement
            ? `${n(s.currentLegMovement.peakSpeedPxS)} px/s`
            : '—',
      },
      {
        label: 'mean speed',
        help: 'Average paddle speed while actually moving.',
        get: (s) =>
          s.currentLegMovement
            ? `${n(s.currentLegMovement.meanMovingSpeedPxS)} px/s`
            : '—',
      },
    ],
  },
];

const STYLE = `
#pong-debug-panel{position:fixed;bottom:14px;left:14px;z-index:9999;width:252px;
  max-height:calc(100vh - 28px);overflow:auto;
  font:11px/1.5 "Courier New",Consolas,monospace;color:#1c2e40;
  background:rgba(255,255,255,0.95);border:1px solid #26415c;
  box-shadow:0 2px 12px rgba(0,0,0,0.14);padding-bottom:6px}
#pong-debug-panel .p-hdr{display:flex;justify-content:space-between;align-items:baseline;
  padding:5px 10px;border-bottom:1px solid rgba(38,65,92,0.22);
  background:rgba(38,65,92,0.05);font-weight:700;letter-spacing:0.03em}
#pong-debug-panel .p-hdr button{font:inherit;font-weight:700;border:1px solid #26415c;
  background:transparent;color:inherit;cursor:pointer;padding:0 5px;line-height:1.3;border-radius:3px}
#pong-debug-panel .p-sec{padding:0 10px;margin-top:7px;font-size:9px;letter-spacing:0.09em;
  text-transform:uppercase;opacity:0.55}
#pong-debug-panel .p-row{display:flex;justify-content:space-between;gap:10px;padding:0 10px}
#pong-debug-panel .p-row .l{opacity:0.6;white-space:nowrap}
#pong-debug-panel .p-row .v{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#pong-debug-panel .p-help{display:none;padding:1px 10px 4px;font-size:9px;line-height:1.35;
  opacity:0.5;font-style:italic}
#pong-debug-panel.show-help .p-help{display:block}
`;

export function initDebugPanel(getBotDebugInfo: () => BotDebugInfo): void {
  if (document.getElementById('pong-debug-panel')) return;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'pong-debug-panel';

  const header = document.createElement('div');
  header.className = 'p-hdr';
  const title = document.createElement('span');
  title.textContent = 'pong metrics';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '?';
  toggle.title = 'Show / hide what each row measures';
  toggle.addEventListener('click', () => panel.classList.toggle('show-help'));
  header.append(title, toggle);
  panel.appendChild(header);

  const valueCells: Array<{ cell: HTMLElement; get: RowSpec['get'] }> = [];

  for (const section of SECTIONS) {
    const st = document.createElement('div');
    st.className = 'p-sec';
    st.textContent = section.title;
    panel.appendChild(st);

    const sh = document.createElement('div');
    sh.className = 'p-help';
    sh.textContent = section.help;
    panel.appendChild(sh);

    for (const row of section.rows) {
      const r = document.createElement('div');
      r.className = 'p-row';
      r.title = row.help;
      const l = document.createElement('span');
      l.className = 'l';
      l.textContent = row.label;
      const v = document.createElement('span');
      v.className = 'v';
      r.append(l, v);
      panel.appendChild(r);

      const rh = document.createElement('div');
      rh.className = 'p-help';
      rh.textContent = row.help;
      panel.appendChild(rh);

      valueCells.push({ cell: v, get: row.get });
    }
  }

  document.body.appendChild(panel);

  function render(): void {
    const s = getSnapshot();
    latestBotInfo = getBotDebugInfo();
    latestLlmInfo = getLlmDebugInfo();
    for (const { cell, get } of valueCells) cell.textContent = get(s);
  }

  render();
  window.setInterval(render, REFRESH_MS);
}
