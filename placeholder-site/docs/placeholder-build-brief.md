# llmpong.com Placeholder Page — Build Brief

**For:** the IDE chat that builds the page (Claude Code, in the repo).
**Source of truth:** on the design canvas "LLM Pong Grid Mockup", board 13 (desktop) and board 15 (phone, upright and sideways). Runnable standalone copies are in the project: `claude/placeholder-board13-reference.html` (desktop) and `claude/placeholder-board15-phone-reference.html` (phone).
**Timing:** this week, as time allows. Ideally the page is up before the LinkedIn post (planned around Oct 7) so its link works.

---

## 1. Scope

**In scope (this chat):** a static, single-page site: one HTML file, one CSS file, one JS file, no framework, no build step.

**Out of scope (server chat):**
- DNS at Porkbun
- nginx
- TLS
- the waitlist endpoint
- deploying the files

This page only needs one setting to point at that endpoint (see §6).

**Location:** `placeholder-site/frontend/`, separate from the game code and from the Phase 4.5 branch. The server chat deploys this one folder, `placeholder-site/frontend/`, to the server. Docs live in `placeholder-site/docs/`; the waitlist back end goes in `placeholder-site/backend/`.

```
placeholder-site/frontend/
  index.html
  styles.css
  bg.js          # background animation
  form.js        # waitlist form (or inline in index.html)
  og-image.png   # 1200x630 social card (see §8)
  favicon.svg
```

---

## 2. What the page is

A dark, full-screen "coming soon" page:
- **Background:** a soft, blurred, slowly moving view of the LLM Pong game (rallies, paddles, ball, sparks, glow).
- **Card:** centered, with the waitlist form.
- **Footer:** small links, bottom right.

## 3. Background: ship-safe blur (most important)

The design must not be recoverable from the page. Turning off CSS or editing styles in the browser's developer tools must reveal nothing sharp. The method below comes from board 13 and must be kept as is.

1. **Tiny canvas.** The visible `<canvas>` has a pixel size of about 1/8 of the 1280×820 scene (160×103). CSS stretches it to fill the viewport. There is never a full-resolution canvas.
2. **Blur baked into the pixels.** Draw the scene into an offscreen canvas at that tiny size. Shrink it again by 3× into a second offscreen canvas. Draw that back onto the visible canvas with `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`. This is a cheap blur that works in every browser and does not use `ctx.filter`.
3. **Rough shapes only.** The code draws only blocks, bars, dots and glows:
   - grid
   - playfield frame
   - paddles
   - ball and tail
   - sparks
   - the green bar and badge circle
   - panel blocks
   - the PROC sweep
   - the green trail dots

   It draws **no text, icons, badge figure or panel detail**. Someone who edits the code to render at full size gets a sketch, not the design.

**Port `step()` and `draw()` from the reference file.** They are plain canvas code. Only the wrapper is design-canvas specific: `class Component extends DCLogic`, `componentDidMount`, `this.props`, `renderVals`. Replace the wrapper with a plain `requestAnimationFrame` loop. Defaults to keep: `resolution` 1/8, `softness` "softer" (divide by 3).

**Behaviour:**
- **Motion.** A self-playing rally:
  - Paddles follow the ball with a slight lag.
  - The ball hits produce sparks.
  - Occasionally a paddle misses.
  - When someone scores, the playfield border flashes the scorer's colour (cyan for the player, orange for the bot) and the ball is re-served.
  - The scene has no score text.
- **Pause** the loop when the tab is hidden (`document.visibilitychange`) to save battery.
- **Reduced motion** (`prefers-reduced-motion: reduce`): draw a single still frame and do not start the loop.
- **Three scenes, picked by screen shape** (see §7 for phones):
  - **Desktop and tablets:** the board 13 scene, laid out for 1280×820.
  - **Phone upright:** the board 15 upright scene (layout A, vertical court), laid out for 390×844.
  - **Phone sideways:** the board 15 sideways scene (layout B), laid out for 844×390.
  - **One sizing rule for all three: fit, never crop.** The drawing area takes the window's shape; the whole scene fits inside it, centred, at the largest size that fits; extra space (left/right on wide windows, above/below on tall ones) is filled with more background grid. Nothing is cropped or stretched. (Decided Oct 5: cover-and-crop hid COMMENT and PROC on wide desktop windows.)
  - Switch scenes on resize/rotation; the rally can simply restart.
- **Already built on desktop and accepted** (IDE chat, branch `placeholder-landing-page`): DOTS loop slowed to 3.2 s; BALL takes the last hitter's colour and spins; TAIL fades; paddles flare then hold their glow; a point plays DEREZ, GOAL-MOUTH, BORDER-SWEEP and SCORE-FLARE; BAR is 5 segments, held full. Use the same behaviour in the phone scenes.
- **Before the script runs**, the page background colour `#05070D` shows, so nothing flashes white.

## 4. Overlay and card

**Dim layer** (full screen, above the canvas, `pointer-events: none`):
`radial-gradient(ellipse 55% 60% at 50% 48%, rgba(5,7,13,0.40) 0%, rgba(5,7,13,0.70) 100%)` (the "medium" setting).

