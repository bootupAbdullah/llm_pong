// Entry point. Bundled by esbuild and inlined into index.html at build time.
// This script tag sits at the end of <body>, so the DOM above it is parsed
// before any of this runs.

import { initSettings } from './settings';
import { initGame } from './game';
import * as metrics from './metrics/recorder';
import { initDebugPanel } from './metrics/debug-panel';

const debug = window.location.hash.toLowerCase().includes('debug');

initSettings();
initGame({ debug });

// Metrics recording is always on (later phases consume it live). The #debug
// panel and the canvas prediction overlay are opt-in via the URL fragment.
if (debug) {
  initDebugPanel();
}

// Dev-only console access to the raw recording — no player-facing export.
(globalThis as Record<string, unknown>).__pongMetrics = metrics;
