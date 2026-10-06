// llmpong.com placeholder — ship-safe background (placeholder-build-brief.md §3, §7).
// Three scenes, picked by screen shape: desktop (board 13, 1280x820), phone upright (board 15 layout A,
// 390x844, vertical court) and phone sideways (board 15 layout B, 844x390). The surroundings of each scene
// follow its board; the rally inside every court follows board 10 (the standard game), drawn in the boards'
// rough style: BALL spins and takes the last hitter's colour, TAIL fades, paddles flare then hold their glow,
// SPARKS scale with the hit, a point plays DEREZ + GOAL-MOUTH + BORDER-SWEEP + SCORE-FLARE, BAR is 5 segments
// held full (6/6), DOTS loop in 3.2s.
//
// 1) Everything is drawn into a tiny offscreen canvas (1/8 of the scene).
// 2) That tiny image is shrunk a further 3x and stretched back (a cheap blur that works in every browser).
// 3) The visible <canvas> is itself tiny; CSS only scales it up. No sharp pixels ever exist.
// The scene is deliberately rough: blocks, bars and dots only. No text, icons, badge figure or panel detail,
// so even someone who edits this code to draw at full size gets a sketch, not the design.
// Small effects (sparks, fragments) are drawn larger than in the game so they survive 1/8 resolution,
// the same choice boards 13 and 15 made for their sparks.
(() => {
  const RES_DIV = 8;      // resolution 1/8
  const SOFTNESS = 3;     // "softer": blur pass shrinks by 3
  const DOT_TRAVEL_S = 3.2;   // seconds for one trail dot to run the full TRAIL (boards: 1.6, slowed per user)

  // Scene choice (§7). The background and the card choose separately: any upright screen (taller than wide,
  // any width — phones and upright tablets) gets the upright scene, while styles.css keeps the phone-size
  // card for upright screens under 600px only. QUERY_SIDEWAYS matches the sideways card query in styles.css.
  const QUERY_UPRIGHT = '(orientation: portrait)';
  const QUERY_SIDEWAYS = '(max-height: 499px) and (orientation: landscape)';

  // board 10 defaults (lengths in desktop court px; scaled to each court by k = court length / 600)
  const CYAN = '0,229,255', ORANGE = '255,138,31', WHITE = '255,255,255';
  const BAR_GREEN = 'rgba(40,201,94,0.9)', BAR_GLOW = '46,224,108', DOT_GREEN = '57,240,128';
  const BOT_SCORE_LEVEL = 2;          // player points always play at level 3
  const LEVELS = { 1: { mouth: 70, a: 0.5, pulse: 1.08 }, 2: { mouth: 120, a: 0.75, pulse: 1.15 }, 3: { mouth: 180, a: 1, pulse: 1.25 } };
  const EXIT_DISTANCE = 250;          // DEREZ fragments fly up to ~250px past the line
  const HIT_GLOW_S = 0.25, HOLD_LEVEL = 0.5, RELEASE_S = 0.18;
  const SPARK_RANGE = [10, 20], SPARK_LIFE = 0.5;
  const BAR_SEGS = 5, BAR_GAP = 6;

  // court: [x, y, w, h] of the playfield in scene coordinates; glow: [cx, cy, r0, r1] of the centre haze;
  // blobs: the two score blobs [cx, cy, w, h]
  const SCENES = {
    desktop: { W: 1280, H: 820, grid: 40, court: [340, 140, 600, 380], vertical: false, ball: 14, dotR: 6,
      glow: [640, 370, 40, 640], blobs: { p: [593, 75, 46, 34], b: [687, 75, 46, 34] }, chrome: drawDesktop },
    upright: { W: 390, H: 844, grid: 24, court: [16, 232, 336, 404], vertical: true, ball: 12, dotR: 5,
      glow: [184, 434, 20, 506], blobs: { p: [95, 127, 34, 30], b: [295, 127, 34, 30] }, chrome: drawUpright },
    sideways: { W: 844, H: 390, grid: 24, court: [200, 54, 444, 282], vertical: false, ball: 12, dotR: 5,
      glow: [422, 195, 20, 506], blobs: { p: [284, 28, 28, 24], b: [560, 28, 28, 24] }, chrome: drawSideways }
  };

  const cv = document.getElementById('bg');
  if (!cv || !cv.getContext) return;

  const a = document.createElement('canvas');   // sharp-ish tiny scene
  const b = document.createElement('canvas');   // even tinier, for the blur pass
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const reduced = mq('(prefers-reduced-motion: reduce)');

  let sceneKey = null, S = null, G = null, s = null;
  let area = { w: 0, h: 0, ox: 0, oy: 0 };

  function pickScene() {
    return mq(QUERY_UPRIGHT) ? 'upright' : mq(QUERY_SIDEWAYS) ? 'sideways' : 'desktop';
  }

  // Court geometry. The rally runs in court units: u = along the play direction, 0 at the player's end,
  // len at the bot's end; v = across the court, 0..wid. map() turns that into scene coordinates
  // (horizontal court: player on the left; vertical court: player at the bottom).
  function setScene(key) {
    sceneKey = key; S = SCENES[key];
    const [cx, cy, cw, ch] = S.court;
    const len = S.vertical ? ch : cw, wid = S.vertical ? cw : ch, k = len / 600;
    G = { cx, cy, cw, ch, len, wid, k, m: 8 * k, pl: 0.2 * wid };
    s = newSim();
    if (reduced) s.serve = 0;
  }
  const map = (u, v) => (S.vertical ? [G.cx + v, G.cy + G.len - u] : [G.cx + u, G.cy + v]);

  function newSim() {
    return { u: G.len / 2, v: G.wid / 2, du: 300 * G.k, dv: 120 * G.k, ang: 0, dir: 1, omega: 300,
      pp: G.wid / 2, bp: G.wid / 2, pvP: 0, pvB: 0, swingP: 0, swingB: 0,
      hp: 9, hb: 9, holder: null, relP: 9, relB: 9,
      serve: 0.8, miss: null, hits: 0, t: 0,
      sparks: [], frags: [], mouths: [], borders: [], flares: {} };
  }

  // The drawing area takes the window's shape. The whole scene always fits inside it, centred, at the
  // largest size that fits; extra space (left/right on wide windows, above/below on tall ones) is filled
  // with more background grid. Nothing is cropped or stretched. Units: scene px.
  function measure() {
    const vw = window.innerWidth || S.W, vh = window.innerHeight || S.H;
    const scale = Math.min(vw / S.W, vh / S.H);
    const w = vw / scale, h = vh / scale;
    area = { w, h, ox: (w - S.W) / 2, oy: (h - S.H) / 2 };
  }

  // ---- rally (board 10 behaviour, in court units) ------------------------------------------------

  const baseSpin = () => Math.max(120, Math.min(720, 300 * Math.hypot(s.du, s.dv) / (320 * G.k)));
  const pickSwing = () => (Math.random() < 0.35 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 60)) * G.k;

  function serveBall() {
    s.u = G.len / 2; s.v = G.wid / 2;
    s.du = (Math.random() < 0.5 ? 300 : -300) * G.k; s.dv = (Math.random() * 2 - 1) * 160 * G.k;
    s.omega = baseSpin(); s.swingP = pickSwing(); s.swingB = pickSwing();
    s.holder = null; s.miss = null; s.hits = 0;
  }

  // SPARKS: tumbling cubes off the paddle face; count and speed scale with paddle speed and ball speed
  function spawnSparks(side) {
    const k = G.k, pv = side === 'p' ? s.pvP : s.pvB;
    const speed = Math.hypot(s.du, s.dv) / k;
    const str = Math.max(0, Math.min(1, 0.6 * Math.min(1, Math.abs(pv) / (400 * k)) + 0.4 * Math.max(0, (speed - 300) / 220)));
    const n = Math.round(SPARK_RANGE[0] + (SPARK_RANGE[1] - SPARK_RANGE[0]) * str);
    const fu = side === 'p' ? 26 * k : G.len - 26 * k, base = side === 'p' ? 0 : Math.PI;
    for (let i = 0; i < n; i++) {
      const an = base + (Math.random() * 2 - 1) * (65 * Math.PI / 180);
      const sp = (120 + Math.random() * 200) * (0.7 + 0.6 * str) * k;
      s.sparks.push({ u: fu, v: s.v + (Math.random() * 2 - 1) * 5 * k, du: Math.cos(an) * sp, dv: Math.sin(an) * sp + pv * 0.25,
        hot: Math.random() < 0.25, rgb: side === 'p' ? CYAN : ORANGE, age: 0, life: SPARK_LIFE * (0.75 + Math.random() * 0.25) });
    }
  }

  function hit(side) {
    spawnSparks(side);
    if (side === 'p') { s.hp = 0; if (s.holder === 'b') s.relB = 0; s.holder = 'p'; }
    else { s.hb = 0; if (s.holder === 'p') s.relP = 0; s.holder = 'b'; }
    s.du = -Math.sign(s.du) * Math.min(520 * G.k, Math.abs(s.du) * 1.05); s.dv = (Math.random() * 2 - 1) * 230 * G.k;
    // spin follows the hit: paddle speed kicks the rate, paddle direction sets the direction
    const pv = (side === 'p' ? s.pvP : s.pvB) / G.k;
    if (Math.abs(pv) > 20) s.dir = (side === 'p' ? -1 : 1) * Math.sign(pv); else s.dir = -s.dir;
    s.omega = Math.min(1080, baseSpin() + Math.min(760, Math.abs(pv) * 1.5));
    if (side === 'p') s.swingB = pickSwing(); else s.swingP = pickSwing();
    s.hits += 1;
    s.miss = (s.hits >= 3 && Math.random() < 0.3) ? (side === 'p' ? 'b' : 'p') : null;
  }

  // POINT: DEREZ (ball carries on through the goal as fragments), GOAL-MOUTH, BORDER-SWEEP, SCORE-FLARE
  function scorePoint(scorer) {
    const k = G.k, L = scorer === 'p' ? 3 : BOT_SCORE_LEVEL, I = LEVELS[L];
    const rgb = scorer === 'p' ? CYAN : ORANGE;
    const edgeU = scorer === 'p' ? G.len - 1 : 1;
    const cv0 = Math.max(G.m, Math.min(G.wid - G.m, s.v));
    const sp = (Math.hypot(s.du, s.dv) / k) || 300, dirA = Math.atan2(s.dv, s.du);
    const dist = EXIT_DISTANCE * k * (0.6 + 0.4 * Math.max(0, Math.min(1, (sp - 300) / 220)));
    for (let i = 0; i < 40; i++) {
      const an = dirA + (Math.random() * 2 - 1) * 22 * Math.PI / 180;
      const v = dist * 3 / (1 - Math.exp(-3 * 0.8)) * (0.7 + Math.random() * 0.3);
      s.frags.push({ u: edgeU + Math.cos(dirA) * 4 * k, v: cv0 + (Math.random() * 2 - 1) * 5 * k, du: Math.cos(an) * v, dv: Math.sin(an) * v,
        size: 2 + Math.random() * 3, hot: Math.random() < 0.35, rgb, age: 0, life: 0.6 + Math.random() * 0.2 });
    }
    s.mouths.push({ u: edgeU, v: cv0, rgb, len: I.mouth * k, a: I.a, t: 0 });
    const [x, y] = map(edgeU, cv0);
    s.borders.push({ origin: perimParam(x, y), rgb, L, t: 0 });
    s.flares[scorer] = { pulse: I.pulse, a: I.a, t: 0 };
  }

  function step(dt) {
    const k = G.k, len = G.len, wid = G.wid, m = G.m;
    s.t += dt;
    for (const p of s.sparks) { const dr = Math.exp(-dt * 4); p.du *= dr; p.dv *= dr; p.u += p.du * dt; p.v += p.dv * dt; p.age += dt; }
    for (const f of s.frags) { const dr = Math.exp(-dt * 3); f.du *= dr; f.dv *= dr; f.u += f.du * dt; f.v += f.dv * dt; f.age += dt; }
    for (const mo of s.mouths) mo.t += dt;
    for (const o of s.borders) o.t += dt;
    for (const key in s.flares) { s.flares[key].t += dt; if (s.flares[key].t > 0.7) delete s.flares[key]; }
    s.sparks = s.sparks.filter((p) => p.age < p.life);
    s.frags = s.frags.filter((f) => f.age < f.life);
    s.mouths = s.mouths.filter((mo) => mo.t < 0.7);
    s.borders = s.borders.filter((o) => o.t < 0.85);
    s.hp += dt; s.hb += dt; s.relP += dt; s.relB += dt;
    if (s.serve > 0) {
      s.serve -= dt; s.pp += (wid / 2 - s.pp) * Math.min(1, dt * 4); s.bp += (wid / 2 - s.bp) * Math.min(1, dt * 4);
      if (s.serve <= 0) serveBall();
      return;
    }
    s.u += s.du * dt; s.v += s.dv * dt;
    if (s.v < m) { s.v = m; s.dv = Math.abs(s.dv); }
    if (s.v > wid - m) { s.v = wid - m; s.dv = -Math.abs(s.dv); }
    if (s.du < 0 && s.u < 30 * k && s.u > 18 * k && s.miss !== 'p') { s.u = 30 * k; hit('p'); }
    if (s.du > 0 && s.u > len - 30 * k && s.u < len - 18 * k && s.miss !== 'b') { s.u = len - 30 * k; hit('b'); }
    if (s.u < -10 * k || s.u > len + 10 * k) {
      scorePoint(s.u < 0 ? 'b' : 'p');
      if (s.holder === 'p') s.relP = 0;
      if (s.holder === 'b') s.relB = 0;
      s.holder = null; s.hp = 9; s.hb = 9; s.serve = 1.0;
      return;
    }
    s.omega += (baseSpin() - s.omega) * (1 - Math.exp(-dt / 0.6));
    s.omega = Math.max(120, Math.min(1080, s.omega));
    s.ang += s.dir * s.omega * dt;
    // paddles track the ball and, near contact, swing through it by a random amount
    const near = (pu, sw) => { const d = Math.abs(s.u - pu); return d < 90 * k ? -sw * (1 - d / (90 * k)) : 0; };
    const off = 100 * k;
    const tp = s.miss === 'p' ? s.v + (s.v > wid / 2 ? -off : off) : s.v + (s.du < 0 ? near(26 * k, s.swingP) : 0);
    const tb = s.miss === 'b' ? s.v + (s.v > wid / 2 ? -off : off) : s.v + (s.du > 0 ? near(len - 26 * k, s.swingB) : 0);
    const oldP = s.pp, oldB = s.bp;
    s.pp += (tp - s.pp) * Math.min(1, dt * 9); s.bp += (tb - s.bp) * Math.min(1, dt * 7);
    s.pvP = (s.pp - oldP) / dt; s.pvB = (s.bp - oldB) / dt;
  }

  // playfield border centreline (1px inside the court rect), walked clockwise from the top-left
  function borderRect() { return [G.cx + 1, G.cy + 1, G.cx + G.cw - 1, G.cy + G.ch - 1]; }
  function borderPoint(u) {
    const [X0, Y0, X1, Y1] = borderRect(), Wd = X1 - X0, Hd = Y1 - Y0, P = 2 * (Wd + Hd);
    u = ((u % P) + P) % P;
    if (u < Wd) return [X0 + u, Y0];
    if (u < Wd + Hd) return [X1, Y0 + (u - Wd)];
    if (u < 2 * Wd + Hd) return [X1 - (u - Wd - Hd), Y1];
    return [X0, Y1 - (u - 2 * Wd - Hd)];
  }
  function perimParam(x, y) {
    const [X0, Y0, X1, Y1] = borderRect(), Wd = X1 - X0, Hd = Y1 - Y0;
    const dTop = Math.abs(y - Y0), dRight = Math.abs(x - X1), dBottom = Math.abs(y - Y1), dLeft = Math.abs(x - X0);
    const dmin = Math.min(dTop, dRight, dBottom, dLeft);
    if (dmin === dTop) return x - X0;
    if (dmin === dRight) return Wd + (y - Y0);
    if (dmin === dBottom) return Wd + Hd + (X1 - x);
    return 2 * Wd + Hd + (Y1 - y);
  }

  // ---- drawing -----------------------------------------------------------------------------------

  function helpers(g) {
    return {
      glow: (rgb, al, px) => { g.shadowColor = 'rgba(' + rgb + ',' + al + ')'; g.shadowBlur = px; },
      no: () => { g.shadowBlur = 0; },
      rect: (x, y, w, hh, f) => { g.fillStyle = f; g.fillRect(x, y, w, hh); },
      frame: (x, y, w, hh, rgb, al, lw) => { g.strokeStyle = 'rgba(' + rgb + ',' + al + ')'; g.lineWidth = lw; g.strokeRect(x, y, w, hh); },
      dot: (x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); },
      line: (pts, rgb, al, lw) => { g.strokeStyle = 'rgba(' + rgb + ',' + al + ')'; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    };
  }

  // SCORE-FLARE: the scorer's blob swells and brightens for 0.7s after a point
  function scoreBlob(h, side) {
    const [cx, cy, w0, h0] = S.blobs[side], rgb = side === 'p' ? CYAN : ORANGE, f = s.flares[side];
    let sc = 1, lift = 0;
    if (f) {
      const u = f.t / 0.7;
      sc = u < 0.25 ? 1 + (f.pulse - 1) * (u / 0.25) : f.pulse - (f.pulse - 1) * ((u - 0.25) / 0.75);
      lift = f.a * (1 - u);
    }
    const w = w0 * sc, hh = h0 * sc;
    h.glow(rgb, 0.9, 3 + 4 * lift); h.rect(cx - w / 2, cy - hh / 2, w, hh, 'rgba(' + rgb + ',' + (0.85 + 0.15 * lift) + ')'); h.no();
  }

  // TRAIL + 3 green DOTS running along it (the bar is full, so DOTS run)
  function trailDots(h, pts) {
    h.line(pts, CYAN, 0.3, 3);
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
    h.glow(DOT_GREEN, 0.9, 2);
    for (let i = 0; i < 3; i++) {
      let u = ((s.t / DOT_TRAVEL_S) + i / 3) % 1 * tot, j = 0;
      while (j < segs.length - 1 && u > segs[j]) { u -= segs[j]; j++; }
      const f = u / segs[j], x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
      h.dot(x, y, S.dotR, 'rgb(' + DOT_GREEN + ')');
    }
    h.no();
  }

  // PROC bar with its SWEEP (phone scenes; desktop keeps board 13's own sweep)
  function procSweep(g, h, x, y, w, hh) {
    h.rect(x, y, w, hh, '#050B12'); h.glow(CYAN, 0.7, 3); h.frame(x + 1, y + 1, w - 2, hh - 2, CYAN, 0.9, 3);
    const sw = x + (0.5 + 0.5 * Math.sin(s.t * 1.4)) * (w - w * 0.25);
    const sg = g.createLinearGradient(sw, 0, sw + w * 0.25, 0);
    sg.addColorStop(0, 'rgba(0,229,255,0)'); sg.addColorStop(0.5, 'rgba(0,229,255,0.9)'); sg.addColorStop(1, 'rgba(0,229,255,0)');
    g.fillStyle = sg; g.fillRect(sw, y + 3, w * 0.25, hh - 6); h.no();
  }

  // BAR as 5 straight segments filling a rect (phone scenes), SEG-1 nearest the badge
  function barSegments(h, x, y, w, hh, vertical) {
    const n = BAR_SEGS, gap = BAR_GAP;
    if (vertical) {
      const sh = (hh - (n - 1) * gap) / n;
      for (let i = 0; i < n; i++) h.rect(x, y + hh - (i + 1) * sh - i * gap, w, sh, BAR_GREEN);
    } else {
      const sw = (w - (n - 1) * gap) / n;
      for (let i = 0; i < n; i++) h.rect(x + i * (sw + gap), y, sw, hh, BAR_GREEN);
    }
  }

  // Desktop surroundings (board 13)
  function drawDesktop(g, h) {
    // header blocks (no text): wordmark bar, theme switch, gear
    h.rect(32, 32, 190, 18, 'rgba(0,229,255,0.55)');
    h.rect(1080, 22, 112, 44, 'rgba(12,23,34,1)'); h.rect(1082, 24, 54, 40, 'rgba(0,229,255,0.7)');
    h.rect(1204, 22, 44, 44, 'rgba(12,23,34,1)');
    // SCORE panel
    h.rect(460, 30, 360, 94, '#0A1622'); h.frame(460, 30, 360, 94, CYAN, 0.45, 2);
    scoreBlob(h, 'p'); scoreBlob(h, 'b');
    // BAR: 5 slanted segments, all lit (full, 6/6) + badge; status dot steady green
    h.glow(BAR_GLOW, 0.9, 3);
    g.fillStyle = BAR_GREEN;
    const segH = (234 - (BAR_SEGS - 1) * BAR_GAP) / BAR_SEGS;
    const bx = (x) => 220 + (x - 17) * 32 / 26, by = (y) => 166 + (y - 44) * 266 / 234;   // BAR geometry -> scene
    for (let i = 0; i < BAR_SEGS; i++) {
      const yb = 278 - i * (segH + BAR_GAP), yt = yb - segH;
      g.beginPath();
      g.moveTo(bx(17), by(yb)); g.lineTo(bx(43), by(yb - 6)); g.lineTo(bx(43), by(yt - 6)); g.lineTo(bx(17), by(yt));
      g.closePath(); g.fill();
    }
    h.dot(236, 456, 24, BAR_GREEN);
    h.rect(186, 116, 9, 9, '#2EE06C'); h.no();
    // SLIDER track + handle (follows the player paddle)
    h.rect(307, 140, 2, 380, 'rgba(0,229,255,0.28)');
    h.glow(CYAN, 0.8, 2); h.rect(296, 268 + (s.pp - G.wid / 2) * 0.3, 24, 80, 'rgba(0,229,255,0.6)'); h.no();
    trailDots(h, [[236, 482], [236, 639], [340, 639]]);
    // MODES: three blocks, first one selected
    for (let i = 0; i < 3; i++) {
      const x = 340 + i * 204;
      h.rect(x, 560, 192, 46, '#0C1722');
      if (i === 0) { h.glow(CYAN, 0.7, 3); h.frame(x + 1, 561, 190, 44, CYAN, 0.95, 3); h.no(); }
      else h.frame(x, 560, 192, 46, CYAN, 0.25, 2);
    }
    // PROC bar with moving sweep
    h.rect(340, 626, 600, 26, '#050B12'); h.glow(CYAN, 0.7, 3); h.frame(341, 627, 598, 24, CYAN, 0.9, 3);
    const sw = 340 + (0.5 + 0.5 * Math.sin(s.t * 1.4)) * 456;
    const sg = g.createLinearGradient(sw, 0, sw + 140, 0);
    sg.addColorStop(0, 'rgba(0,229,255,0)'); sg.addColorStop(0.5, 'rgba(0,229,255,0.9)'); sg.addColorStop(1, 'rgba(0,229,255,0)');
    g.fillStyle = sg; g.fillRect(sw, 630, 140, 18); h.no();
    // COMMENT block
    h.rect(340, 694, 600, 62, '#0C1722'); h.frame(340, 694, 600, 62, CYAN, 0.25, 2);
  }

  // Phone upright surroundings (board 15, layout A)
  function drawUpright(g, h) {
    h.rect(16, 56, 120, 14, 'rgba(0,229,255,0.55)'); h.rect(338, 50, 36, 36, '#0C1722');
    h.rect(16, 100, 358, 56, '#0A1622'); h.frame(16, 100, 358, 56, CYAN, 0.45, 2);
    scoreBlob(h, 'p'); scoreBlob(h, 'b');
    h.glow(BAR_GLOW, 0.9, 3);
    h.rect(170, 172, 140, 8, 'rgba(46,224,108,0.35)');
    barSegments(h, 52, 194, 290, 20, false); h.dot(34, 204, 16, BAR_GREEN); h.no();
    h.rect(16, 666, 163, 38, '#0C1722'); h.glow(CYAN, 0.7, 3); h.frame(17, 667, 161, 36, CYAN, 0.95, 3); h.no();
    h.rect(189, 666, 163, 38, '#0C1722'); h.frame(189, 666, 163, 38, CYAN, 0.25, 2);
    procSweep(g, h, 16, 720, 336, 18);
    h.rect(16, 772, 358, 52, '#0C1722'); h.frame(16, 772, 358, 52, CYAN, 0.25, 2);
    trailDots(h, [[344, 204], [370, 204], [370, 729], [352, 729]]);
  }

  // Phone sideways surroundings (board 15, layout B)
  function drawSideways(g, h) {
    h.rect(62, 22, 90, 10, 'rgba(0,229,255,0.55)'); h.rect(760, 10, 32, 32, '#0C1722');
    h.rect(232, 10, 380, 36, '#0A1622'); h.frame(232, 10, 380, 36, CYAN, 0.45, 2);
    scoreBlob(h, 'p'); scoreBlob(h, 'b');
    h.glow(BAR_GLOW, 0.9, 3);
    barSegments(h, 88, 84, 26, 200, true); h.dot(101, 302, 18, BAR_GREEN); h.dot(66, 56, 4, '#2EE06C'); h.no();
    h.rect(660, 70, 132, 36, '#0C1722'); h.glow(CYAN, 0.7, 3); h.frame(661, 71, 130, 34, CYAN, 0.95, 3); h.no();
    h.rect(660, 116, 132, 36, '#0C1722'); h.frame(660, 116, 132, 36, CYAN, 0.25, 2);
    h.rect(660, 168, 132, 168, '#0C1722'); h.frame(660, 168, 132, 168, CYAN, 0.25, 2);
    procSweep(g, h, 200, 346, 300, 14);
    trailDots(h, [[101, 322], [101, 353], [200, 353]]);
  }

  // The court and the rally, same for every scene
  function drawCourt(g, h) {
    const { cx, cy, cw, ch, len, wid, k, m, pl } = G, V = S.vertical;
    // field, cyan frame, dashed net
    h.rect(cx, cy, cw, ch, '#02040A');
    h.glow(CYAN, 0.8, 3); h.frame(cx + 1, cy + 1, cw - 2, ch - 2, CYAN, 0.9, 3); h.no();
    g.setLineDash([11, 7]);
    h.line(V ? [[cx + 12, cy + ch / 2], [cx + cw - 12, cy + ch / 2]] : [[cx + cw / 2, cy + 12], [cx + cw / 2, cy + ch - 12]], CYAN, 0.28, 3);
    g.setLineDash([]);
    // paddles: flare on a hit, then hold a softer glow until the other paddle hits
    const flare = (t) => Math.pow(Math.max(0, 1 - t / HIT_GLOW_S), 2);
    const rel = (t) => HOLD_LEVEL * Math.max(0, 1 - t / RELEASE_S);
    const kP = Math.max(flare(s.hp), s.holder === 'p' ? HOLD_LEVEL : rel(s.relP));
    const kB = Math.max(flare(s.hb), s.holder === 'b' ? HOLD_LEVEL : rel(s.relB));
    const paddle = (uc, vc, rgb, fill, kk) => {
      const vt = Math.max(m, Math.min(wid - m - pl, vc - pl / 2));
      h.glow(rgb, 0.8 + 0.2 * kk, 3 + 3 * kk);
      if (V) h.rect(cx + vt, cy + len - uc - 4, pl, 8, fill); else h.rect(cx + uc - 4, cy + vt, 8, pl, fill);
      h.no();
    };
    paddle(20 * k, s.pp, CYAN, '#00E5FF', kP);
    paddle(len - 20 * k, s.bp, ORANGE, '#FF8A1F', kB);
    // SPARKS: fade and shrink
    for (const p of s.sparks) {
      const t = p.age / p.life, [x, y] = map(p.u, p.v), sz = 8 * (1 - 0.5 * t);
      h.rect(x - sz / 2, y - sz / 2, sz, sz, 'rgba(' + (p.hot ? WHITE : p.rgb) + ',' + Math.max(0, 1 - t) + ')');
    }
    // BALL + TAIL: white until someone hits it, then the last hitter's colour; the square spins
    if (s.serve <= 0) {
      const ballRgb = s.holder === 'b' ? ORANGE : CYAN;
      const ballFill = s.holder === 'p' ? '#00E5FF' : s.holder === 'b' ? '#FF8A1F' : '#FFFFFF';
      const sp = Math.hypot(s.du, s.dv) || 1, tl = 0.25 * len;
      const [x1, y1] = map(s.u, s.v), [x2, y2] = map(s.u - s.du / sp * tl, s.v - s.dv / sp * tl);
      const tg = g.createLinearGradient(x1, y1, x2, y2);
      tg.addColorStop(0, 'rgba(' + ballRgb + ',0.35)'); tg.addColorStop(1, 'rgba(' + ballRgb + ',0)');
      g.strokeStyle = tg; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const bs = S.ball;
      g.save(); g.translate(x1, y1); g.rotate(s.ang * Math.PI / 180);
      h.glow(ballRgb, 0.9, 4); h.rect(-bs / 2, -bs / 2, bs, bs, ballFill); h.no();
      g.restore();
    }
  }

  // Point effects, same for every scene
  function drawPointFx(g, h) {
    // GOAL-MOUTH: the stretch of border the ball crossed glows, stretches and fades
    g.lineCap = 'round';
    for (const mo of s.mouths) {
      const t = mo.t / 0.7, ln = mo.len * (0.6 + 0.6 * t), al = mo.a * (1 - t);
      const v0 = Math.max(2, mo.v - ln / 2), v1 = Math.min(G.wid - 2, mo.v + ln / 2);
      h.glow(mo.rgb, al, 4); h.line([map(mo.u, v0), map(mo.u, v1)], mo.rgb, al, 6);
    }
    h.no();
    // BORDER-SWEEP: the border lights in the scorer's colour from the crossing point, meets on the far side, fades
    const [X0, Y0, X1, Y1] = borderRect(), P = 2 * ((X1 - X0) + (Y1 - Y0));
    for (const o of s.borders) {
      const sweepT = 0.25, total = 0.55;
      const kk = Math.min(1, o.t / sweepT), reach = (P / 2) * (1 - Math.pow(1 - kk, 3));
      const fade = o.t < sweepT ? 1 : Math.max(0, 1 - (o.t - sweepT) / (total - sweepT));
      const al = ({ 1: 0.4, 2: 0.65, 3: 1 })[o.L] * fade;
      if (al <= 0.01) continue;
      const pts = [];
      for (let i = 0; i <= 80; i++) pts.push(borderPoint(o.origin - reach + (2 * reach) * i / 80));
      g.lineJoin = 'miter';
      h.glow(o.rgb, al, 3 + o.L); h.line(pts, o.rgb, al, 3 + o.L);
    }
    h.no();
    // DEREZ fragments carrying on out past the line
    for (const f of s.frags) {
      const t = f.age / f.life, sz = 2 * f.size * (1 - 0.4 * t), [x, y] = map(f.u, f.v);
      h.rect(x - sz / 2, y - sz / 2, sz, sz, 'rgba(' + (f.hot ? WHITE : f.rgb) + ',' + Math.max(0, 1 - t) + ')');
    }
  }

  function draw() {
    const d = RES_DIV, W = Math.max(1, Math.round(area.w / d)), H = Math.max(1, Math.round(area.h / d));
    for (const c of [cv, a]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const bw = Math.max(6, Math.round(W / SOFTNESS)), bh = Math.max(6, Math.round(H / SOFTNESS));
    if (b.width !== bw || b.height !== bh) { b.width = bw; b.height = bh; }
    const g = a.getContext('2d'), k = 1 / d, h = helpers(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05070D'; g.fillRect(0, 0, W, H);
    // draw in scene coordinates (scene centred in the area); everything lands at tiny size
    g.setTransform(k, 0, 0, k, area.ox * k, area.oy * k);
    // grid haze (across the whole area, on the scene's grid lines) + centre glow
    const gx0 = -area.ox, gx1 = S.W + area.ox, gy0 = -area.oy, gy1 = S.H + area.oy, gs = S.grid;
    g.strokeStyle = 'rgba(0,229,255,0.10)'; g.lineWidth = 3;
    for (let x = Math.floor(gx0 / gs) * gs; x <= gx1; x += gs) { g.beginPath(); g.moveTo(x, gy0); g.lineTo(x, gy1); g.stroke(); }
    for (let y = Math.floor(gy0 / gs) * gs; y <= gy1; y += gs) { g.beginPath(); g.moveTo(gx0, y); g.lineTo(gx1, y); g.stroke(); }
    const [gcx, gcy, r0, r1] = S.glow;
    const rg = g.createRadialGradient(gcx, gcy, r0, gcx, gcy, r1);
    rg.addColorStop(0, 'rgba(0,229,255,' + (0.10 + 0.04 * Math.sin(s.t * 0.9)) + ')'); rg.addColorStop(1, 'rgba(0,229,255,0)');
    g.fillStyle = rg; g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    S.chrome(g, h);
    drawCourt(g, h);
    drawPointFx(g, h);
    // blur pass: shrink further, stretch back (smoothing on) -> soft everywhere, any browser
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bctx = b.getContext('2d'); bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
    bctx.clearRect(0, 0, bw, bh); bctx.drawImage(a, 0, 0, bw, bh);
    const out = cv.getContext('2d'); out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.clearRect(0, 0, W, H);
    out.drawImage(b, 0, 0, W, H);
  }

  // ---- loop --------------------------------------------------------------------------------------

  // Resize / rotation: switch scene if the screen shape crossed a boundary (the rally restarts), re-fit.
  function onResize() {
    const key = pickScene();
    if (key !== sceneKey) setScene(key);
    measure();
  }
  setScene(pickScene());
  measure();

  // Reduced motion: one still frame, ball mid-court, no loop (redrawn only when the window changes shape).
  if (reduced) {
    draw();
    window.addEventListener('resize', () => { onResize(); draw(); });
    return;
  }
  window.addEventListener('resize', onResize);

  let raf = 0, last = null;
  const tick = (ts) => {
    if (last === null) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05); last = ts;
    if (dt > 0) step(dt);
    draw();
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!raf) { last = null; raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  // Pause while the tab is hidden, to save battery.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  if (!document.hidden) start();
})();
