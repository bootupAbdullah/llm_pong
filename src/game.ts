// Core game: state, input handling, physics, rendering, loop.
//
// Stage 0 port of the Phase 1 inline script. Behaviour is intentionally
// identical — only types, module structure, and null-checks were added. The
// later metrics stages hook into `step()` / `updatePlayerPaddle()` from here.

import { byId } from './dom';
import { getKeySpeed, getKeySpeedNotch, setKeySpeedNotch } from './prefs';
import * as recorder from './metrics/recorder';
import { drawPrediction } from './metrics/overlay';
import type { Ball, ControlMode, Paddle, Score, Side } from './types';
import {
  BALL_BASE_SPEED,
  BALL_MAX_SPEED,
  BALL_R,
  BALL_SPEED_STEP,
  BOT_MAX_SPEED,
  KEY_SPEED_NOTCHES,
  PADDLE_H,
  PADDLE_MARGIN,
  PADDLE_W,
  WIN_SCORE,
} from './constants';

export function initGame(opts: { debug?: boolean } = {}): void {
  const debug = opts.debug ?? false;
  const canvas = byId<HTMLCanvasElement>('pongCanvas');
  const gameWindow = byId<HTMLDivElement>('gameWindow');
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('Canvas 2D context unavailable');
  const ctx: CanvasRenderingContext2D = ctx2d;
  const W = canvas.width;
  const H = canvas.height;

  const slider = byId<HTMLInputElement>('paddleSlider');
  const gameRow = byId<HTMLDivElement>('gameRow');
  const btnLeft = byId<HTMLButtonElement>('btnLeft');
  const btnRight = byId<HTMLButtonElement>('btnRight');
  const leftScoreName = byId<HTMLSpanElement>('leftScoreName');
  const leftScoreValue = byId<HTMLSpanElement>('leftScoreValue');
  const rightScoreName = byId<HTMLSpanElement>('rightScoreName');
  const rightScoreValue = byId<HTMLSpanElement>('rightScoreValue');
  const statusLine = byId<HTMLDivElement>('statusLine');
  const restartBtn = byId<HTMLButtonElement>('restartBtn');
  const gameOverOverlay = byId<HTMLDivElement>('gameOverOverlay');
  const pauseOverlay = byId<HTMLDivElement>('pauseOverlay');
  const pauseBtn = byId<HTMLButtonElement>('pauseBtn');
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('.mode-card');
  const keySensitivity = byId<HTMLDivElement>('keySensitivity');
  const keySensitivitySlider = byId<HTMLInputElement>('keySensitivitySlider');

  const PAUSE_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const PLAY_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4 L20 12 L7 20 Z"/></svg>';

  let playerSide: Side = 'left';
  let controlMode: ControlMode = 'slider'; // how the player's paddle is driven
  let isDragging = false;
  let paused = false;
  const keysHeld = { up: false, down: false };

  const left: Paddle = { y: H / 2 - PADDLE_H / 2, prevY: H / 2 - PADDLE_H / 2 };
  const right: Paddle = { y: H / 2 - PADDLE_H / 2, prevY: H / 2 - PADDLE_H / 2 };
  const score: Score = { left: 0, right: 0 };

  const ball: Ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BALL_R };

  let running = true;
  let lastTime: number | null = null;

  // fixed playfield geometry, for the metrics predictor — the x planes where the
  // ball centre sits when it contacts each paddle (mirror of checkPaddleCollision)
  recorder.configure({
    height: H,
    ballR: BALL_R,
    contactPlaneLeft: PADDLE_MARGIN + PADDLE_W + BALL_R,
    contactPlaneRight: W - PADDLE_MARGIN - PADDLE_W - BALL_R,
  });

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function serveBall(directionTowards: Side): void {
    const angle = Math.random() * 0.6 - 0.3; // +/- ~17 degrees
    const dir = directionTowards === 'left' ? -1 : 1;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = Math.cos(angle) * BALL_BASE_SPEED * dir;
    ball.vy = Math.sin(angle) * BALL_BASE_SPEED;
    recorder.onServe(directionTowards, playerSide, controlMode);
  }

  function resetGame(): void {
    score.left = 0;
    score.right = 0;
    left.y = right.y = H / 2 - PADDLE_H / 2;
    left.prevY = left.y;
    right.prevY = right.y;
    updateScoreLabels();
    statusLine.textContent = '';
    gameOverOverlay.classList.remove('visible');
    paused = false;
    pauseOverlay.classList.remove('visible');
    pauseBtn.innerHTML = PAUSE_ICON;
    pauseBtn.setAttribute('aria-label', 'Pause');
    running = true;
    recorder.onGameStart(playerSide);
    serveBall(Math.random() < 0.5 ? 'left' : 'right');
    lastTime = null;
    requestAnimationFrame(loop);
  }

  function setPaused(next: boolean): void {
    paused = next;
    pauseOverlay.classList.toggle('visible', paused);
    pauseBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    if (!paused) {
      // resume fresh rather than let a frozen lastTime produce a huge dt spike
      lastTime = null;
      requestAnimationFrame(loop);
    }
  }

  function togglePause(): void {
    if (!running) return; // no pausing once the game has been won
    setPaused(!paused);
  }

  function updateScoreLabels(): void {
    // names are fixed to physical side (left/right), not to who is "you"
    leftScoreName.textContent = playerSide === 'left' ? 'You' : 'Bot';
    rightScoreName.textContent = playerSide === 'right' ? 'You' : 'Bot';
    leftScoreValue.textContent = String(score.left);
    rightScoreValue.textContent = String(score.right);
  }

  function setSide(side: Side): void {
    playerSide = side;
    btnLeft.classList.toggle('active', side === 'left');
    btnRight.classList.toggle('active', side === 'right');
    // slider sits on the same physical side as the paddle it controls
    gameRow.style.flexDirection = side === 'left' ? 'row' : 'row-reverse';
    updateScoreLabels();
    recorder.onSideChange(side);
  }

  btnLeft.addEventListener('click', () => setSide('left'));
  btnRight.addEventListener('click', () => setSide('right'));
  restartBtn.addEventListener('click', resetGame);
  pauseBtn.addEventListener('click', togglePause);
  // bound to the game window, not the canvas: the pause/game-over overlays
  // sit on top of the canvas when visible, so a canvas-only listener would
  // never see a double-click land on the "Paused" overlay itself, and
  // double-clicking again could never resume the game.
  gameWindow.addEventListener('dblclick', (e) => {
    e.preventDefault();
    togglePause();
  });

  function setControlMode(mode: ControlMode): void {
    controlMode = mode;
    modeButtons.forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.mode === mode),
    );
    slider.disabled = mode !== 'slider';
    canvas.classList.toggle('drag-active', mode === 'drag');
    // the keyboard-sensitivity slider only applies to keyboard mode; it keeps
    // its reserved space in every mode (via CSS) so switching doesn't shift the
    // canvas, and just fades out when it's not relevant
    keySensitivity.classList.toggle('inactive', mode !== 'keyboard');
    // switching away drops any in-progress input for the old mode so it
    // can't keep moving the paddle once it's no longer the active source
    if (mode !== 'drag') isDragging = false;
    if (mode !== 'keyboard') {
      keysHeld.up = false;
      keysHeld.down = false;
    }
  }

  modeButtons.forEach((btn) =>
    btn.addEventListener('click', () =>
      setControlMode(btn.dataset.mode as ControlMode),
    ),
  );

  keySensitivitySlider.max = String(KEY_SPEED_NOTCHES.length - 1);
  keySensitivitySlider.value = String(getKeySpeedNotch());

  function syncKeySensitivitySlider(): void {
    keySensitivitySlider.value = String(getKeySpeedNotch());
  }

  keySensitivitySlider.addEventListener('input', () => {
    setKeySpeedNotch(Number(keySensitivitySlider.value));
  });

  // In keyboard mode the hands are already on the arrow keys, so let Left/Right
  // nudge the sensitivity notch without having to reach for the slider. Only
  // Left/Right — Up/Down/W/S drive the paddle. preventDefault also suppresses
  // the native range-input step when the slider happens to hold focus, so a
  // press can't double-count.
  window.addEventListener('keydown', (e) => {
    if (controlMode !== 'keyboard') return;
    if (e.code === 'ArrowLeft') {
      setKeySpeedNotch(getKeySpeedNotch() - 1);
      syncKeySensitivitySlider();
      e.preventDefault();
    } else if (e.code === 'ArrowRight') {
      setKeySpeedNotch(getKeySpeedNotch() + 1);
      syncKeySensitivitySlider();
      e.preventDefault();
    }
  });

  function canvasYToPaddleY(clientY: number): number {
    const rect = canvas.getBoundingClientRect();
    const scale = H / rect.height;
    const y = (clientY - rect.top) * scale;
    return clamp(y - PADDLE_H / 2, 0, H - PADDLE_H);
  }

  function dragTo(clientY: number): void {
    const paddle = playerSide === 'left' ? left : right;
    paddle.y = canvasYToPaddleY(clientY);
  }

  canvas.addEventListener('mousedown', (e) => {
    if (controlMode !== 'drag') return;
    isDragging = true;
    dragTo(e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (controlMode !== 'drag' || !isDragging) return;
    dragTo(e.clientY);
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (controlMode !== 'drag') return;
      isDragging = true;
      dragTo(e.touches[0].clientY);
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (controlMode !== 'drag' || !isDragging) return;
      dragTo(e.touches[0].clientY);
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('touchend', () => {
    isDragging = false;
  });

  window.addEventListener('keydown', (e) => {
    if (controlMode !== 'keyboard') return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      keysHeld.up = true;
      e.preventDefault();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      keysHeld.down = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keysHeld.up = false;
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') keysHeld.down = false;
  });

  // Spacebar toggles pause in every control mode. preventDefault stops the page
  // scrolling and also suppresses the synthesized click when a button (pause,
  // side, mode card) currently holds focus, so Space can't double-toggle.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  });

  function readSliderPaddleY(): number {
    // slider value 0..1000, top of slider = 1000 (paddle at top, y=0)
    const maxY = H - PADDLE_H;
    const frac = Number(slider.value) / 1000;
    return maxY - frac * maxY;
  }

  function updatePlayerPaddle(dt: number): void {
    const paddle = playerSide === 'left' ? left : right;
    paddle.prevY = paddle.y;
    // sampled every frame so velocity can later be derived as
    // (paddle.y - paddle.prevY) / dt. That holds regardless of control mode:
    // slider/drag set paddle.y directly (position), keyboard integrates a
    // velocity into it — either way this is the one spot per frame where the
    // active paddle's position for this frame is decided.
    if (controlMode === 'slider') {
      paddle.y = readSliderPaddleY();
    } else if (controlMode === 'keyboard') {
      const keySpeed = getKeySpeed();
      let dy = 0;
      if (keysHeld.up) dy -= keySpeed * dt;
      if (keysHeld.down) dy += keySpeed * dt;
      paddle.y = clamp(paddle.y + dy, 0, H - PADDLE_H);
    }
    // 'drag' mode: paddle.y is already set by the drag handlers above.
  }

  function updateBotPaddle(dt: number): void {
    const bot = playerSide === 'left' ? right : left;
    const target = ball.y - PADDLE_H / 2;
    const diff = target - bot.y;
    const maxStep = BOT_MAX_SPEED * dt;
    bot.prevY = bot.y;
    if (Math.abs(diff) <= maxStep) {
      bot.y = target;
    } else {
      bot.y += Math.sign(diff) * maxStep;
    }
    bot.y = clamp(bot.y, 0, H - PADDLE_H);
  }

  function step(dt: number): void {
    updatePlayerPaddle(dt);
    updateBotPaddle(dt);

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy *= -1;
      recorder.onWallBounce();
    } else if (ball.y + ball.r > H) {
      ball.y = H - ball.r;
      ball.vy *= -1;
      recorder.onWallBounce();
    }

    checkPaddleCollision(left, PADDLE_MARGIN, 1);
    checkPaddleCollision(right, W - PADDLE_MARGIN - PADDLE_W, -1);

    if (ball.x + ball.r < 0) {
      awardPoint('right');
    } else if (ball.x - ball.r > W) {
      awardPoint('left');
    }
  }

  function checkPaddleCollision(
    paddle: Paddle,
    paddleX: number,
    dirSign: 1 | -1,
  ): void {
    const withinX =
      dirSign === 1
        ? ball.x - ball.r <= paddleX + PADDLE_W && ball.x - ball.r >= paddleX
        : ball.x + ball.r >= paddleX && ball.x + ball.r <= paddleX + PADDLE_W;
    const movingTowards = dirSign === 1 ? ball.vx < 0 : ball.vx > 0;
    if (!withinX || !movingTowards) return;

    const withinY =
      ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + PADDLE_H;
    if (!withinY) return;

    const relative = (ball.y - (paddle.y + PADDLE_H / 2)) / (PADDLE_H / 2);
    const bounceAngle = relative * (Math.PI / 3); // max 60 degrees
    const speed = clamp(
      Math.hypot(ball.vx, ball.vy) + BALL_SPEED_STEP,
      BALL_BASE_SPEED,
      BALL_MAX_SPEED,
    );

    ball.vx = Math.cos(bounceAngle) * speed * dirSign;
    ball.vy = Math.sin(bounceAngle) * speed;
    ball.x = dirSign === 1 ? paddleX + PADDLE_W + ball.r : paddleX - ball.r;
    recorder.onPaddleHit(dirSign === 1 ? 'left' : 'right', playerSide, controlMode);
  }

  function awardPoint(side: Side): void {
    score[side] += 1;
    updateScoreLabels();
    recorder.onPoint(side, playerSide);
    if (score[side] >= WIN_SCORE) {
      endGame(side);
    } else {
      serveBall(side === 'left' ? 'right' : 'left');
    }
  }

  function endGame(winningSide: Side): void {
    running = false;
    recorder.onGameEnd(winningSide, playerSide, {
      left: score.left,
      right: score.right,
    });
    const youWon = winningSide === playerSide;
    statusLine.textContent = youWon ? 'You win!' : 'Bot wins!';
    gameOverOverlay.classList.add('visible');
  }

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.fillRect(PADDLE_MARGIN, left.y, PADDLE_W, PADDLE_H);
    ctx.fillRect(W - PADDLE_MARGIN - PADDLE_W, right.y, PADDLE_W, PADDLE_H);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    if (debug) drawPrediction(ctx, recorder.getCurrentPrediction());
  }

  function loop(timestamp: number): void {
    if (!running || paused) return;
    if (lastTime === null) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;

    recorder.beginFrame(timestamp, dt);
    step(dt);
    recorder.commitFrame({
      ball,
      player: playerSide === 'left' ? left : right,
      bot: playerSide === 'left' ? right : left,
      playerSide,
      controlMode,
      score: { left: score.left, right: score.right },
    });
    draw();

    requestAnimationFrame(loop);
  }

  setSide('left');
  setControlMode('slider');
  recorder.onGameStart(playerSide);
  serveBall(Math.random() < 0.5 ? 'left' : 'right');
  requestAnimationFrame(loop);
}
