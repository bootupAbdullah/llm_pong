// Phase 4.5 Stage 2 -- cosmetic inference-progress bar + status light. Pure
// visualization: a stub counter increments once per rally, from the same
// call site (awardPoint() in game.ts) Phase 4's real llm.onRallyComplete()
// uses on phase-4-llm-layer. The actual batch-threshold logic and API call
// stay out of scope here -- see phase-4.5-handoff.md. Module-singleton, same
// shape as difficulty.ts/prefs.ts. Swapping this stub for real llm.ts state
// later (once Phase 4 merges) is a data-source change, not a UI rewrite.

import { byId } from './dom';
import { STUB_BATCH_RALLIES, STUB_INFERENCE_DELAY_MS } from './constants';

type StubStatus = 'idle' | 'pending';

const state = {
  ralliesSinceThreshold: 0,
  status: 'idle' as StubStatus,
};

let fillEl: HTMLDivElement | null = null;
let lightEl: HTMLDivElement | null = null;
let statusEl: HTMLSpanElement | null = null;

function render(): void {
  if (!fillEl || !lightEl || !statusEl) return;
  const frac = Math.min(state.ralliesSinceThreshold / STUB_BATCH_RALLIES, 1);
  const ready = state.status === 'pending';
  fillEl.style.height = `${frac * 100}%`;
  fillEl.classList.toggle('ready', ready);
  lightEl.classList.toggle('ready', ready);
  statusEl.classList.toggle('ready', ready);
  statusEl.textContent = ready ? 'Ready' : 'Gathering…';
}

export function initInferenceBar(): void {
  fillEl = byId<HTMLDivElement>('inferenceBarFill');
  lightEl = byId<HTMLDivElement>('inferenceBarLight');
  statusEl = byId<HTMLSpanElement>('inferenceBarStatus');
  render();
}

/** Call once per completed rally (awardPoint() in game.ts). */
export function onRallyComplete(): void {
  if (state.status === 'pending') return;
  state.ralliesSinceThreshold += 1;
  if (state.ralliesSinceThreshold >= STUB_BATCH_RALLIES) {
    state.status = 'pending';
    render();
    setTimeout(() => {
      state.status = 'idle';
      state.ralliesSinceThreshold = 0;
      render();
    }, STUB_INFERENCE_DELAY_MS);
    return;
  }
  render();
}
