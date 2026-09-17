// Difficulty dropdown: a small fixed-position trigger + panel stacked below
// the settings (theme) menu, same self-contained shape as settings.ts.
// Stage 0 (Phase 3): writes the persisted preference via difficulty.ts only
// — the bot doesn't read it yet, that's a later stage.

import { byId } from './dom';
import { getDifficulty, setDifficulty } from './difficulty';
import type { Difficulty } from './types';

export function initDifficultyMenu(): void {
  const trigger = byId<HTMLButtonElement>('difficultyTrigger');
  const panel = byId<HTMLDivElement>('difficultyPanel');
  const options = document.querySelectorAll<HTMLButtonElement>('.difficulty-option');

  function syncActive(): void {
    const current = getDifficulty();
    options.forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.difficulty === current),
    );
  }

  trigger.addEventListener('click', () => {
    // the two panels share one drop-zone below the stacked trigger pair —
    // only one should be visible at a time
    document.getElementById('settingsPanel')?.classList.remove('open');
    panel.classList.toggle('open');
  });

  options.forEach((btn) => {
    btn.addEventListener('click', () => {
      setDifficulty(btn.dataset.difficulty as Difficulty);
      syncActive();
      panel.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Node | null;
    if (target && !panel.contains(target) && !trigger.contains(target)) {
      panel.classList.remove('open');
    }
  });

  syncActive();
}
