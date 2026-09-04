// Entry point. Bundled by esbuild and inlined into index.html at build time.
// This script tag sits at the end of <body>, so the DOM above it is parsed
// before any of this runs.

import { initSettings } from './settings';
import { initGame } from './game';
import * as metrics from './metrics/recorder';
import { initDebugPanel } from './metrics/debug-panel';

initSettings();
initGame();

// Metrics recording is always on (later phases consume it live). The #debug
// panel that surfaces it is opt-in via the URL fragment.
if (window.location.hash.toLowerCase().includes('debug')) {
  initDebugPanel();
}

// Dev-only console access to the raw recording — no player-facing export.
(globalThis as Record<string, unknown>).__pongMetrics = metrics;
