# Preview Reel — Requirements

**Status:** v1 shipped. This is the as-built spec: what the system must do, in one table per area, with where each requirement lives in code. Setup is in [`setup.md`](setup.md); the reasoning behind each call is in [`../DECISIONS.md`](../DECISIONS.md).

## Problem

A feature lands in a PR and there is no video of it. Recording one costs a human 20–30 minutes, so it doesn't happen; reviewers approve code they've never seen running. Every preview deployment is already a running instance of the product with the feature in it. The recording could be free.

## Goal

When a preview deployment goes live for a PR whose title starts with `[feat]`, produce a short, clean demo video of that feature running on that deployment, and post it to the PR. Untagged PRs get nothing: no comment, no model call, no cost.

## Non-goals

Not a video editor, not a marketing-demo replacement, not a general screen recorder, not a test framework. A failed recording is a signal, never a build failure, and never blocks merge.

## Position

WebReel (Vercel Labs) renders browser demos from a JSON config but has no authoring, trigger, hosting, or CI loop. Loom-style tools need a human every time; Arcade-style tools produce tours, not video, and need manual recapture. Preview Reel is the authoring layer, the trigger, and the delivery loop around WebReel.

## How it works

```
GitHub PR ──▶ Vercel deployment.succeeded (team webhook)
                 │
                 ▼  /api/webhooks/vercel  — verify HMAC, filter, tag check, PR lookup, claim deployment
                 ▼  Workflow: recordDemo
                    scope      model reads title + body + changed paths → DemoSpec (zod)
                    comment    post the single PR comment, state in_progress
                    pipeline   one step, no retries: provision Sandbox → explore → record → upload
                                 explore   agent-browser drives the preview → webreel config
                                 record    webreel replays the config → mp4 + poster
                    finalize   write metadata, update the same comment: done | failed
                 ▼
              Next.js: gallery (/) · run page (/runs/[runId]) · rerun (POST /api/runs/[runId]/rerun)
```

## Requirements

### Trigger

| ID | Requirement | Where |
|---|---|---|
| R-1.1 | One team-level Vercel webhook at `/api/webhooks/vercel`; filtering happens in the handler | `app/api/webhooks/vercel/route.ts` |
| R-1.2 | Verify `x-vercel-signature`: HMAC-SHA1 over the raw body, constant-time compare, 401 on failure | `lib/trigger/verify.ts` |
| R-1.3 | Act only on `deployment.succeeded` with `target !== "production"` (previews arrive as `null`, never `"preview"`) | `lib/trigger/payload.ts` |
| R-1.4 | Respond 200 within 30 s; do no slow work inline | webhook route |
| R-1.5 | Idempotent on two axes: a deployment-ID sentinel stops redeliveries; an in-progress lookup on `(repo, prNumber)` stops a mid-run push from starting a second run | `lib/storage/runs.ts`, `lib/runs/in-progress.ts` |
| R-1.6 | Only repos in the `PREVIEW_REEL_REPOS` allowlist proceed; everything else exits before any GitHub call | `lib/env.ts`, webhook route |
| R-1.7 | Target projects live in the same Vercel team (team-webhook constraint; a Vercel Integration is the real answer) | — |
| R-1.8 | Resolve the PR via `meta.githubPrId` when present, else by head branch; one GitHub call returns number, title, body | `lib/trigger/github.ts` |
| R-1.9 | No resolvable open PR → exit silently | webhook route |

### Tag check and scoping

| ID | Requirement | Where |
|---|---|---|
| R-2.1 | Title matches `^\s*\[(feat|feature)\]`, case-insensitive | `lib/trigger/tag.ts` |
| R-2.2 | No match → exit silently. No model call, no comment, no run record | webhook route |
| R-2.3 | The tag is opt-in; the tool never guesses whether something deserves a demo | — |
| R-2.5 | Model input: tag-stripped title, body, changed paths, preview URL — all treated as untrusted context | `lib/scope/scope-demo.ts` |
| R-2.6 | Model output is a `DemoSpec` (`title`, `featureSlug`, `entryPoint`, `intent`, `reason`) validated with zod | `lib/scope/schema.ts` |
| R-2.7 | The model decides *what* to demo, never *whether* | — |
| R-2.8 | Malformed output → one repair retry, then `scope/invalid-output`. Never coerce, never default | `lib/scope/scope-demo.ts` |
| R-2.9 | Identity is `(repo, prNumber)`. Slugs and titles are display material | `lib/storage/keys.ts` |
| R-2.10 | A completed demo for the PR suppresses automatic re-recording; re-recording is manual (R-8.4) | webhook route |

### Sandbox and exploration

