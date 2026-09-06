# LLM Pong — orientation for a fresh session

Before starting work, read these files if present (they're git-ignored — local to this machine, not part of the repo history):

0. **`.claude/RESUME-HERE.md`** — if present, a mid-work session handoff: exact current state and the immediate next action. Read it first; it's deleted once its open question is resolved.
1. **`.claude/pong-project-handoff.md`** — the original Phase 1 spec: scope, explicit non-goals, and design decisions with rationale.
2. **The highest-numbered `.claude/checkpoint-N.md`** — the most recent snapshot of what's actually been built, what changed since the prior checkpoint, and open threads. Earlier checkpoints are kept as history, not overwritten — only the latest one reflects current status.

If neither exists (e.g. a fresh clone on a different machine), fall back to `README.md` (tracked in git) for the project vision and roadmap, and `git log` for history.

## Working conventions established so far

- **Branch per change, merge to `main` only when the user confirms.** Don't commit directly to `main`. Delete the local branch after merging.
- **The deliverable is still one self-contained `index.html`** — no external runtime dependencies beyond an occasional Google Fonts `<link>`, images/icons embedded as base64 data URIs — but as of Phase 2 it is **generated**, not hand-edited. Source is TypeScript under `src/` (`src/*.ts` + `src/index.html` template); `npm run build` (esbuild) bundles and inlines the JS into the committed `index.html`. `npm run typecheck` runs strict `tsc`. `npm run watch` rebuilds on change. Edit `src/`, never the built `index.html` directly. `npm install` once per machine (Node is a dev-time dependency only; the shipped file needs nothing).
- **Don't drive the browser with automated coordinate-based clicks** (`osascript`/System Events `click at`) — proved unreliable in this environment (multi-monitor setup) and wasted time chasing tooling problems instead of real bugs. Opening/navigating to a page (`open`, or telling Chrome to load a URL) is fine and reliable; it's synthetic *clicking* specifically to avoid. A reload-and-screenshot to visually check layout is fine with a heads-up first. For anything that needs an actual interaction to verify, either reason about it via code review or let the user click it themselves.
- Another chat session may be concurrently maintaining `README.md` and committing directly to `main` in parallel — that's expected, not a conflict to flag.
