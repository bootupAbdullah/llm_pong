// Build: bundle src/main.ts to a single IIFE and inline it into the committed
// index.html, using src/index.html as the template.
//
// The template must contain exactly one occurrence of the marker
//   /* BUILD:INLINE_JS */
// inside a <script> tag. That marker is replaced with the bundled JS.
//
//   node build.mjs           one-off build
//   node build.mjs --watch    rebuild on any change under src/

import * as esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';

const TEMPLATE = 'src/index.html';
const OUTPUT = 'index.html';
const MARKER = '/* BUILD:INLINE_JS */';
const isWatch = process.argv.includes('--watch');

async function buildOnce() {
  const result = await esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
  });

  const js = result.outputFiles[0].text.trimEnd();
  const template = await readFile(TEMPLATE, 'utf8');

  const markerCount = template.split(MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(
      `${TEMPLATE} must contain the marker "${MARKER}" exactly once (found ${markerCount}).`,
    );
  }

  const html = template.replace(MARKER, () => js);
  await writeFile(OUTPUT, html);

  const now = new Date().toLocaleTimeString();
  console.log(`[${now}] built ${OUTPUT} (${js.length} bytes of JS inlined)`);
}

await buildOnce();

if (isWatch) {
  console.log('watching src/ for changes — Ctrl+C to stop');
  let pending = false;
  fsWatch('src', { recursive: true }, () => {
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      pending = false;
      try {
        await buildOnce();
      } catch (err) {
        console.error('build failed:', err.message);
      }
    }, 50);
  });
}
