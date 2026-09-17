// Miss / win streaks — player perspective, per rally. Pure and already
// summary-shaped: the running state is what gets saved.

export interface StreakSummary {
  /** Per-rally outcomes in order, player perspective. */
  outcomes: Array<'W' | 'L'>;
  currentWin: number;
  currentLoss: number;
  longestWin: number;
  longestLoss: number;
}

export function newStreakSummary(): StreakSummary {
  return {
    outcomes: [],
    currentWin: 0,
    currentLoss: 0,
    longestWin: 0,
    longestLoss: 0,
  };
}

export function pushOutcome(s: StreakSummary, wonByPlayer: boolean): void {
  s.outcomes.push(wonByPlayer ? 'W' : 'L');
  if (wonByPlayer) {
    s.currentWin += 1;
    s.currentLoss = 0;
    if (s.currentWin > s.longestWin) s.longestWin = s.currentWin;
  } else {
    s.currentLoss += 1;
    s.currentWin = 0;
    if (s.currentLoss > s.longestLoss) s.longestLoss = s.currentLoss;
  }
}

export function cloneStreaks(s: StreakSummary): StreakSummary {
  return { ...s, outcomes: [...s.outcomes] };
}
