# AGENTS.md

Preview Reel records a demo video of a new feature running on its Vercel preview deployment and posts it to the PR.

This is a take-home build with a ~6 hour budget. It is judged on judgment, taste, and defensibility — not completeness. A tight build that works end to end beats a broad one that half-works. Optimize for something demoable at every point in time.

Requirements: `docs/spec.md`. Decision log: `DECISIONS.md`.

---

## Stack — fixed, do not deviate

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict |
| Styling | Tailwind |
| Components | shadcn/ui |
| Orchestration | Vercel Workflow |
| Execution | Vercel Sandbox |
| Storage | Vercel Blob |
| Models | AI Gateway via AI SDK |
| Recording | `agent-browser` (explore) + `webreel` (record) |
| Package manager | npm |
| Github Alias | ghp -- evanjgabrielson@gmail.com |

Do not introduce a database, an ORM, an auth library, a state manager, or a component library other than shadcn. If you think one is needed, add a line to `DECISIONS.md` and ask.

New dependencies need a reason. Prefer the platform primitive over the package.

---

## How to work

**Vertical slices, riskiest first.** Get one path working end to end before deepening any layer. The order is in `docs/spec.md` §12. Do not build the gallery before the pipeline produces a video.

**Keep it running.** The app should be deployable and clickable after every commit. If a change leaves it broken, finish or revert it in the same commit.

**Iterate over test.** Testing is deliberately minimal:
- Unit test pure functions only: tag matcher, zod schemas, comment renderer, blob key builder.
- No E2E, no integration tests against Sandbox or the model, no coverage targets, no snapshot tests.
- Use `fixtures/` to develop the UI without executing the pipeline.
- `npm type-check` is the real safety net. Run it at the end of every turn.

**No speculative abstraction.** One implementation means no interface. No plugin systems, no adapters for sources that don't exist, no config for things nobody will configure. Write the second implementation before extracting the first.

**Small commits with real messages.** Commit history is reviewed as part of the submission. `wip` and `fix stuff` are not acceptable. One logical change per commit.

**No coding-agent co-author trailers.** Never add `Co-authored-by: Cursor`, Claude, Copilot, or any other coding agent/tool to a commit message or PR description. Commits are authored as the human contributor, full stop.

**Log decisions as you go.** See below. Reconstructing them afterwards produces worse answers and it shows.

---

## DECISIONS.md

Append a bullet whenever you make a call that a reviewer could reasonably question. Do it in the same commit as the change, not at the end of the session.

Format — one line, no essays:

```
- **[Area]** Chose X over Y because Z. Tradeoff: W.
```

Write an entry when you:
- pick between two viable approaches
- cut something from scope
- work around a limitation in Sandbox, `webreel`, `agent-browser`, or the AI SDK
- make an assumption about how something behaves without verifying it
- take AI-generated code you didn't fully review, or throw some away and write it yourself

Also log where AI assistance was wrong. "The model produced X, which failed because Y" is a more useful entry than a list of what got generated.

---

## Repository layout

