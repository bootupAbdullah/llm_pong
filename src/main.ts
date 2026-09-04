// Entry point. Bundled by esbuild and inlined into index.html at build time.
// This script tag sits at the end of <body>, so the DOM above it is parsed
// before any of this runs.

import { initSettings } from './settings';
import { initGame } from './game';

initSettings();
initGame();