| ID | Requirement | Where |
|---|---|---|
| R-3.1 | Provision from an immutable snapshot with Chrome, `agent-browser`, `webreel`, ffmpeg baked in; runner code is written in at start, so runner changes need no re-snapshot | `scripts/build-snapshot.ts`, `lib/sandbox/provision.ts` |
| R-3.3 | Hard 5-minute budget per run | `lib/sandbox/run.ts` |
| R-3.4 | Sandbox torn down in a `finally`, success or failure | `lib/sandbox/run.ts` |
| R-3.5 | Both stages stream logs to an append-only run log, credentials redacted at the boundary | `lib/sandbox/run.ts`, `lib/logs/parse.ts` |
| R-3.6 | Detect the preview auth wall explicitly and fail as `preview-protected`, not as "feature not found" | `sandbox-runner/explore.ts`, `sandbox-runner/auth-preflight.ts` |
| R-3.8 | `webreel` has no header/cookie field, so bypass secret and login token ride as `${VAR}` query params on the entry URL, substituted at replay from env | `sandbox-runner/record.ts` |
| R-4.1 | Explorer gets the preview URL (bypass applied as a header), the `DemoSpec`, the first 10 k chars of the PR body as untrusted context, and changed paths | `sandbox-runner/explore.ts` |
| R-4.2 | The explorer's output is a WebReel config, never a video | `sandbox-runner/explore.ts` |
| R-4.3 | Config ≤ 12 steps; same-origin navigation; stable selectors only | `lib/scope/schema.ts` |
| R-4.5 | Hard action budget (25); exceeding it fails the run | `sandbox-runner/explore.ts` |
| R-4.6 | The config is persisted whether or not recording succeeds; it is the reviewable artifact and the input to a record-only re-run | `lib/sandbox/run.ts` |
| R-4.7 | A standard 404 at the model's `entryPoint` is treated as a stale scope: recover at `/` and use `/` in the replay URL | `sandbox-runner/explore.ts` |

### Recording

| ID | Requirement | Where |
|---|---|---|
| R-5.1 | Replay the config deterministically in a fresh browser context; output mp4 | `sandbox-runner/record.ts` |
| R-5.3 | Use `webreel`'s own thumbnail as the poster; no separate ffmpeg step | `sandbox-runner/record.ts` |
| R-5.4 | Recording failure is a distinct stage from exploration failure | `sandbox-runner/failure.ts` |
| R-5.5 | Before recording, follow the substituted entry URL's redirect chain (≤ 5 hops, cookie jar) and classify: 3xx to `vercel.com` → `preview-protected`; 401/403 from `/api/demo-login` → `login-failed`. A preflight error never fails the run on its own | `sandbox-runner/auth-preflight.ts` |

### Storage

| ID | Requirement | Where |
|---|---|---|
| R-6.1 | Vercel Blob, immutable keys: `demos/{owner}/{repo}/pr-{n}/{deploymentId}/{runId}/{config.json,video.mp4,poster.png,metadata.json}` | `lib/storage/keys.ts` |
| R-6.2 | `metadata.json` is strict zod: run, PR, deployment, commit, timings, artifact URLs, model `{ id, reasoningEffort }`, reported cost | `lib/storage/metadata.ts` |
| R-6.3 | Public-read via unguessable URL (stated v1 tradeoff) | — |
| R-6.4 | Run status is never read from an overwritten blob (60 s CDN floor). Each stage transition is a new object `runs/{runId}/events/{seq}-{stage}.json`; the Workflow run is the fallback | `lib/storage/phases.ts`, `lib/storage/status.ts` |
| R-6.5 | All writes are `allowOverwrite: false`; a retry that finds the object returns it instead of failing | `lib/storage/runs.ts` |

### PR comment

| ID | Requirement | Where |
|---|---|---|
| R-7.1 | Exactly one comment per PR, found by a hidden marker and updated in place | `lib/trigger/github.ts` |
| R-7.2 | Never touch the PR description | — |
| R-7.3 | Three states: `in_progress` (title, status link), `done` (poster linked to the player, config link), `failed` (stage, reason, logs, re-run link) | `lib/comment/render.ts` |
| R-7.5 | Comment is posted only after the tag check and scoping succeed | `workflows/record-demo.ts` |
| R-7.6 | Fine-grained PAT: Pull requests and Issues read/write on the one target repo | `docs/setup.md` |

### Web app

| ID | Requirement | Where |
|---|---|---|
| R-8.1 | Gallery: newest reel per PR, grouped Today / Past week / Earlier, client-side substring search, KPI cards for reel count and reported model spend | `app/page.tsx`, `components/gallery-table.tsx` |
| R-8.2 | Run page shows the actual current stage (scope → comment → provision → explore → record → upload), polled every 3 s from append-only events. Never a bare spinner | `components/run-status.tsx`, `app/api/runs/[runId]/route.ts` |
| R-8.3 | Player: mp4 with poster, model tag and cost, then the config as a step list with `${VAR}` placeholders highlighted, raw JSON, and run logs in collapsibles | `components/demo-player.tsx`, `components/config-steps.tsx` |
| R-8.4 | Manual re-run in two modes: `explore-and-record` or `record-only` from the persisted config. Same pipeline, skips the automatic-run guards, keeps the in-progress guard (409) | `app/api/runs/[runId]/rerun/route.ts`, `components/rerun-buttons.tsx` |
| R-8.5 | Every view ships with empty, loading, and failure states | `app/**/loading.tsx`, `error.tsx`, `not-found.tsx` |

