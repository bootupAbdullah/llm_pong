// Accuracy metrics — contact accuracy, tracking accuracy, and overshoot
// (the fifth movement-pattern metric, kept here because it shares the
// "compare paddle to predicted intercept" machinery).
//
// Both accuracy flavours are recorded, separately labelled, and neither is
// load-bearing:
//   contact  — the outcome: how far off-centre the ball hit the paddle
//              (0 = dead centre, ~1 = edge, >1 = missed). Measures control, not
//              shot selection — hitting dead centre is not always the smart play.
//   tracking — the process: mean distance between paddle centre and the
//              predicted intercept over the whole approach.
//
// Per-frame accumulation lives in recorder.ts (it needs the live prediction);
// this module holds the pure pieces.

export const ACCURACY_TUNING = {
  /** overshoot below this many px past the intercept is treated as noise. */
  overshootNoisePx: 4,
};

export interface AccAccum {
  frames: number;
  sumTrackErr: number; // Σ |paddle centre − intercept|, px
  firstGapSign: -1 | 0 | 1; // sign(intercept − paddle centre) at the first frame
  maxOvershootPx: number; // furthest past the intercept, on the far side
}

export function newAccAccum(): AccAccum {
  return { frames: 0, sumTrackErr: 0, firstGapSign: 0, maxOvershootPx: 0 };
}

/** gap = interceptY − paddleCentreY (px). */
export function feedAcc(a: AccAccum, gap: number): void {
  a.frames += 1;
  a.sumTrackErr += Math.abs(gap);

  if (a.firstGapSign === 0 && Math.abs(gap) > 1) {
    a.firstGapSign = gap > 0 ? 1 : -1;
  }
  if (a.firstGapSign !== 0) {
    const past = -a.firstGapSign * gap; // > 0 once the paddle is on the far side
    if (past > a.maxOvershootPx) a.maxOvershootPx = past;
  }
}

export interface LegAccuracySummary {
  madeContact: boolean;
  contactOffsetPx: number;
  /** 0 = dead centre, ~1 = paddle edge, >1 = missed. */
  contactOffsetNorm: number;
  meanTrackingErrorPx: number;
  overshot: boolean;
  overshootPx: number;
}

export function finalizeAcc(
  a: AccAccum,
  madeContact: boolean,
  contactOffsetPx: number,
  halfPaddleH: number,
): LegAccuracySummary {
  return {
    madeContact,
    contactOffsetPx: Math.round(contactOffsetPx),
    contactOffsetNorm:
      halfPaddleH > 0 ? round2(contactOffsetPx / halfPaddleH) : 0,
    meanTrackingErrorPx: a.frames ? Math.round(a.sumTrackErr / a.frames) : 0,
    overshot: a.maxOvershootPx > ACCURACY_TUNING.overshootNoisePx,
    overshootPx: Math.round(Math.max(0, a.maxOvershootPx)),
  };
}

export interface GameAccuracySummary {
  contacts: number;
  misses: number;
  meanContactOffsetNorm: number | null;
  bestContactOffsetNorm: number | null;
  meanTrackingErrorPx: number | null;
  overshootLegs: number;
}

export function summarizeAccuracy(
  all: Array<LegAccuracySummary | null>,
): GameAccuracySummary {
  const legs = all.filter((x): x is LegAccuracySummary => x !== null);
  const contacts = legs.filter((x) => x.madeContact);
  const offs = contacts.map((x) => x.contactOffsetNorm);
  const track = legs.map((x) => x.meanTrackingErrorPx).filter((v) => v > 0);

  return {
    contacts: contacts.length,
    misses: legs.length - contacts.length,
    meanContactOffsetNorm: offs.length
      ? round2(offs.reduce((s, v) => s + v, 0) / offs.length)
      : null,
    bestContactOffsetNorm: offs.length ? round2(Math.min(...offs)) : null,
    meanTrackingErrorPx: track.length
      ? Math.round(track.reduce((s, v) => s + v, 0) / track.length)
      : null,
    overshootLegs: legs.filter((x) => x.overshot).length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
