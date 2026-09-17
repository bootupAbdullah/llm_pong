// Entry point. Bundled by esbuild and inlined into index.html at build time.
// This script tag sits at the end of <body>, so the DOM above it is parsed
// before any of this runs.

import { initSettings } from './settings';
import { initDifficultyMenu } from './difficulty-menu';
import { initGame } from './game';
import * as metrics from './metrics/recorder';
import { initDebugPanel } from './metrics/debug-panel';

const debug = window.location.hash.toLowerCase().includes('debug');

initSettings();
initDifficultyMenu();
initGame({ debug });

// Metrics recording is always on (later phases consume it live). The #debug
// panel and the canvas prediction overlay are opt-in via the URL fragment.
if (debug) {
  initDebugPanel();
}

// Dev-only console access to the raw recording — no player-facing export.
//   __pongMetrics.dump()          full state (current + saved games + frames)
//   __pongMetrics.getSavedGames() the persisted player records
//   __pongMetrics.downloadJSON()  save dump() to a file (for offline analysis)
(globalThis as Record<string, unknown>).__pongMetrics = {
  getFrames: metrics.getFrames,
  getSnapshot: metrics.getSnapshot,
  getCurrentGame: metrics.getCurrentGame,
  getSavedGames: metrics.getSavedGames,
  dump: metrics.dump,
  downloadJSON(): void {
    const blob = new Blob([JSON.stringify(metrics.dump(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pong-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
