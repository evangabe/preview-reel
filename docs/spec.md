# Preview Reel — Requirements Spec

**Working name:** preview-reel
**Status:** Draft v1, for a ~6 hour build
**Author:** [you]
**Last updated:** 2026-09-08

---

## 1. Problem

Product demo videos rot silently. A feature ships, the UI moves, and every recorded walkthrough in the docs, the changelog, and the sales deck is now subtly wrong. Nobody notices, because nobody re-watches their own demos.

The narrower version of that problem, and the one this project solves: **a feature lands in a PR and there is no video of it.** Recording one costs a human 20–30 minutes of setup, retakes, and editing, so it doesn't happen. Changelog entries ship as text, reviewers approve code they've never seen running, and the first moving picture of the feature is made weeks later by someone in marketing who has to reverse-engineer the flow.

Every preview deployment is a running instance of the product with the new feature in it. The recording could be free.

## 2. Goal

When a preview deployment goes live for a PR that ships a user-visible feature, automatically produce a short, clean demo video of that feature running on that deployment, and surface it on the PR.

## 3. Non-goals

- Not a video editor. No trimming, annotation, or timeline UI.
- Not a replacement for hand-crafted marketing demos.
- Not a general screen recorder. Browser only, one page context, one flow.
- Not a test framework. A failed recording is a signal, not a build failure. Never blocks merge.

## 4. Users

**Primary:** the engineer who opened the PR. Wants proof the feature works and something to paste in the review.

**Secondary:** the reviewer, who wants to see the flow without checking out the branch. And the docs/marketing reader who later needs a current video and doesn't want to ask engineering for one.

## 5. Why existing tools fall short

| Tool | What it does | Gap |
|---|---|---|
| Loom / Screen Studio | Human records, human edits | Requires a human every time; can't run in CI |
| Arcade / Storylane / Supademo | Screenshot/HTML capture into interactive tours | Manual capture; output isn't video; recapture on every UI change |
| WebReel (Vercel Labs) | Records browser demos from a JSON config, headless, ~60fps, cursor + keystroke overlays, ffmpeg encode | Config is hand-written. No authoring, no trigger, no hosting, no CI integration |
| Velo / Demosmith | Agent-generated demos, auto re-record | Closed platforms; not tied to preview deployments or the PR loop |

**Position:** WebReel is the renderer. This project is the authoring layer, the trigger, and the delivery loop around it.

---

## 6. System overview

```
GitHub PR ──▶ Vercel deployment.succeeded webhook
                        │
                        ▼
              [1] Tag check             PR title matches [feat] / [feature]?
                        │  (no tag → exit silently, no comment, no model call)
                        ▼
              [2] Scope the demo        PR title + body + file diff → demo spec
                        ▼
              [3] Post PR comment        state: in_progress
                        │
                        ▼
              [4] Vercel Sandbox         chrome + agent-browser + webreel
                        │
                        ├── explore     agent-browser drives preview URL
                        │                → emits webreel config (JSON)
                        │
                        └── record      webreel replays config deterministically
                                         → mp4
                        ▼
              [5] Upload to Blob         video + config + poster frame
                        ▼
              [6] Update PR comment      state: done | failed
                        │
                        ▼
              Next.js gallery + status page
```

Orchestration is a **Vercel Workflow**. Steps 1–6 are durable steps so a 3-minute run survives a function timeout, a crash, or a redeploy, and can be retried per-step rather than from the top.

## 7. Component requirements

### 7.1 Trigger

**Webhook mechanics**