```
preview-reel/
├── AGENTS.md
├── DECISIONS.md
├── README.md
├── .env.example
├── docs/
│   └── spec.md
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # gallery
│   ├── runs/[runId]/page.tsx             # status + player
│   └── api/
│       ├── webhooks/vercel/route.ts      # deployment.succeeded entrypoint
│       ├── runs/[runId]/route.ts         # status polling
│       └── runs/[runId]/rerun/route.ts   # manual re-trigger
├── workflows/
│   └── record-demo.ts                    # durable orchestration, one step per stage
├── lib/
│   ├── env.ts                            # validated at boot
│   ├── trigger/
│   │   ├── verify.ts                     # webhook signature
│   │   ├── tag.ts                        # [feat] matcher — pure, tested
│   │   └── github.ts                     # PR lookup, comment upsert
│   ├── scope/
│   │   ├── schema.ts                     # zod demo spec
│   │   └── scope-demo.ts                 # AI Gateway call
│   ├── sandbox/
│   │   ├── provision.ts                  # snapshot → sandbox
│   │   └── run.ts                        # execute runner, stream logs, teardown
│   ├── storage/
│   │   ├── keys.ts                       # blob key builder — pure, tested; also builds the idempotency-sentinel and run-event paths
│   │   └── runs.ts                       # run record read/write; owns the (repo, prNumber) in-progress/completed lookups and the workflow runId ↔ run record mapping
│   └── comment/
│       └── render.ts                     # 3 states — pure, tested
├── sandbox-runner/                       # executes inside the microVM
│   ├── index.ts
│   ├── explore.ts                        # agent-browser → webreel config
│   └── record.ts                         # webreel → mp4 + poster
├── components/
│   ├── ui/                               # shadcn, generated — don't hand-edit
│   ├── gallery-grid.tsx
│   ├── run-status.tsx
│   ├── demo-player.tsx
│   └── empty-state.tsx
├── fixtures/
│   └── sample-run/                       # config + mp4 + poster + metadata
└── scripts/
    └── build-snapshot.ts                 # bake Chrome, ffmpeg, agent-browser, webreel
```

Second repo, `preview-reel-target/`: a small Next.js app deployed to its own Vercel project. This is what gets recorded. It needs a login screen (cosmetic — it's what a real user would see, but it's never what the recording drives) plus a `/api/demo-login?token=...&next=...` route that trades a shared secret for a session cookie via redirect, two or three demoable features, and a PR opened with a `[feat]` title for the live demo. Build it early and keep it boring.

---

## UI

- shadcn components by default. Generate them, don't hand-roll equivalents, don't edit `components/ui/` after generation.
- Tailwind utilities only. No custom CSS files beyond globals.
- Empty, loading, and failure states ship with the view. A view without all three is not done.
- The in-progress state names the current stage (provisioning, exploring, recording, uploading). Never a bare spinner.
- Copy is plain and specific. No exclamation marks, no "Oops!", no apologies. Say what happened and what to do next.

---

## Pipeline rules that are easy to get wrong

- **`agent-browser` explores, `webreel` records.** Never record with `agent-browser`. The config it emits is the reviewable artifact; persist it even when recording fails.
- **`webreel` configs have no header or cookie field.** The bypass secret and the login token can't ride as headers into the recorded replay — only as `${VAR}`-substituted query params on the URL. `agent-browser` *can* set headers during exploration; the config it writes still has to use the query-param form so `webreel` can replay it.
- **Silence on untagged PRs.** No comment, no model call, no run record. Never add an acknowledgment comment.
- **One PR comment, updated in place.** Never a second comment, never the PR description.
- **Never block the PR.** No status checks, no failing exit codes.
- **Identity is `(repo, prNumber)`.** Titles get edited; slugs derived from them are unstable.
- **Credentials never enter a config as resolved values.** Configs are persisted and rendered in the UI — they hold `${VAR}` placeholders, substituted from environment variables at replay time. No typed-in login step, ever.
- **Every failure names its stage and reason.** `{ stage, reason, logsUrl }`. Never "something went wrong".
- **Tear down the Sandbox in a `finally`.**
- **Workflow steps must be idempotent.** Webhooks retry, and a mid-run commit push must not start a second concurrent run for the same PR.
- **Run status is never read from an overwritten Blob object.** Blob's cache/propagation floor is 60s; a status page polling a mutable blob will show a stale stage. Read from the Workflow run or from append-only per-stage records.
- **All model calls through AI Gateway** under a spend cap. Never import a provider SDK directly.
- **Validate model output with zod.** One repair retry, then fail. Never coerce or default.

---

## Out of scope

Database. Auth or accounts. Multi-tenancy. TTS or uploaded audio. Stale-demo detection. More than one demo per PR. Analytics. Dark mode toggle. Anything in `docs/spec.md` §11.

If a task seems to need one of these, that's a signal the task is wrong. Log it and ask.