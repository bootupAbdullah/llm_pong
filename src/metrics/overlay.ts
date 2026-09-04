// Debug canvas overlay for the ball-path predictor. Drawn on top of the game's
// own render, only in #debug mode, so the prediction can be checked by eye — the
// ball should ride the dashed line and pass through the ring.

import type { Prediction } from './predictor';

const LINE = 'rgba(122, 224, 165, 0.75)';
const MARK = 'rgba(122, 224, 165, 0.95)';

export function drawPrediction(
  ctx: CanvasRenderingContext2D,
  prediction: Prediction | null,
): void {
  if (!prediction || prediction.path.length < 2) return;

  ctx.save();

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  const start = prediction.path[0];
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < prediction.path.length; i += 1) {
    ctx.lineTo(prediction.path[i].x, prediction.path[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = MARK;
  for (const p of prediction.path) {
    if (p.kind === 'wall') ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }

  if (prediction.interceptY !== null) {
    const end = prediction.path[prediction.path.length - 1];
    ctx.strokeStyle = MARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