**Card:** 540px wide on desktop, centred horizontally. On the 820px-tall board it sits at top 210px; in the real page, centre it vertically.

| Property | Value |
|---|---|
| Padding | `40px 48px 34px` |
| Border | `1px solid rgba(0,229,255,0.45)` |
| Background | `linear-gradient(180deg, rgba(12,24,36,0.92) 0%, rgba(6,13,22,0.94) 100%)` |
| Shadow | `inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 26px rgba(0,229,255,0.08), 0 0 0 1px rgba(0,229,255,0.08), 0 0 30px rgba(0,229,255,0.16), 0 24px 60px rgba(0,0,0,0.6)` |
| Corner cuts | `clip-path: polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%, 0 18px)` (the top two corners are cut) |
| Layout | column, centred, `text-align: center` |

**Card contents, top to bottom:**
1. **Status line:**
   - An 8px pulsing dot: `#00E5FF`, glow `0 0 2px rgba(0,229,255,0.95), 0 0 8px rgba(0,229,255,0.6), 0 0 16px rgba(0,229,255,0.32)`; the opacity pulses 0.35↔1 every 0.9s, alternating.
   - The label **COMING SOON**: Orbitron 700, 11px, letter-spacing 5px, `#00E5FF`.
   - 18px gap below.
2. **Wordmark:**
   - **LLMPONG**: Orbitron 800, 36px, letter-spacing 4px, `#00E5FF`, text-shadow `0 0 14px rgba(0,229,255,0.6), 0 0 3px rgba(0,229,255,0.8)`.
   - **.com**: weight 500, `#7FA9B8`.
3. **Divider:** 64×2px, `linear-gradient(90deg, rgba(0,229,255,0), #00E5FF 50%, rgba(0,229,255,0))`, glow `0 0 8px rgba(0,229,255,0.5)`, 20px margin above and below.
4. **Pitch:** Rajdhani 500, 20px, line-height 1.35, `#D6FBFF`, max-width 420px. The copy is a draft; the user may edit it:
   > Play Pong against a bot that learns from you. A language model on a home server studies how you play and retunes your opponent.
5. **Form** (28px above):
   - **Email input:** flex 1, height 46px, padding 0 14px, border `1px solid rgba(0,229,255,0.35)`, radius 3px, background `#050B12`, text `#D6FBFF` in Rajdhani 500 17px, shadow `inset 0 1px 3px rgba(0,0,0,0.6)`.
     - Placeholder text: `you@example.com` in `#5F8796`.
     - Focus: border `#00E5FF`, shadow `0 0 0 1px rgba(0,229,255,0.35), 0 0 12px rgba(0,229,255,0.35)`, no outline.
   - **Button NOTIFY ME:** height 46px, padding 0 20px, no border, radius 3px, background `linear-gradient(180deg, #3FF0FF 0%, #00C4E0 100%)`, text `#05070D` in Orbitron 800 11px with letter-spacing 2px, shadow `inset 0 -1px 0 rgba(0,60,80,0.35), inset 0 1px 0 rgba(255,255,255,0.35), 0 0 14px rgba(0,229,255,0.45)`.
     - 10px gap between the input and the button.
   - **Note under the form** (12px above): Orbitron 9px, letter-spacing 3px, `#7FA9B8`, text **ONE EMAIL WHEN INFERENCE GOES LIVE · NO SPAM**.

## 5. Footer

Bottom right: 32px from the right edge, 24px from the bottom. Orbitron 10px, letter-spacing 2px, `#7FA9B8`, 18px gap between links, hover opacity 0.75.

**AKDDEV.CO · LINKEDIN · BLUESKY**, in that order.
- **No GitHub link** on this page (decided Oct 5).
- The addresses are needed from the user: akddev.co, the LinkedIn profile and the Bluesky profile.
- Open them in a new tab with `rel="noopener"`.

## 6. Waitlist form behaviour

- **Endpoint setting:** one constant at the top of `form.js`, e.g. `const WAITLIST_URL = '/api/waitlist';`. The server chat decides the real value: either a small Go handler on the DigitalOcean server or a hosted form service. Until then it can stay unset.
- **Request:** `POST` with JSON `{ "email": "..." }`, no other fields, no cookies.
- **States:**

| State | Button | Note under the form |
|---|---|---|
| Idle | NOTIFY ME | ONE EMAIL WHEN INFERENCE GOES LIVE · NO SPAM (`#7FA9B8`) |
| Sending | NOTIFY ME, disabled, 0.7 opacity | unchanged |
| Success | ON THE LIST, disabled | THANKS — ONE EMAIL WHEN IT GOES LIVE (`#2EE06C`) |
| Invalid email | unchanged | ENTER A VALID EMAIL (orange `#FF8A1F`) |
| Network/server error | NOTIFY ME | SOMETHING WENT WRONG — TRY AGAIN (orange `#FF8A1F`) |

- **Validation:** check the email format with the browser's own checker (`type="email"` plus `form.checkValidity()`). Use a real `<form>` so pressing Enter submits.
- **Accessibility:**
  - The note under the form is `aria-live="polite"`, so screen readers announce state changes.
  - The input keeps its `aria-label="Email address"`.
