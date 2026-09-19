// Phase 4 Stage 2 — player-facing commentary panel under the game window.
// Blank/hidden (reserves its height, same "empty" pattern as key-sensitivity
// in index.html) until the first LLM batch lands, then shows the latest
// commentary string. Not a debug tool — this one is meant to ship.

import { byId } from './dom';
import { subscribeCommentary } from './llm';

export function initCommentaryPanel(): void {
  const panel = byId<HTMLDivElement>('commentaryPanel');
  const text = byId<HTMLSpanElement>('commentaryText');

  subscribeCommentary((commentary) => {
    text.textContent = commentary;
    panel.classList.remove('empty');
  });
}