- **R-1.1** One webhook registered at the **Vercel team level**, pointing at `/api/webhooks/vercel`. It fires for every project in the team; filtering happens in the handler. There is no per-repo installation.
- **R-1.2** Verify `x-vercel-signature`: **HMAC-SHA1** (not SHA-256), hex-encoded, over the **raw request body**, compared in constant time. The secret is shown exactly once when the team webhook is created. Read the raw body before anything parses it — this needs explicit handling in a Next.js route handler.
- **R-1.3** Act only on `deployment.succeeded` where `target !== "production"`. Vercel's webhook payload uses `target: "production"`, `"staging"`, or `null` — preview deployments arrive as `null`, not the string `"preview"`. Filtering on `target === "preview"` would silently drop every event this project exists to handle. Verified against Vercel's webhook API reference; there is no `"preview"` value.
- **R-1.4** **Respond 200 within 30 seconds.** Vercel aborts at 30s and retries non-2xx with exponential backoff for up to 24 hours. Verify, filter, start the Workflow, return. Do no slow work inline.
- **R-1.5** Fully idempotent, on two axes. First, given the 24-hour retry window, the same deployment ID must never produce two runs — a `head()` on a `runs/{deploymentId}/` sentinel before starting the Workflow covers this. Second, and separate from R-2.10's completed-record check: a *new* deployment for a PR that already has a run **in progress** (a commit pushed mid-run, R-2.10 doesn't catch this because it only checks for completed records) must not start a second concurrent run — check for an in-progress record keyed on `(repo, prNumber)` and skip, consistent with §8's "let the current run finish." Delivery order is not guaranteed, so never infer sequence from arrival.

**Repo filtering**

- **R-1.6** Filter against `PREVIEW_REEL_REPOS`, a comma-separated allowlist. Anything not listed exits before the tag check, before any GitHub call.
- **R-1.7** The target project must live in the same Vercel team as Preview Reel. This is a v1 constraint of team-level webhooks. The real answer is a Vercel Integration, which receives webhooks per install and provides an onboarding flow.

**PR resolution**

- **R-1.8** Prefer `payload.deployment.meta.githubPrId` when present — it's the PR number directly, so resolution is one exact `GET /repos/{owner}/{repo}/pulls/{prNumber}` call, not a search. Fall back to querying GitHub for the open PR whose head branch matches `githubCommitRef` only when `githubPrId` is absent from `meta` (e.g. a push to a branch with no PR open yet at deploy time). Either path is one GitHub call returning number, title, and body — everything the tag check and scoping need. Do not rely on any other git metadata in the payload for title or body; `meta` is sparse and undocumented beyond the git fields.
- **R-1.9** No open PR resolvable (`githubPrId` absent and no matching branch) → exit silently.
- **R-1.10** Consequence: GitHub credentials are required on every preview deployment in an allowlisted repo, including untagged ones. The "free" untagged path costs one API call, not zero. Acceptable, but state it rather than claiming zero cost.

### 7.2 Tag check (deterministic)

- **R-2.1** Match the PR title against `^\s*\[(feat|feature)\]` — case-insensitive, leading whitespace tolerated.
- **R-2.2** No match → exit silently. **No model call, no comment, no cost.** This is the common path and it must be free.
- **R-2.3** The tag is opt-in by design. The author declares "this is worth a demo"; the tool does not guess. This removes the entire false-positive problem rather than mitigating it.
- **R-2.4** Tag set is hardcoded for v1. Per-repo configuration is a follow-up (see §11).

