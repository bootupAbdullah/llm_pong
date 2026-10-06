# Placeholder page (llmpong.com): start here

Docs for the IDE chat that builds the llmpong.com "coming soon" page. Nothing in this folder ships; it is chat context only.

## Where this fits
LLM Pong is browser Pong whose bot is retuned by a language model running on a home server.

- **Main line (game):** the game, currently in the Phase 4.5 overhaul (Tron look, data/processing bars). The redesign is complete on the Claude design canvas but not yet translated to code. Once the game is complete, the next phase is backend services (the Ollama/LLM server).
- **Side branch (demo):** the public demo is a tangent off the redesign. It is a separate effort, not part of the Phase 4.5 stages.
- **This task:** the first piece of the demo, the static placeholder page. It touches none of the game code in `src/`.

Chat roles: the planning chat owns decisions, this (IDE) chat builds one stage at a time, and the server chat owns DNS, nginx, TLS, the waitlist endpoint and deployment.

## About `.claude/RESUME-HERE.md`
`CLAUDE.md` says to read it first. It is an old note (2026-09-19) about other work: Phase 4 (blocked, Ollama server not reachable) and the Phase 4.5 redesign (finished on the Claude design canvas, none of it in code). Read it for context, but it is not this task. This README is the only instruction for this task. Do not edit or delete that file. Current project state, as background only, is in `.claude/placeholder-site-docs/project-state.md`, kept locally, not in the repo.

## Read in this order
1. `placeholder-build-brief.md`: the full spec (scope, background method, card, form states, phone layout, head tags, done-when list).
2. `placeholder-board13-reference.html`: standalone visual reference. Port `step()` and `draw()` only. Its form is a demo toggle and must not be copied (the brief requires a real `<form>` with five states).
3. `placeholder-board15-phone-reference.html`: the phone version (board 15). Upright phone (390x844): vertical court behind the card, card full width with 16px margins, email and button stacked. Sideways phone (844x390): the desktop-shaped court behind a shorter card, email and button side by side. Phone bezels and captions are presentation only. This replaces the brief's "crop the sides" rule for tall screens.
4. Optional, for visual language only: `.claude/phase-4.5-design-spec.md` (cyan `#00E5FF`, orange `#FF8A1F`, Orbitron and Rajdhani fonts) and `.claude/pong-project-handoff.md` (project vision).

## Where the output goes
- Build the page in `placeholder-site/frontend/` (tracked in git, separate from `src/` and the game build).
- Keep docs and page apart: the server chat deploys `placeholder-site/frontend/` to the server, so no docs may live there. Docs live in `placeholder-site/docs/`; the waitlist back end goes in `placeholder-site/backend/`.
- Static only: `index.html`, `styles.css`, `bg.js`, `form.js`, `og-image.png`, `favicon.svg`. No framework, no build step. The game's esbuild setup is not involved.

## Branch and rules
- Work on branch `placeholder-landing-page`, cut from `main` with these docs committed. Leave `phase-4.5-cosmetic-gamification` alone.
- Merge to `main` only when the user confirms. This overrides the brief's "or `main`" wording.
- `CLAUDE.md` on this branch carries the full working rules (read-first files, one stage at a time, no proactive browser, branch per change). Follow it, and you may read the rest of `.claude/` (read-only) for context and past incidents.
- One stage at a time: stop and report after each, and do only what was asked.

## Open inputs (ask the user, do not guess)
- Footer URLs: akddev.co, LinkedIn, Bluesky.
- Final pitch copy (draft is in the brief).
- OG image: user-supplied, or captured from the running page.
- `WAITLIST_URL` stays unset until the server chat decides the endpoint.

## Out of scope for this chat
DNS, nginx, TLS, the waitlist endpoint, deployment (server chat).
