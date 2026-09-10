# Preview Reel

Open a PR titled `[feat] …`. When its Vercel preview deployment goes green,
Preview Reel figures out what the feature is, drives it in a real browser,
records a short mp4, and posts the video to the PR. Untagged PRs get nothing:
no comment, no model call, no cost.

Live: [preview-reel.vercel.app](https://preview-reel.vercel.app) · Target app
it records: [`evangabe/preview-reel-target`](https://github.com/evangabe/preview-reel-target)

## Approaching this takehome assessment

Upfront I must say candidly that I used this project as an opportunity to build something I will actually use on my own Vercel Projects. For my presentation I want to frame this as an investor pitch -- not just as a useful idea Vercel could potentially build upon, but moreso as a pitch of my product sense, ability to develop something meaningful quickly and prioritization mindset.

## The problem

I'm often spending O(Hours) reading PR diffs and have needed a quick way to understand the reason this PR exists and whether it does what it intends to. A feature that "works" in a PR description is the author's claim that needs verification, and a 10-second video of it working on the actual preview deployment would be really useful evidence if not also marketing material for the product. The pieces to make that video automatically already exist on Vercel (deployment webhooks, Vercel Sandbox for a throwaway browser, Blob Store for the artifacts, Vercel AI Gateway for the model -- and soon Vercel Connect for credential management once I support that). The work here is wiring them into one durable pipeline that links the PR demo quickly and fails honestly.

## How it works

```
deployment.succeeded ─▶ pre-processing: verify webhook signature, match [feat], look up PR
                     ─▶ scope: model reads PR title + body → emits demo spec
                     ─▶ provision: Sandbox from a snapshot with Chrome + ffmpeg
                     ─▶ explore: agent-browser walks the preview, emits a WebReel config
                     ─▶ record: WebReel replays the config → emits mp4 + poster
                     ─▶ upload to Blob, upsert one PR comment, done
```

Each stage is a **Vercel Workflow** step. Every artifact (config, video, poster,
per-stage events) uploads to immutable Blob paths keyed on `(repo, prNumber, runId)`.
The reels list page is at `/` and the single reel page is at `/runs/[runId]`, both read from those Blob paths.

## Decisions I'd defend

The full log is [`DECISIONS.md`](DECISIONS.md) (~75 entries, written as they
happened and trimmed for submission). Here are the important ones:

- **Explore and record are separate.** `agent-browser` fumbles around and
  writes a `webreel` config, then `webreel` replays it cleanly. An agent's live
  session is unpublishable but a config is reviewable, re-runnable, and is the
  artifact I chose to persist even when recording fails.
- **The LLM scopes the demo, it never decides whether to record.** A
  `[feat]` tag on the PR title is a deterministic trigger. Punted building a classifier.
- **Credentials never touch a config.** Preview protection and login are
  handled by `${VAR}` placeholders substituted at replay time, as query
  params on the entry URL. Configs get rendered in the UI, so they can't
  hold secrets. There's no typed-in login step anywhere. There's lots of follow-up work to improve credential management.
- **Blob Store only, not a database.** Run records are append-only per-stage objects.
  Status is never read from an overwritten blob because Blob's cache floor
  is 60s and a status page polling a mutable object shows the wrong stage. A production-ready product would benefit from a simple Postgres DB for reel metadata, user settings, etc...
- **Every failure names its stage and reason.** `preview-protected`,
  `login-failed`, `element-not-found`, `invalid-config`, each with logs and transcript links. Auth-wall detection is a preflight that follows the redirect chain before recording starts, not a regex over `webreel` output.
- **Reel identity is `(repo, prNumber)`.** One comment per PR, updated in place.
  One run in progress per PR such that a mid-run push is skipped rather than
  starting a second concurrent run. Eventually might want a demo per commit with a kill-switch for the PR owner to avoid extra cost -- should show stale state as well based on whether or not we're at `HEAD`.
- **Punted:** self-serve credential management UI, TTS voiceover, stale-demo detection,
  multiple demos per PR, authentication, RLS-policied Postgres DB. Decided to deprioritize because these don't prove the service.

## Where AI helped, and where I drove

This was built in Cursor with coding agents doing most of the typing. The
split, honestly:

**Mine.** The problem choice, the requirement specs, prompt engineering, hard business logic and state machine, and the final critical review and hand-edits on every single commit diff. The stack (fixed up-front,
no deviations). The rules in [`AGENTS.md`](AGENTS.md), which is where most of
the judgment lives: no speculative abstraction, riskiest slice first, keep it
deployable after every commit, log decisions in the same commit as the
change. The hand-drawn [wireframes](wireframes/) and later Figma mock-ups and UI adjustments required to get the right **joyful** experience. Local dev server verification of workflows/UI before every commit.

**The agents.** Most of the code under those rules/requirements, clarifications and adjustments atop the specs under `/docs`, test and local script scaffolding.

**Where I was wrong in initial spec and agent self-adjusted**: assumed
`VERCEL_OIDC_TOKEN` was a runtime env var (it isn't; boot validation 500'd
every request). Planned a cost lookup via `getGenerationInfo()` that a live
probe disproved. Assumed a bad login token would redirect to `/login`; it
401s from `/api/demo-login`, which changed the auth gate. 

**Where the agent was wrong and I stepped in**: Wrote a
redaction regex that ate JSON escape sequences and broke config parsing, I fixed.
Extracted a shared guard before its second caller existed, which I reverted.

Each of these is a line in `DECISIONS.md` with what actually happened.

## Running it

```bash
npm install && npm run dev
npm run type-check   # the real safety net
npm run test         # pure functions only, by design
```

Full environment and Vercel setup (Pro team, webhook, bypass secret, PAT
scopes, snapshot) is in [`docs/setup.md`](docs/setup.md). Requirements are in
[`docs/spec.md`](docs/spec.md). `fixtures/sample-run/` is a real recording
for developing the UI without running the pipeline.

## Layout

```
app/            gallery, run page, webhook + status + rerun routes
workflows/      record-demo.ts — one durable step per stage
lib/            trigger, scope (model + zod), sandbox, storage, comment
sandbox-runner/ what runs inside the microVM: explore.ts, record.ts
scripts/        build-snapshot.ts, replay-webhook.ts
```
