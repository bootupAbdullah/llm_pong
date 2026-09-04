// Phase 2 metrics — the #debug panel.
//
// Shown only when the URL contains "#debug". Normal players never see it. It's a
// developer view of the raw recorder state while building the metrics stages,
// and a rough first draft of whatever player-facing readout comes later.
//
// Stage 1: raw frame state + rally/leg segmentation, so the slicing can be
// eyeballed as it happens. Refreshes ~10x/sec, not every frame.

import { getSnapshot } from './recorder';
import { formatRule } from './predictor';

const REFRESH_MS = 100;

export function initDebugPanel(): void {
  const el = document.createElement('div');
  el.id = 'pong-debug-panel';
  el.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'left:16px',
    'z-index:9999',
    'font:11px/1.5 "Courier New",Consolas,monospace',
    'color:#1c2e40',
    'background:rgba(255,255,255,0.93)',
    'border:1px solid #26415c',
    'padding:8px 11px',
    'white-space:pre',
    'pointer-events:none',
    'letter-spacing:0.01em',
  ].join(';');
  document.body.appendChild(el);

  function fmt(n: number, d = 0): string {
    return n.toFixed(d);
  }

  function render(): void {
    const s = getSnapshot();
    const f = s.lastFrame;
    const lines: string[] = [
      '— pong metrics · stage 1 —',
      `frames    ${s.framesBuffered} / ${s.frameCapacity}`,
      `rally     #${s.rallyIndex}    leg #${s.legIndex}`,
      s.currentLeg
        ? `leg dir   → ${s.currentLeg.towardSide} (${
            s.currentLeg.towardPlayer ? 'player' : 'bot'
          })   walls ${s.currentLeg.wallBounces}`
        : 'leg dir   —',
      `rallies   ${s.ralliesThisGame} this game`,
      `score     L ${s.score.left} : ${s.score.right} R`,
      `games     ${s.gamesSaved} saved`,
    ];

    if (f) {
      lines.push(
        '',
        `ball      (${fmt(f.ballX)}, ${fmt(f.ballY)})`,
        `ball v    (${fmt(f.ballVx)}, ${fmt(f.ballVy)})`,
        `paddle Y  player ${fmt(f.playerY)}   bot ${fmt(f.botY)}`,
        `mode      ${f.controlMode}${
          f.controlMode === 'keyboard' ? ` · notch ${f.keySpeedNotch}` : ''
        }   side ${f.playerSide}`,
        `dt        ${fmt(f.dt * 1000, 1)} ms`,
      );
    }

    const p = s.prediction;
    lines.push('');
    if (p && p.interceptY !== null && p.timeToIntercept !== null) {
      lines.push(
        `predict   y ${fmt(p.interceptY)}  in ${fmt(
          p.timeToIntercept * 1000,
        )} ms  (${p.bounces} bounce${p.bounces === 1 ? '' : 's'})`,
        `f(x) v${p.version}  ${formatRule(p)}`,
      );
    } else {
      lines.push('predict   —');
    }

    el.textContent = lines.join('\n');
  }

  render();
  window.setInterval(render, REFRESH_MS);
}
