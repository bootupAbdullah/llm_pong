# Back end: llmpong.com waitlist (Go)

Plan and outline for the back-end chat. Front end is finished and live (`../frontend/`). Spec details: `../docs/placeholder-build-brief.md` (section 6 form, section 8 OG image). Overall plan: `claude/llm-pong-roadmap.md`.

## Goal
Visitors enter an email on llmpong.com, it is saved, and they get a confirmation email with a link (double opt-in). Everything runs on the existing DigitalOcean VM.

## Language
The waitlist endpoint is written in Go (decided 2026-11-07, after a risk review). C is kept for the future inference service; decide again then. The existing `do_1_server` (entrvm.xyz) stays Go and is not touched.

## Rules
- Work on a new branch from `main`. Only touch `placeholder-site/`. Merge to `main` only when Abdullah confirms (fast-forward only).
- Never ask for or accept passwords or keys in chat. Abdullah enters secrets directly on the VM or provider site.
- Do what can be done directly. Give Abdullah exact commands or steps for anything account-side, then wait.
- Ask before any destructive step. Do not change anything not asked for.
- Never go live with a dead form. Until the endpoint works, the form stays hidden (the `form-off` class on the card in `frontend/index.html`).
- Keep it simple. Short replies, one step at a time, checklist reports.

## VM (current state, 2026-11-07)
- The VM is a DigitalOcean server shared with `entrvm.xyz`.
- llmpong.com is live over HTTPS.
- All paths, nginx file names, update commands and access details are in the project knowledge doc `nginx-handoff.md`, not in this public repo.
- Never edit the `entrvm.xyz` block or lines marked `# managed by Certbot`.
- Back up, run `nginx -t`, then reload, and retest `https://entrvm.xyz/health` after every nginx change.

## Security requirements

| Risk | Requirement |
|---|---|
| Guessable tokens | 32 random bytes from crypto/rand. Store only a SHA-256 hash of the token. Tokens expire (7 days) and work once. |
| Mail scanners auto-confirming | The email link opens a page with a confirm button that submits a POST. A plain GET never changes the row. |
| SQL injection | Parameterized queries only. No SQL built from strings. Database file mode 0600, owned by the service user, outside the web root. |
| Header or email injection | Parse with net/mail, require the parsed address to equal the input, reject control characters and CR/LF, at most 254 characters, normalize to lowercase. Send through Resend's JSON API, not SMTP. Fixed From address, subject, and template. Escape any value placed in HTML with html/template. |
| Rate-limit gaps | Three layers: nginx limit_req per IP (zone defined at the http level, so back up and run nginx -t), an app limit per IP and per address (at most one confirmation email per address per set interval), and a daily global send cap below Resend's free cap. Client IP comes only from X-Real-IP set by nginx; the service listens on 127.0.0.1 only. |
| Bad input | POST only. Content-Type application/json required. Body cap of 1 KB (http.MaxBytesReader and nginx client_max_body_size). Strict JSON decode, one object, unknown fields rejected. Server timeouts set. Generic error messages, no stack traces. |
| Address enumeration | The signup response is identical for new and existing addresses. |
| Secrets | The Resend key lives in a root-owned 0600 environment file loaded by systemd, as a send-only key limited to llmpong.com. It never appears in the repo or in chat. |
| Data minimum | Store email, token hash, confirmed flag, and timestamps. Purge unconfirmed rows after 30 days. A way to delete an address on request. Backups with the same permissions. Later emails carry an unsubscribe link. |
| Process hardening | Dedicated unprivileged user. systemd sandbox directives (NoNewPrivileges, ProtectSystem=strict, ProtectHome, PrivateTmp, write access only to the database folder). Port 8081 is not opened in ufw. |
| Same-origin only | No CORS headers. The form posts to the same site. |

## Verification before the form goes live
- Tests for validation, token handling, expiry and reuse.
- go vet, staticcheck and govulncheck clean, dependency versions pinned.
- Manual abuse tests: oversized body, wrong content type, CR/LF in the address, SQL characters, duplicate signups, rapid-fire requests to trigger the limits, malformed, expired, reused and invalid tokens.
- Final check that entrvm.xyz still works.

Gate: if any requirement is unmet, the form stays hidden (form-off). The overwatch chat reviews code and test results against this section before any merge.

## Steps

### 1. Form and storage (no email yet)
- [ ] `frontend/form.js` per brief section 6 (constants `WAITLIST_URL`, `SHOW_FORM`; JSON POST `{ "email": "..." }`; five states; `checkValidity()`; `aria-live` note). Add the script tag to `index.html`. Decide how `SHOW_FORM` and the existing `form-off` class relate so there is one switch, not two.
- [ ] One-line privacy note under the form.
- [ ] Go endpoint in `backend/` (`net/http`, `encoding/json`, `net/mail`): validate email, save to SQLite **before** anything else, ignore duplicates, rate limits per Security requirements, JSON reply. SQLite driver chosen and pinned during the build; the build chat decides between a pure-Go driver and a cgo one and explains the choice.
- [ ] Table columns: `email` (unique), `token_hash`, `token_expires_at`, `confirmed` (default false), `created_at`.
- [ ] Test locally (see Verification).

### 2. Put the endpoint live
- [ ] systemd service (own user, sandboxed, `127.0.0.1` only).
- [ ] nginx, in the llmpong.com block only: `location /api/waitlist` proxied to the endpoint, small `client_max_body_size`, `limit_req`, proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`). Add it to the 443 block. Same origin, so no CORS.
- [ ] Turn the form on, test on a phone, test duplicates and bad input, delete test rows, retest entrvm.xyz.
- [ ] Launch with a plain signup message ("You're on the list") if email is not ready.

### 3. Confirmation email (start the account early, runs in parallel)
- [ ] Abdullah creates a free Resend account (check current free-tier limits).
- [ ] Add Resend's DNS records (SPF, DKIM, DMARC) at Porkbun. llmpong.com already has an SPF TXT record for Porkbun email forwarding; merge Resend's include into it instead of adding a second SPF record. Wait for verification.
- [ ] Abdullah enters the API key on the VM himself.
- [ ] After saving, send an email with `https://llmpong.com/confirm?t=TOKEN` (token from `crypto/rand`; Resend JSON API called with `net/http`).
- [ ] `/confirm` GET shows a confirm button (no change to the row); its POST sets `confirmed = true` and shows a small "You're confirmed" page in the site style (`html/template`). Invalid, expired or reused token handled gracefully.
- [ ] Success message on the form: "Check your email to confirm. Look in spam too."
- [ ] DigitalOcean usually blocks outbound SMTP, so use the HTTPS API, not SMTP.

### 4. Test
- [ ] Real signup end to end: row saved, email arrives (check spam), link works.
- [ ] Remove test rows.

## Failure notes
- A signup is saved before any email is attempted, so an email failure never loses an address.
- Unconfirmed rows can be re-sent, limited to one email per address per interval, and are purged after 30 days.
- Email must never delay the page launch.

## Open items
- Privacy items are covered in Security requirements (Data minimum).
- Docker is not used unless a reason appears; if it is, publish ports on 127.0.0.1 only.