### Configuration and security

| ID | Requirement | Where |
|---|---|---|
| R-CFG.1 | Nothing is committed to the target repo; all config is Preview Reel environment, validated at server boot | `lib/env.ts`, `instrumentation.ts` |
| R-CFG.3 | Single-tenant by construction: one PAT, one bypass secret, one login token | — |
| R-9.2 | Persisted configs hold only `${VERCEL_PROTECTION_BYPASS}` / `${DEMO_LOGIN_TOKEN}` placeholders; a resolved credential in a config fails validation | `lib/scope/schema.ts` |
| R-9.3 | Login is never a scripted step. The target's `/api/demo-login?token=…&next=…` trades the token for a session cookie via redirect | target app |
| R-9.6 | The bypass secret and login token are redacted from every persisted log, transcript, and failure detail | `lib/sandbox/run.ts`, `sandbox-runner/explore.ts` |
| R-10.1 | All model calls go through AI Gateway under a per-key spend cap; no provider SDK is imported | `lib/ai/model.ts` |
| R-10.1a | One model constant (`openai/gpt-5.6-luna`, medium reasoning) shared by scoping and exploration | `lib/ai/model.ts` |
| R-10.2 | Per-run cost is read from `providerMetadata.gateway.cost`, never estimated, and shown on the run page and gallery | `lib/scope/scope-demo.ts`, `sandbox-runner/explore.ts` |

## States and edge cases

| Situation | Behaviour |
|---|---|
| No tag | Silence. No comment, no model call. |
| Repo not allowlisted / not `deployment.succeeded` / production target | 200 with a logged skip reason, before any GitHub call. |
| Bad or missing signature | 401, nothing else. |
| Webhook redelivered | Deployment sentinel already claimed → 200, no second run. |
| New commit pushed mid-run | Skipped; the current run finishes. Churn is worse than staleness. |
| PR already demoed | Skipped; the existing comment stays. Re-run is manual. |
| Wrong or missing bypass secret | `explore/preview-protected` or `record/preview-protected`: "Preview deployment is protected — check the bypass secret." |
| Wrong login token | `login-failed`: "Target app rejected the demo login token — check DEMO_LOGIN_TOKEN." |
| Model returns malformed JSON | One repair retry, then `scope/invalid-output`. |
| Model's entry point 404s | Recover at `/`; replay from `/`. |
| Agent can't find the feature or blows the action budget | `explore/feature-not-found`, transcript persisted. |
| Config produced, recording fails | `record/*` with the config still downloadable and re-runnable. |
| Sandbox fails to provision | One automatic retry inside provisioning, then `provision/create-failed`. |
| Run exceeds 5 minutes | Killed, `timeout`, partial logs retained. |
| Gallery has zero reels | Explains the tool and the `[feat]` trigger, with a link to the allowlisted repo. |
| Video not yet uploaded when the page loads | Status shows the uploading stage; the player renders once metadata exists. |

## Explicit punts

| Punt | Why |
|---|---|
| Credential management UI / Vercel Connect | Hardcoded env secrets prove the pipeline; OAuth is a day of work and not the interesting part |
| TTS voiceover, uploaded audio | A second pipeline with its own timing problem |
| Stale-demo detection, demo per commit | The natural v2; configs are persisted so it's additive |
| Configurable or label-based triggers | Needs a per-repo settings store that v1 doesn't have |
| Multiple demos per PR | One proves the loop |
| Auth on the gallery, database | Public repo, unguessable URLs; Blob metadata is enough at this scale |
| Per-repo daily run cap | Needs cross-run counters; the Gateway spend cap is the backstop |
| Light mode | Fixed dark theme so preview screenshots don't depend on the reviewer's OS |

## Demo day

- Gallery populated on load; a reviewer with no repo sees the product in one click.
- One live trigger with the snapshot warm, pushed before the talk track so the comment has flipped by the time the walkthrough gets there.
- A deliberately failed run on hand (auth wall), because the failure state is half the pitch.
- Record-only re-run for the on-stage "watch it run" moment.

## Success criteria

1. A `[feat]` PR produces a watchable video with no human involvement.
2. An untagged PR produces silence, with no model call and no cost.
3. Every failure names its stage and reason with a logs link.
4. Every decision here and in `DECISIONS.md` can be defended, including the punts.
