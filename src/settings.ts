// Settings menu: theme + text size. Self-contained — shares no state with the
// game loop. Ported verbatim from the Phase 1 inline script.

import { byId } from './dom';

type Theme = 'blue' | 'yellow' | 'green' | 'violet';
type TextSize = 'normal' | 'large' | 'xlarge';

export function initSettings(): void {
  const settingsTrigger = byId<HTMLButtonElement>('settingsTrigger');
  const settingsPanel = byId<HTMLDivElement>('settingsPanel');
  const themeOptions =
    document.querySelectorAll<HTMLButtonElement>('.theme-option');
  const textSizeOptions =
    document.querySelectorAll<HTMLButtonElement>('.text-size-option');

  function applyTheme(theme: string): void {
    if (theme === 'blue') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    themeOptions.forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.theme === theme),
    );
    try {
      localStorage.setItem('pongTheme', theme);
    } catch (e) {
      // localStorage unavailable (private mode, locked-down settings, etc.) --
      // the theme still applies for this session, it just won't persist.
    }
  }

  function applyTextSize(size: string): void {
    if (size === 'normal') {
      document.documentElement.removeAttribute('data-text-size');
    } else {
      document.documentElement.setAttribute('data-text-size', size);
    }
    textSizeOptions.forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.size === size),
    );
    try {
      localStorage.setItem('pongTextSize', size);
    } catch (e) {
      // localStorage unavailable -- applies for this session only.
    }
  }

  settingsTrigger.addEventListener('click', () => {
    // shares its drop-zone with the difficulty panel below it — see
    // difficulty-menu.ts
    document.getElementById('difficultyPanel')?.classList.remove('open');
    settingsPanel.classList.toggle('open');
  });

  themeOptions.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme as Theme);
      settingsPanel.classList.remove('open');
    });
  });

  textSizeOptions.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTextSize(btn.dataset.size as TextSize);
      settingsPanel.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Node | null;
    if (
      target &&
      !settingsPanel.contains(target) &&
      !settingsTrigger.contains(target)
    ) {
      settingsPanel.classList.remove('open');
    }
  });

  let savedTheme: string | null = null;
  let savedTextSize: string | null = null;
  try {
    savedTheme = localStorage.getItem('pongTheme');
    savedTextSize = localStorage.getItem('pongTextSize');
  } catch (e) {
    // ignore -- fall back to the defaults
  }
  if (savedTheme) applyTheme(savedTheme);
  if (savedTextSize) applyTextSize(savedTextSize);
}