> **Why this over a changelog diff:** the tag is deterministic, costs nothing to evaluate, and puts the decision with the person who knows the answer. Changelog entries also frequently land in separate PRs from the feature (WebReel's own repo does this with changesets), so a changelog trigger would miss the PR that actually contains the code. The tradeoff is that the tool only fires when someone remembers to tag, which is the right failure direction: a tool that stays quiet gets kept, a tool that comments on everything gets muted.

**Scoping the demo**

- **R-2.5** Input to the model: PR title (tag stripped), PR body, changed file paths, and the preview URL.
- **R-2.6** The model returns a demo spec:
  ```ts
  {
    title: string,              // human-readable, used in the comment and gallery
    featureSlug: string,        // kebab-case, derived from the title
    entryPoint: string | null,  // route the feature likely lives at
    intent: string,             // one sentence: what the demo should show
    reason: string              // shown in the UI, not the PR comment
  }
  ```
- **R-2.7** The model no longer decides *whether* to demo, only *what* to demo. One less inference, and the remaining one is better grounded: the PR body is a richer spec than a one-line changelog entry, and the diff says where to look.
- **R-2.8** Malformed output → one repair retry, then fail with a specific reason. Never guess.
- **R-2.9** **Identity is `(repo, prNumber)`.** One demo per PR, keyed by the PR, not the deployment and not the slug. PR numbers are stable; titles are editable and slugs derived from them are not. `featureSlug` is display and storage-path material only.
- **R-2.10** If a completed record already exists for `(repo, prNumber)`, do not re-record on a subsequent deployment. Re-recording is manual (R-8.4), or automatic in a later version once staleness detection exists.

### 7.3 Sandbox execution

- **R-3.1** Provision a Vercel Sandbox from a **snapshot** with Chrome, `agent-browser`, `webreel`, and ffmpeg pre-installed. Cold installs are ~30s of dead air and unacceptable for a live demo.
- **R-3.2** WebReel downloads its own Chrome and ffmpeg to `~/.webreel` on first run. Bake this into the snapshot; do not let it happen per-run.
- **R-3.3** Hard timeout of 5 minutes per run. Sandbox allows far more; the product shouldn't.
- **R-3.4** Sandbox is torn down on success or failure. No leaked VMs.
- **R-3.5** All logs from both stages stream to the run record for the failure view.
- **R-3.6** **Preview deployments are protected by default.** Every request to the preview URL must carry the target project's Protection Bypass for Automation secret. Without it the runner hits an auth wall, and the failure presents as "agent could not find the feature" rather than an auth error — so detect the auth wall explicitly and fail with the right reason.
- **R-3.7** `agent-browser` ships a documented skill for accessing protected Vercel deployments during exploration (it can set the `x-vercel-protection-bypass` header directly on its own requests). Use it rather than inventing an approach.
- **R-3.8** **`webreel` cannot set custom headers or cookies** — its config schema has no header/cookie field. The bypass secret and the demo session therefore cannot ride as headers into the *recorded* replay. Carry both as query parameters on the URL instead, using `webreel`'s `$VAR`/`${VAR}` env-substitution support in string config values: `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie=true` as query params for the bypass, and a one-time session token as a query param for auth (see R-9.3). The persisted config contains the literal `${VAR}` placeholder, never the resolved secret.

### 7.4 Exploration (agent-browser)

- **R-4.1** Input: preview URL (with the bypass secret already applied as an `agent-browser` request header, per R-3.7), the demo spec from R-2.6 (title, entry point, intent), the first 10,000 characters of the PR body as explicitly untrusted feature context, and changed file paths. The config it emits must express the entry URL with the `${VERCEL_PROTECTION_BYPASS}` / `${DEMO_LOGIN_TOKEN}` query-param placeholders from R-3.8, not the resolved values — the agent works against real credentials, but writes placeholders into the artifact it produces.
- **R-4.2** The agent navigates and inspects using the accessibility snapshot, and its **output is a WebReel config, not a video.**
- **R-4.3** Config must be ≤ 12 steps. Longer means the agent got lost.
- **R-4.4** Selectors must be resolvable and stable. Prefer roles and test ids over nth-child chains.
- **R-4.5** Step budget: hard cap on agent actions. Exceeding it fails the run rather than producing a 40-step wander.
- **R-4.6** The config is persisted **whether or not** recording succeeds. It's the reviewable artifact and the input to any retry.

### 7.5 Recording (webreel)

- **R-5.1** Replay the config deterministically. Output mp4.
- **R-5.2** Fresh browser context, no exploration state carried over.
- **R-5.3** Poster image: `webreel` writes a `.png` thumbnail alongside every recorded video by default (`thumbnail.time`, defaulting to frame 0 at `t=0`). Use the generated file directly — no separate ffmpeg extraction step.
- **R-5.4** Recording failure is distinct from exploration failure in the run record. Different causes, different fixes.

### 7.6 Storage

- **R-6.1** Vercel Blob. Key structure:
  ```
  demos/{owner}/{repo}/pr-{prNumber}/{deploymentId}/video.mp4
  demos/{owner}/{repo}/pr-{prNumber}/{deploymentId}/poster.png
  demos/{owner}/{repo}/pr-{prNumber}/{deploymentId}/config.json
  ```
- **R-6.2** Run metadata (status, timestamps, PR number, PR title, `featureSlug`, deployment URL, commit SHA, logs, model cost) stored alongside. Deployment ID and date are metadata on the record; the *identity* is `(repo, prNumber)`.
- **R-6.3** Videos are public-read via unguessable URL for v1. Documented as a v1 tradeoff, not an oversight.
- **R-6.4** **Run-status records are append-only, not overwritten in place.** Vercel Blob's minimum `cacheControlMaxAge` is 60s and an overwrite (`allowOverwrite: true`) can take up to 60s to propagate through the CDN — a status page polling a blob that's rewritten per stage transition will show a stale stage for up to a minute. Write each stage transition as a new object (`runs/{runId}/events/{seq}-{stage}.json`) and have the status endpoint report the highest `seq`, or read live stage directly from the Workflow run (`getRun(runId)`) and use Blob only for the terminal, durable record. Either is fine; overwriting a single mutable status blob and polling it through the CDN is not.

### 7.7 PR comment

- **R-7.1** Exactly one comment per PR, **updated in place**. Never a comment per state change.
- **R-7.2** Never write to the PR description. It's human-authored text and the tool will fight the author over it.
- **R-7.3** Three states:

  | State | Content |
  |---|---|
  | `in_progress` | Feature title, link to status page, rough ETA |
  | `done` | Poster image linked to the gallery page, feature title, link to the config |
  | `failed` | Which stage failed, one-line reason, link to the run log, re-run link |

- **R-7.4** Video cannot be attached via the GitHub API (drag-and-drop is a web-UI-only affordance). Post the poster image as a markdown link to the hosted page.
- **R-7.5** Comment is posted **after** detection succeeds, never before. No "checking for features…" noise.
- **R-7.6** Auth is a fine-grained PAT scoped to the target repo, with **Pull requests: read** and **Issues: write** (PR comments are issue comments under the hood). A GitHub App is the correct multi-repo answer and an explicit v1 punt, not a design preference.
- **R-7.7** Comment upsert is idempotent: find the existing bot comment by marker, update it, or create one if absent. Never search by content.

### 7.8 Web app (Next.js)

- **R-8.1** **Gallery** — all demos for a repo, newest first, poster grid. Filter-by-feature is cut for v1 (see §11) — not needed to prove the loop, and it implies a taxonomy of features this project has no reason to build yet.
- **R-8.2** **Status page** — per-run, live-updating, sourced per R-6.4 (Workflow run status or the latest event record, never a single overwritten blob). In progress shows the actual current stage (provisioning / exploring / recording / uploading), not a generic spinner.
- **R-8.3** **Player** — mp4 with poster, plus the WebReel config shown below it, collapsed.
- **R-8.4** **Manual re-trigger** — two modes: re-run the full pipeline (explore + record) against a given deployment, or re-run recording only from the last persisted config (skips exploration). The second mode is the hour-4 fallback from §12 and the on-stage recovery when the agent picks the wrong flow — it's the same code path either way, not a separate feature.

### 7.9 Configuration and connection

Nothing is committed to the target repo. No workflow file, no manifest, no config. All configuration lives in Preview Reel's environment.

**Repositories**

| Repo | Purpose |
|---|---|
| `preview-reel` | The product. Next.js app, Workflow, Sandbox runner. |
| `preview-reel-target` | A small Next.js app deployed to its own Vercel project in the same team. Has a login and two or three demoable features. Exists to be recorded and to have `[feat]` PRs opened against it on stage. Build it early and keep it boring. |

**Environment**

```bash
VERCEL_WEBHOOK_SECRET=       # shown once when the team webhook is created
PREVIEW_REEL_REPOS=          # comma-separated allowlist, e.g. me/preview-reel-target
GITHUB_TOKEN=                # fine-grained PAT: PRs read, Issues write
VERCEL_PROTECTION_BYPASS=    # per target project
DEMO_LOGIN_TOKEN=            # long-lived secret; target app trades it for a session at /api/demo-login
AI_GATEWAY_API_KEY=
BLOB_READ_WRITE_TOKEN=
VERCEL_OIDC_TOKEN=           # or team token, for Sandbox provisioning
APP_BASE_URL=                # public Preview Reel production alias for links
```

- **R-CFG.1** Validate all of the above at boot, not at point of use. A missing secret should fail the deploy, not the third stage of a run.

**Setup steps for a new target repo**

1. Deploy the target app to a Vercel project in the same team as Preview Reel.
2. Project settings → enable Protection Bypass for Automation → copy the secret into `VERCEL_PROTECTION_BYPASS`.
3. Add `owner/repo` to `PREVIEW_REEL_REPOS`.
4. Create a fine-grained PAT scoped to that repo; set `GITHUB_TOKEN`.
5. Target app exposes `/api/demo-login?token=...&next=...`, which validates the token, sets the session cookie, and redirects. Set that same token as `DEMO_LOGIN_TOKEN`. No credential pair, no scripted login — see R-3.8 and R-9.3.
6. Open a PR titled `[feat] …`.

- **R-CFG.2** The README must contain these steps verbatim. A reviewer cloning the repo needs to be able to point it at their own project.
- **R-CFG.3** Single-tenant by construction: one PAT, one bypass secret, one credential pair. Multi-repo with differing credentials requires a per-repo config store, which is out of scope. Say this rather than implying it generalizes.

---

## 8. States and edge cases

The grading criterion, so these are requirements rather than nice-to-haves.

| Situation | Behavior |
|---|---|
| PR title has no tag | Exit silently. No comment, no model call. The common path. |
| Deployment for a repo not on the allowlist | Exit before any GitHub call. Return 200. |
| Branch has no open PR (direct push to a preview branch) | Exit silently. |
| Webhook redelivered hours later | Idempotency key on deployment ID short-circuits. Return 200. |
| Webhook signature invalid or absent | 401, no processing, no run record. |
| Preview deployment auth-walled (missing or wrong bypass secret) | `failed` with reason "preview deployment is protected — check the bypass secret", not a generic agent failure. |
| Target app login fails inside the Sandbox | `failed` at the exploration stage with an auth reason, distinct from "feature not found". |
| Tag present but PR body is empty | Proceed. Fall back to title plus diff. Note the thin input in the run record, since it's the likeliest cause of a bad demo. |
| Tag added after the first deployment | Fires on the next deployment. Do not backfill past deployments. |
| Tag removed after a demo exists | Demo remains. Removing a tag is not a delete. |
| PR already demoed | Exit silently. Existing demo remains linked in the comment. |
| Tag present but diff is docs-only or config-only | Proceed anyway. The author asked. Trusting the opt-in is the whole point, and second-guessing it reintroduces the false-negative problem the tag was meant to remove. |
| Gallery with zero demos | Explain what the tool does and that a `[feat]` title triggers it, with the setup steps. Not an empty grid. |
| Agent can't find the feature | `failed`, reason "could not locate feature in the UI", config saved with whatever it explored, exploration transcript linked. |
| Agent produces a config, recording fails | `failed` at the recording stage, config still downloadable and re-runnable. |
| Sandbox fails to provision | `failed`, infra reason, automatic single retry first. |
| Run exceeds 5 min | Killed, `failed` with a timeout reason, partial logs retained. |
| PR is closed mid-run | Finish the run, update the comment anyway. Don't leave a stale "in progress". |
| New commit pushed mid-run | Let the current run finish. Do not cancel and restart; churn is worse than staleness here. |
| Preview deployment is protected | Bypass token applied. If missing, `failed` with a specific, actionable message. |
| Model returns malformed JSON | One retry with a repair prompt, then fail. Never guess. |
| Video still uploading when the page loads | Status page shows the uploading stage; player renders when the blob is available. No broken `<video>` element. |

## 9. Security

- **R-9.1** `DEMO_LOGIN_TOKEN` hardcoded as an environment secret for v1. **Explicitly punted, explicitly acknowledged.** The v2 answer is a scoped demo account with short-lived credentials via Vercel Connect.
- **R-9.2** Credentials are injected into the Sandbox at runtime as environment variables. The persisted `webreel` config contains only the literal `${VERCEL_PROTECTION_BYPASS}` / `${DEMO_LOGIN_TOKEN}` placeholder strings (R-3.8) — never a resolved secret — since configs are persisted and rendered in the UI.
- **R-9.3** Login is never a scripted step (no typed email/password) in the demo config or in the recorded video. The target app's `/api/demo-login` endpoint (see setup step 5) exchanges `DEMO_LOGIN_TOKEN` for a session cookie via a single redirect, reached through the same query-param substitution as the bypass secret. The redirect target is the feature's entry point, so the recording opens already authenticated.
- **R-9.4** Webhook signature verification is mandatory: HMAC-SHA1, raw body, constant-time comparison.
- **R-9.5** Sandbox is the isolation boundary for running against arbitrary preview deployments.
- **R-9.6** The protection bypass secret grants access to every preview deployment on the target project. Treat it as a production credential. It is sent to the target app only, substituted into the URL by `webreel`/`agent-browser` at request time from an environment variable — never logged, never persisted in a run record, and never present in the config file on disk (R-3.8, R-9.2).
- **R-9.7** The PAT is scoped to a single repo with two permissions. Do not use a classic token or a broad-scope PAT for convenience.
- **R-9.8** Nothing in `PREVIEW_REEL_REPOS` is trusted for anything except deciding whether to proceed. It is not a security boundary — the webhook signature is.
- **R-9.9** Luna uses standard OpenAI provider retention in this public-repo v1 because the team's only allowlisted Luna route cannot satisfy Gateway ZDR. Private-repo support requires ZDR-attested BYOK or another compliant route.

## 10. Cost and observability

- **R-10.1** All model calls route through **AI Gateway** with a **spend cap per key**. Agent loops are screenshot-heavy and can run away.
- **R-10.1a** `openai/gpt-5.6-luna` at medium reasoning effort is the default for both scoping and exploration. Keep the model choice centralized so a measured replacement changes both call sites.
- **R-10.2** Per-run cost recorded and displayed in the run detail view.

Per-repo daily run cap (originally R-10.3) is cut for v1 — see §11. It needs cross-run counter state this project has no store for yet; the AI Gateway spend cap is the backstop.

## 11. Explicit punts

Each with the reason, because "what did you cut and why" is a graded question.

| Punt | Why |
|---|---|
| Credential management UI | Not the interesting problem; hardcoding proves the pipeline without a day of OAuth work |
| TTS voiceover | Real, and the audio-driven-timing design is worked out (generate per-step narration, measure duration, set that step's pause to match), but it's a second pipeline and AI SDK 7 speech is beta |
| User-uploaded audio | Human narration doesn't align to step boundaries; needs transcription and segment alignment. A whole feature, not a toggle |
| Stale-demo detection | The strongest long-term wedge and the natural v2. Configs are persisted precisely so this is additive, not a rewrite |
| Configurable trigger tags | `[feat]` / `[feature]` hardcoded. Per-repo tag config is a small UI follow-up, but it needs a settings surface and a repo-config store that v1 doesn't have |
| Label-based triggering | GitHub labels are the other obvious signal and arguably better (no title pollution, editable after the fact). Title tags need no repo setup at all, which matters more for a demo |
| Generalized doc sources | Changelog, release notes, and doc-site diffs are all plausible signals. The trigger is deliberately behind one interface so another adapter is additive |
| Multi-demo per PR | One is enough to prove the loop |
| Auth on the gallery | Public repos, unguessable URLs, stated as a tradeoff |
| Gallery filter-by-feature | Needs a feature taxonomy this project has no reason to build for one demo repo |
| Per-repo daily run cap | Needs cross-run counter state; the AI Gateway spend cap is the actual backstop for v1 |

## 12. Build order

Riskiest thing first. If the recording path doesn't work, the project doesn't exist.

| # | Work | Time |
|---|---|---|
| 0 | Sandbox up, Chrome running, webreel records a hardcoded config, mp4 in Blob, plays in a page | 90 min |
| 0b | Target app deployed, protection bypass enabled, team webhook registered and verified against a live preview deploy | 30 min |
| 1 | agent-browser explores a URL and emits a valid config; wire config → webreel | 90 min |
| 2 | Webhook → Workflow → tag check → scoping → run record | 60 min |
| 3 | PR comment, three states, update-in-place | 45 min |
| 4 | Gallery, status page, player, empty and failure states | 75 min |
| 5 | Deploy, README, AI-journey notes, blurb, seeded demo data | 30 min |

Sums to 420 min against a 360-min budget. The 60 min of slack is deliberately negative — cut scope live rather than pad estimates: if step 1 (agent → config) is still fighting selectors past its budget, skip to the hour-4 fallback below rather than finishing it late. `sandbox-runner/` code is written into the VM via `writeFiles` at run start, not baked into the snapshot — only Chrome/ffmpeg/`agent-browser`/`webreel` binaries are snapshotted (step 0), so runner logic changes in steps 1–4 never require a re-snapshot. `scripts/build-snapshot.ts` ends with a smoke recording (2-step config → mp4) so a broken snapshot fails at build time, not mid-demo. Confirm the Vercel plan (Sandbox + team webhooks + snapshots are Pro-tier features) and set `maxDuration` ≥ 300s on the Workflow steps that run Sandbox operations, since R-3.3's 5-minute run budget exceeds the Hobby function limit.

**If behind at hour 4:** drop the agent stage, ship with committed configs and the record-only re-trigger mode (R-8.4). The loop still works end to end and the gap is a stated next step. Better than a broken agent on stage.

## 13. Demo-day requirements

- **R-13.1** Gallery must be populated on load. A reviewer with no repo should see the product working in one click.
- **R-13.2** One live trigger, with the Sandbox snapshot warm.
- **R-13.3** A deliberately broken run available to show, because the failure state is half the pitch. The auth-wall case (missing/wrong bypass secret, R-3.6) is the best one to stage deliberately: it's the failure mode with the most design behind it (R-3.6, R-9.6, §8) and demonstrates "names its stage and reason" directly rather than a generic timeout.
- **R-13.4** A pre-recorded fallback if the live run fails.
- **R-13.5** Push the live-trigger commit and open/update its `[feat]` PR *before* starting the problem-and-solution talk track, not during the demo. Build (~1–2 min) plus a run (~3 min) is 4–5 minutes of dead air the 20-minute demo slot can't absorb. By the time the walkthrough reaches the live run, the comment has already flipped to `done`; use the record-only re-trigger (R-8.4) for the on-stage "watch it run" moment instead of waiting on the full pipeline live.

## 14. Open questions

1. Does WebReel's auto-download of Chrome and ffmpeg behave correctly inside a Sandbox microVM, or does the snapshot need explicit binary paths via `CHROME_PATH` / `FFMPEG_PATH`? Worth 15 minutes at step 0 to try pointing `webreel` at the Chromium `agent-browser install` already places in the snapshot, rather than shipping two Chrome installs.
2. ~~Does the target app's login survive as injected session state...~~ Resolved by design, not by testing an assumption: no scripted login and no session-state injection into the browser context. `/api/demo-login` performs the login server-side and hands back a cookie via redirect, reached through the query-param substitution in R-3.8/R-9.3. Still worth confirming in step 0b that the redirect chain survives a fresh headless context with no prior cookies.
3. What's the realistic end-to-end wall-clock time? If it's over 4 minutes, the in-progress state needs more design than a stage label.
4. Is `agent-browser`'s accessibility snapshot rich enough to produce stable selectors, or does the config need a resolution pass before recording?

## 15. Success criteria

1. A PR titled `[feat] ...` produces a watchable video without human involvement.
2. An untagged PR produces silence, with no model call and no cost.
3. Every failure mode yields a specific, actionable message rather than "something went wrong".
4. Every decision in this document can be defended, including the punts.