- **Fallback switch (`SHOW_FORM = false`):** hides the form and its note, and moves the card down about 40px (board: top 250 instead of 210). Use it if the endpoint isn't ready when the rest of the page is.

## 7. Phone layouts (board 15)

**Which layout:** the background and the card choose separately (updated Oct 5 after a tablet check):

| Screen | Background scene | Card and footer |
|---|---|---|
| Taller than wide, narrower than 600px (phones upright) | Upright (layout A) | Upright phone sizes |
| Taller than wide, 600px or wider (tablets upright, tall windows) | **Upright (layout A)** | Desktop sizes (540px card) |
| Wider than tall, shorter than 500px (phones sideways) | Sideways (layout B) | Sideways phone sizes |
| Everything else (desktop, tablets sideways) | Desktop (board 13) | Desktop sizes |

Why: on an upright tablet (e.g. 1024×1342, 900×1156, 800×1236) the desktop scene fitted to the width came out small, with large empty bands above and below. The tall upright scene fills that shape far better. A dedicated tablet scene (board 14, option C) can replace this later.

### Upright (layout A, e.g. 390×844)

- **Background:** the board 15 upright scene, drawn with the same tiny-canvas blur as desktop (`drawP()` plus `drawCourt()` with a vertical court in the phone reference file). Rough shapes only:
  - header block
  - score panel with two glow blobs
  - a flat green data bar with badge
  - the vertical court: you at the bottom, the bot at the top
  - two control blocks
  - the PROC bar with sweep
  - the comment block
  - the green dots running down the right edge to PROC
- **Card:**
  - Full width minus 16px margins on each side, vertically centred (slightly above centre), padding `32px 22px 28px`.
  - Corner cuts 14px instead of 18px.
- **Sizes:** COMING SOON 10px; wordmark 28px; divider 56px wide with 16px margins; pitch 18px.
- **Form:**
  - The input and the button stack vertically, each full width and 46px high, with 10px between them.
  - The input must not shrink: `flex: none` in the column layout.
  - Note text 8px, letter-spacing 2px.
- **Footer:** centred, 30px above the bottom, Orbitron 9px, 16px gaps.

### Sideways (layout B, e.g. 844×390)

- **Background:** the board 15 sideways scene: the desktop-shaped court in the middle, the upright green bar on the left, the controls and comment column on the right, PROC under the court (`drawL()` plus `drawCourt()` with a horizontal court).
- **Card:** 540px wide, centred, padding `22px 30px 20px`; corner cuts 14px.
- **Sizes:** wordmark 24px; pitch 16px; COMING SOON 10px.
- **Form:** the input and the button side by side, as on desktop.
- **Footer:** bottom right, 28px from the right edge and 14px from the bottom, Orbitron 9px.
- **Fit:** the whole card must fit inside the 390px height with no scrolling. If a phone is shorter, drop the divider and tighten the gaps before anything scrolls.

### Checks

- **Upright:** 390×844 (iPhone-size) and 360×800 (small Android).
- **Sideways:** 844×390 and 800×360.
- Nothing scrolls sideways in either orientation.
- Rotating the phone switches the scene and the card layout cleanly, with no flash of white.

## 8. Head and social tags

- `<title>`: **LLMpong.com — coming soon**
- `meta description`: the pitch line.
- Open Graph and Twitter tags:
  - `og:title`, `og:description`, `og:url` (`https://llmpong.com`), `og:image` (absolute URL to `og-image.png`), `twitter:card=summary_large_image`.
  - The image is 1200×630: a capture of the page with the card (the card is fine to show; the background is already blurred). The user can supply it, or the IDE chat can produce it from the running page.
- **Fonts:** Google Fonts, Orbitron (500/700/800) and Rajdhani (500/600/700), with `preconnect`. Fallbacks: sans-serif.
- **Favicon:** a simple cyan square on a dark background (matches the ball). No brand imagery.
- `<meta name="theme-color" content="#05070D">`.

## 9. Done when

- [ ] It runs locally (`python3 -m http.server` or similar) with no console errors.
- [ ] The background animates. Turning off all CSS in devtools still shows only a soft image, never sharp shapes or text.
- [ ] Reduced motion shows one still frame; a hidden tab pauses the animation.
- [ ] The card and footer match board 13 on desktop at 1280×820 and larger.
- [ ] The phone layouts check out upright (390×844, 360×800) and sideways (844×390, 800×360), each with its own blurred scene, no sideways scroll, and a clean switch on rotation.
- [ ] The form shows all five states. `WAITLIST_URL` and `SHOW_FORM` are the only things the server chat needs to touch.
- [ ] The page loads fast. No libraries; total transfer about 150 KB or less, excluding fonts and the OG image.
- [ ] Committed on a branch or `main` under `placeholder-site/frontend/`, ready for the server chat to deploy.

## 10. Not on this page

- the game
- the tour
- the GitHub link
- the bug-report icon
- the light theme
- analytics
- cookies
