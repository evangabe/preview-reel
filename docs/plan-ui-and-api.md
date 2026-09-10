# Plan: gallery, status page, player, re-run

A brief for a coding agent. Scope: build-order step 4 from `docs/spec.md` §12
plus the storage and API additions it needs — `app/page.tsx`,
`app/runs/[runId]/page.tsx`, `app/api/runs/[runId]/route.ts`,
`app/api/runs/[runId]/rerun/route.ts`, `components/*`, and additions to
`lib/storage/runs.ts`. Nothing here touches the webhook handler, the Workflow's
stage order, the sandbox runner, or the scoping prompt, except where a field
has to be surfaced so the UI can show it.

Read `AGENTS.md`, `DECISIONS.md`, `docs/spec.md` §7.6–§7.8, §8, §10, §13, and
`wireframes/README.md` first. Look at the four PNGs in `wireframes/` — they are
layout and hierarchy references only; spacing, copy, and components are
shadcn's. Append to `DECISIONS.md` in the same commit as every call you make.
Run `npm run type-check && npm test && npm run lint` before every commit.

---

## 1. The question this work answers

Can a reviewer with no repo open `preview-reel.vercel.app`, see the product
working, click through to a run that is *currently recording* and watch the
stage advance without a page reload, watch the finished video with the config
it was recorded from, read a failure that names its stage and reason, and
re-run recording from the persisted config with one click?

The pipeline already produces videos and updates the PR comment. This work is
the surface the comment links to. Every link in `lib/comment/render.ts`
(`statusUrl`, `configUrl`) currently lands on a placeholder page.

---

## 2. What is already verified — do not re-verify

Checked against the codebase at commit `6a54a79` on 2026-09-09.

| Fact | Evidence |
|---|---|
| `GET /api/runs/[runId]` returns `{ runId, record: RunRecord \| null, status: RunStatusView }` with `Cache-Control: no-store`, 404 when no events and no Workflow run. | `app/api/runs/[runId]/route.ts` |
| `RunStatusView` is `in_progress { stage, since }` \| `done { completedAt }` \| `failed { failure: { stage, reason, detail, logsUrl }, at }`. Derived from append-only events (`runs/{runId}/events/{seq}-{stage}.json`) with the Workflow status as tie-breaker — never from an overwritten blob. | `lib/storage/status.ts`, `lib/storage/runs.ts::EVENT_SEQ` |
| Stages, in order: `scope → comment → provision → explore → record → upload`. `record-only` runs skip `explore` (they mark `record` where `explore` would be). Terminal events are `upload:completed` or `failed` at seq 100. | `workflows/record-demo.ts::runPipeline`, `EVENT_SEQ` |
| `RunRecord` holds everything needed to rebuild a `RecordDemoInput`: `identity { owner, repo, prNumber, deploymentId }`, `previewUrl`, `commitSha`, `pr { title, body, headRef, htmlUrl }`, `demo: DemoSpec \| null`, `mode`, `thinInput`, `startedAt`. `demo` is `null` only when scoping failed. | `lib/storage/runs.ts::RunRecord`, `workflows/record-demo.ts::openRun` |
| Completed artifacts land at `demos/{owner}/{repo}/pr-{n}/{deploymentId}/{config.json,video.mp4,poster.png,metadata.json}`, public, immutable (`putOnce`, `allowOverwrite: false`). `metadata.json` is written last, so its presence means the video and poster are readable — this is the "video still uploading" guard from §8. | `lib/storage/runs.ts::persistCompletedArtifacts` |
| `metadata.json` currently contains `repo, prNumber, prTitle, deploymentId, deploymentUrl, featureSlug, status, timings, generatedAt, artifacts { configUrl, videoUrl, posterUrl }`. It does **not** contain `runId`, `commitSha`, `logsUrl`, or model cost. | `workflows/record-demo.ts` lines 368–383 |
| `config.json` is persisted **before** recording starts (`onConfig` callback → `persistConfig` → `markStage("record")`), so a run that fails at `record` still has a downloadable config at the demo prefix (R-4.6). | `runPipeline` |
| Logs (`runs/{runId}/logs.jsonl`, credential-redacted NDJSON) and the exploration transcript (`runs/{runId}/explore-transcript.jsonl`) are persisted per run. `readRunLogsUrl(runId)` exists; there is no transcript equivalent. The transcript URL is only recoverable from an `artifact` line inside the logs. | `lib/storage/runs.ts`, `runPipeline` transcript callback |
| `modelCostUsd` is computed inside the sandbox (`explore-summary.json`) but `SandboxRunResult` does not carry it out and nothing persists it. Scoping cost is not measured at all. | `sandbox-runner/explore.ts` line 610–630, `lib/sandbox/run.ts::SandboxRunResult` |
| Live Luna responses expose inference cost immediately as the decimal string `providerMetadata.gateway.cost` and the real `gen_…` ID as `providerMetadata.gateway.generationId`; AI SDK's `result.response.id` is an `aitxt-…` client ID. `getGenerationInfo()` failed through the installed SDK even with the real ID after 4.25 s of retries. | Checkpoint-1 smoke probe, 2026-09-09 |
| `hasCompletedDemo(identity)` and `listRunIdsForPr(identity)` are per-PR. There is no "list all completed demos" function. `listAll(prefix)` paginates `@vercel/blob` `list()` at 1 000 per page and sorts by pathname. | `lib/storage/runs.ts` |
| The dev harness (`app/api/dev/trigger-run/route.ts`, `scripts/trigger-run.ts`) already starts `record-only` runs with `configSource: { kind: "inline" }`; `{ kind: "blob", url }` is implemented in `loadConfig()` and unused. | `workflows/record-demo.ts::loadConfig` |
| `postInProgressComment` and `finalizeComment` upsert by marker, so a re-run started with the same `identity` updates the existing PR comment in place. Nothing to add for R-7.1. | `workflows/record-demo.ts` |
| shadcn is initialised (`components.json`, style `base-nova`, `lucide` icons, `@base-ui/react`). Only `components/ui/button.tsx` is generated. Tailwind v4, Next 16.3, React 19.2. | `components.json`, `package.json` |
| Real data exists in the connected Blob store: PR #1 (`fixtures/sample-run` is a copy) and PR #2 (10-step command-palette demo, run `6a54a79`-era). Local `next dev` reads the same store, so the gallery has content without seeding. | DECISIONS `[Validation]` |
| A real run is ~80 s end to end (explore-and-record) and ~30 s record-only. | DECISIONS `[Validation]` |

---

## 3. Unhandled spec requirements this work closes

Everything below is currently a placeholder or absent. Listed so the agent can
check them off; the requirement IDs are `docs/spec.md`'s.

| Req | Gap |
|---|---|
| R-8.1 | Gallery is a static scaffold. No storage function lists demos across PRs. |
| §8 "Gallery with zero demos" | No empty state. Must explain the tool and show the setup steps, not an empty grid. |
| R-8.2 | Status page is a static scaffold. Not wired to `/api/runs/[runId]`, no live update, no stage list. |
| R-8.3 | No player. No config viewer. `configUrl` in the PR comment points at a raw Blob JSON. |
| R-8.4 | Rerun route returns 501. Neither mode is reachable outside the dev harness. |
| R-6.2 | `metadata.json` lacks `runId`, `commitSha`, `logsUrl`, model cost. The gallery cannot link a card to its run. |
| R-10.2 | Per-run model cost is neither recorded nor displayed. |
| R-3.5 / §8 | Logs are persisted but never rendered. §8 says the transcript is *linked* when the agent cannot find the feature; the transcript URL is not on the record or status response. |
| §8 "Video still uploading" | No player yet, so nothing guards it — the guard must exist when the player lands. |
| R-13.1 / R-13.3 | Gallery must be populated on load and a deliberately broken run must be reachable from the UI. Both need the gallery and status page to exist. |
| AGENTS.md → UI | Empty, loading, and failure states ship with each view. In-progress names the stage. |

Not in this work but observed while auditing; carry forward to step 5:
`README.md` still says the pipeline "is not built yet" and "a test runner isn't
wired up yet" — both stale. The `app/api/dev/trigger-run` route and
`scripts/trigger-run.ts` become deletable once the rerun route exists (see §5,
Slice 5).

---

## 4. Decisions fixed for this work

Do not relitigate mid-loop. If one proves wrong, log it in `DECISIONS.md` and stop.

1. **Server components read Blob directly; the only JSON API the UI calls is
   `GET /api/runs/[runId]` for polling.** No `/api/demos` endpoint. The
   gallery is a server component that calls `listCompletedDemos()`; the status
   page server-renders the first state and a client component polls the
   existing route only while `state === "in_progress"`. One implementation,
   no data-fetching library, no state manager.

2. **Re-run artifacts get their own key segment.** `putOnce` is immutable by
   design, so a re-run against the same `deploymentId` would `head()` the
   existing `config.json`/`video.mp4` and silently return the *old* artifacts
   as if it had just written them. Fix by nesting artifacts under the run:
   `demos/{owner}/{repo}/pr-{n}/{deploymentId}/{runId}/{artifact}`.
   `demoPrefix()` takes `runId`; `prDemosPrefix()` is unchanged, so
   `hasCompletedDemo` and gallery listing still work by prefix. The spec's
   R-6.1 key shape gains one segment; log it. Do not switch to
   `allowOverwrite: true` — a rewritten poster behind a 60 s CDN cache is the
   exact staleness R-6.4 forbids, and the PR comment would keep pointing at
   whichever bytes the CDN had.

3. **One demo per PR in the gallery: newest `metadata.json` wins.** A PR with
   a re-run has two metadata objects; group by `(repo, prNumber)` and keep
   the latest `generatedAt`. Older ones stay reachable via their run page.

4. **`metadata.json` gets a zod schema shared by writer and reader.**
   `demoMetadataSchema` in `lib/storage/metadata.ts`. Add `runId`,
   `commitSha`, `logsUrl`, `modelCostUsd: number | null`. Reader uses
   `safeParse` and *skips* objects that fail with a `console.warn` — one
   corrupt object must not blank the gallery. Update
   `fixtures/sample-run/metadata.json` to the new shape (it currently lacks
   `artifacts` and `timings`).

5. **Model cost is explore cost plus scope cost, or `null`.** Surface
   `modelCostUsd` from `explore-summary.json` through `SandboxRunResult`.
   Read `providerMetadata.gateway.cost` on every generation, parse its decimal
   string, and sum only reported values. This is the model inference cost; per
   Vercel's docs it excludes add-on charges such as reporting-tag writes.
   Display "Model cost: $0.0412" or "Model cost: not reported". Never estimate
   from a price table.

6. **The rerun route is public and unauthenticated, like everything else
   (§11 "Auth on the gallery").** It re-checks the in-progress guard so it
   cannot start a concurrent run for a PR, indexes the new run so the
   webhook's guard sees it, and skips the completed-demo and deployment
   sentinel checks *on purpose* — those exist to stop automatic re-recording
   (R-2.10); this is the manual path. The AI Gateway spend cap is the backstop
   for a full re-run. Log this explicitly; it is a defensible v1 call, not an
   oversight.

7. **Search is client-side substring over already-rendered cards.** The
   wireframe has a search box; the spec cuts *filter-by-feature* (a taxonomy).
   A `<Input>` that filters the server-rendered list by title/repo/PR number
   is neither a taxonomy nor an API. If it costs more than 20 lines, drop it.

8. **The header links to the target's GitHub repo, not a Vercel project.**
   The wireframe's "vercel project" button has no source of truth in the
   environment (no team slug, no project URL, and the spec's env list is
   fixed). Header: "Preview Reel" wordmark → `/`, plus a link to
   `https://github.com/{first entry of PREVIEW_REEL_REPOS}`. Per-run
   "Open preview deployment" and "Open PR" links go on the run page where
   they have real URLs. The settings icon and `04-settings.png` are out of
   scope per `wireframes/README.md`; omit the icon rather than ship a dead
   one.

9. **Five user-facing phases, mapped from six stages.** `scope` and
   `comment` collapse into "Scoping". Displayed list: Scoping → Provisioning
   → Exploring → Recording → Uploading. `record-only` runs omit Exploring. A
   phase is `complete` if a later stage has started or the run is done,
   `active` if it is the current stage, `failed` if `failure.stage` maps to
   it, else `pending`. Pure function, tested.

10. **Polling interval 3 s, stop on terminal state, no exponential backoff.**
    Runs are ~80 s. A 3 s poll reads two or three small immutable blobs plus
    one Workflow status call per tick; fine at demo scale.

11. **shadcn components: `card`, `badge`, `skeleton`, `collapsible`, `input`,
    `alert`, `separator`.** Generate with `npx shadcn@latest add …`; do not
    hand-edit `components/ui/`. `button` exists. Nothing else unless a view
    cannot be built without it.

12. **No fixture switch in production code.** Local `next dev` reads the
    real store, which already holds PR #1 and PR #2. `fixtures/sample-run`
    feeds unit tests (metadata schema, grouping, phase list), not the pages.

---

## 5. Contracts

### 5.1 `lib/storage/keys.ts` — change, tested

```ts
export interface DemoIdentity extends PrIdentity { deploymentId: string }
export interface DemoArtifactIdentity extends DemoIdentity { runId: string }
demoPrefix(identity)            // demos/{owner}/{repo}/pr-{n}/{deploymentId}/{runId}
```

Keep the two identities separate: `RecordDemoInput` cannot know its Workflow
run ID before `start()` returns. Artifact functions take
`DemoArtifactIdentity`; trigger/workflow input keeps taking `DemoIdentity`.
`runId` goes through `component()`. Existing tests updated; add one asserting
the new segment. `prDemosPrefix` unchanged.

### 5.2 `lib/storage/metadata.ts` — new, zod, tested

```ts
export const demoMetadataSchema = z.object({
  runId: z.string().min(1),
  repo: z.string().min(1),                 // "owner/repo"
  prNumber: z.number().int().positive(),
  prTitle: z.string(),                     // tag-stripped display title
  demoTitle: z.string(),                   // DemoSpec.title
  featureSlug: z.string(),
  deploymentId: z.string().min(1),
  deploymentUrl: z.string().url(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  prUrl: z.string().url(),
  status: z.literal("completed"),
  mode: z.enum(["explore-and-record", "record-only"]),
  timings: z.object({ provisionMs, exploreMs: nullable, recordMs, totalMs }),
  modelCostUsd: z.number().nonnegative().nullable(),
  logsUrl: z.string().url().nullable(),
  generatedAt: z.string().datetime(),
  artifacts: z.object({ configUrl, videoUrl, posterUrl }),  // all .url()
});
export type DemoMetadata = z.infer<typeof demoMetadataSchema>;

export function groupByRecency(
  demos: DemoMetadata[], now: Date,
): Array<{ label: "Today" | "Past week" | "Earlier"; demos: DemoMetadata[] }>;
// Buckets by generatedAt; drops empty buckets; input already sorted desc.

export function newestPerPr(demos: DemoMetadata[]): DemoMetadata[];
// Dedupe on `${repo}#${prNumber}`, keep max generatedAt, return sorted desc.
```

Tests: fixture `metadata.json` parses; an object missing `artifacts` fails;
`groupByRecency` with three timestamps at now−1h, now−3d, now−30d yields three
groups in order; `newestPerPr` keeps the later of two same-PR entries.

### 5.3 `lib/storage/runs.ts` — additions

```ts
persistCompletedArtifacts(identity, { video, poster, config, metadata: DemoMetadata-without-artifacts })
// metadata param becomes typed; the function fills `artifacts` and validates
// the assembled object with demoMetadataSchema before writing. Throw on
// failure — a completed run with unreadable metadata is a bug, not a state.

export async function listCompletedDemos(): Promise<DemoMetadata[]>
// listAll("demos/") → filter pathname.endsWith("/metadata.json") → readJson
// each → safeParse, warn-and-skip invalid → newestPerPr → sorted desc.

export async function readDemoForRun(record: RunRecord): Promise<DemoMetadata | null>
// head(demoArtifactKeys(record.identity).metadata) → parse; null on 404.

export async function readConfigUrl(identity: DemoArtifactIdentity): Promise<string | null>
// head(config.json) → url; null on 404. Exists on record-stage failures.

export async function readExploreTranscriptUrl(runId: string): Promise<string | null>
// mirrors readRunLogsUrl.
```

### 5.4 `lib/storage/phases.ts` — pure, tested

```ts
export type Phase = "scoping" | "provisioning" | "exploring" | "recording" | "uploading";
export type PhaseState = "pending" | "active" | "complete" | "failed";

export function phaseList(
  mode: RunMode,
  status: RunStatusView,
): Array<{ phase: Phase; state: PhaseState }>;
```

Stage → phase: `scope`, `comment` → `scoping`; `provision` → `provisioning`;
`explore` → `exploring`; `record` → `recording`; `upload` → `uploading`.
Tests: in-progress at `record` for `explore-and-record` gives
`complete, complete, complete, active, pending`; `record-only` has four
entries; `failed` at `explore` marks exploring `failed` and later phases
`pending`; `done` marks all `complete`.

### 5.5 `lib/sandbox/run.ts` and `sandbox-runner` — one field

`SandboxRunResult.modelCostUsd: number | null`, read from
`explore-summary.json` after exploration; `null` in `record-only`. Do not touch
the explorer's loop.

### 5.6 `lib/scope/scope-demo.ts` — one field

`scopeDemoWithGateway` returns `{ demo, costUsd: number | null }`. If
`providerMetadata.gateway.cost` is a non-negative decimal string, parse it;
otherwise return `null`. The explorer uses the same helper across
`result.steps`. Do not compute from tokens. `ScopeResult.ok` gains
`scopeCostUsd`.

### 5.7 `workflows/record-demo.ts` — plumbing only

- `identity` passed into the workflow lacks `runId` (it is only known inside);
  construct one `DemoArtifactIdentity` inside each step that writes artifacts.
  `RunRecord.identity` stores the full shape.
- `persistCompletedArtifacts` receives the typed metadata: `runId`,
  `commitSha`, `prUrl: input.pr.htmlUrl`, `prTitle: displayTitle(...)`,
  `demoTitle: scope.demo.title`, `mode`, `modelCostUsd` (explore + scope, or
  `null` if both are null; if one is null, the other alone — document this in
  the schema comment), `logsUrl`.
- No stage-order changes. No new steps.

### 5.8 `app/api/runs/[runId]/route.ts` — extended response

```ts
{
  runId: string;
  record: RunRecord | null;
  status: RunStatusView;
  demo: DemoMetadata | null;      // only when status.state === "done" and metadata is readable
  configUrl: string | null;       // present on done, and on record/upload failures
  logsUrl: string | null;
  transcriptUrl: string | null;
}
```

Fetch `demo`, `configUrl`, `logsUrl`, `transcriptUrl` in the same
`Promise.all` as today; each is one `head()`. Keep `Cache-Control: no-store`.
Keep 404 semantics. This is the *only* response shape the client polls; the
server page calls the same underlying function (extract `loadRunView(runId)`
into `lib/storage/run-view.ts` and have both the route and the page call it —
one implementation).

### 5.9 `app/api/runs/[runId]/rerun/route.ts`

```
POST /api/runs/{runId}/rerun
body: { "mode": "explore-and-record" | "record-only" }
```

| Outcome | Status | Body |
|---|---|---|
| Run record missing | 404 | `{ error: "run not found" }` |
| Body fails zod | 400 | `{ error: "mode must be explore-and-record or record-only" }` |
| Another run for this PR is `pending`/`running` (same 15-min pointer check as the webhook) | 409 | `{ error: "run-in-progress", runId }` |
| `record-only` and no `config.json` at the source run's demo prefix | 409 | `{ error: "no-config", detail: "This run never produced a config. Re-run the full pipeline instead." }` |
| Started | 202 | `{ runId }` |

Input to `start(recordDemo, [input])` is rebuilt from the record: same
`identity` minus `runId` (the Workflow assigns the new one), same
`previewUrl`, `commitSha`, `pr`; `mode` from the body; `configSource:
{ kind: "blob", url: configUrl }` for `record-only`. Then `indexRunForPr`.
Log one JSON line like the webhook does. Never throw a 500 for a Workflow
start failure without logging the reason.

Once this route is the second caller, extract the webhook's in-progress block
into `lib/runs/in-progress.ts` and call it from both routes. That module alone
imports `workflow/api`; do not pull Workflow runtime initialization into
`lib/storage/runs.ts`, which standalone scripts import.

Note the `pr` snapshot is from the original run; a re-run after the PR title
was edited records the old title. Acceptable — identity is `(repo, prNumber)`
and the title is display material. Log it.

### 5.10 `app/page.tsx` — gallery (R-8.1, wireframe 01)

Server component, `export const dynamic = "force-dynamic"`.

- Header (`components/site-header.tsx`): wordmark → `/`; repo link per §4.8.
- `<h1>` "Your preview reels". Subtitle: "Demos recorded from `[feat]` PRs
  on their Vercel preview deployments."
- `components/gallery-table.tsx` (client, receives `DemoMetadata[]`): search
  `<Input>` above; groups from `groupByRecency`; each group is a heading plus
  a border-wrapped table without a header row. Each row has a compact poster,
  a linked `demoTitle`, a GitHub PR link with an icon, and a right-aligned
  `repo #prNumber · relative time`. Whole card is a `<Link href={/runs/${runId}}>`.
  When the search matches nothing: "No reels match “{query}”." inline, not a
  redirect to the empty state.
- Empty (`components/empty-state.tsx`): when `listCompletedDemos()` returns
  `[]`. Copy: what the tool does in two sentences, then the six setup steps
  from `README.md` verbatim as an ordered list, then "Open a PR titled
  `[feat] …` and the demo appears here." No exclamation marks.
- Loading: `app/loading.tsx` — header plus six `<Skeleton>` cards. Not a spinner.
- Failure: `app/error.tsx` (client) — `<Alert>` "Could not load demos from
  Blob storage." with the error message and a "Try again" `<Button>` calling
  `reset()`.

### 5.11 `app/runs/[runId]/page.tsx` — status and player (R-8.2, R-8.3, wireframes 02–03)

Server component; `notFound()` when `loadRunView` returns null; renders
`components/run-status.tsx` (client) with the initial view as a prop.

`run-status.tsx` polls `/api/runs/{runId}` every 3 s while
`status.state === "in_progress"`, replaces its state, and stops on
`done`/`failed`. Layout top to bottom:

1. `<h1>` = `demo?.demoTitle ?? record?.demo?.title ?? displayTitle(record?.pr.title) ?? "Starting run"`.
   The last fallback covers a Workflow run whose `openRun` step has not
   written the record yet.
2. Metadata row (`components/run-metadata.tsx`): `repo #pr` (→ `pr.htmlUrl`),
   short SHA, "Preview deployment" (→ `previewUrl`), mode as a `<Badge>`,
   started `relative time`, and when done: duration from `timings.totalMs`,
   model cost per §4.5. When `record.thinInput`: a muted line "PR body was
   empty; scoping used the title and diff only." (§8).
3. Phase list — **in progress**: full list from `phaseList()`, each row an
   icon (`CircleCheck` / `Loader` spinning / `Circle` / `CircleX`), phase
   label, state text. Below it a dashed `<Card>` with the active phase in
   sentence form: "Recording in progress", "Exploring the preview", etc.
   **Done**: `<Collapsible>` header "5/5 phases complete · {completedAt}"
   (4/4 for record-only), collapsed by default, expanding to the same list.
   **Failed**: list with the failed phase marked, then the failure card.
4. Player (`components/demo-player.tsx`) — only when `demo !== null`:
   `<video controls preload="metadata" poster={posterUrl} src={videoUrl}>` in
   an `aspect-video` card. If `status.state === "done"` but `demo === null`
   (metadata not yet readable), render the skeleton with "Finalizing upload"
   and keep polling; this is the §8 "video still uploading" guard. Never
   mount `<video>` without a `src`.
5. Config (`<Collapsible>`, collapsed, header "Recording config" with a
   "Download JSON" link to `configUrl`): fetch `configUrl` client-side on
   expand and render in `<pre className="font-mono text-xs">`. Shown whenever
   `configUrl !== null`, including failed runs (R-4.6). The config contains
   `${VAR}` placeholders only; if the string `x-vercel-protection-bypass=`
   is followed by anything other than `${VERCEL_PROTECTION_BYPASS}`, render
   an `<Alert>` instead of the JSON and log to console — belt against R-9.2.
6. Failure card (failed only): `<Alert variant="destructive">` titled
   "Failed during {phase label}", body `reason` in code style then `detail`
   in prose. Links: "Run log" (→ `logsUrl`, `target=_blank`), "Exploration
   transcript" when `transcriptUrl` is non-null. Then the re-run controls.
7. Re-run controls (`components/rerun-buttons.tsx`, client) — shown on
   `done` and `failed`: "Re-run recording" (record-only; disabled with tooltip
   text "No config was produced" when `configUrl === null`) and "Re-run full
   pipeline". On click: `POST …/rerun`, then `router.push(/runs/${newRunId})`.
   Show the 409 `run-in-progress` message inline with a link to that run.
   Disable both while the request is in flight.

Loading: `app/runs/[runId]/loading.tsx` — title skeleton, five phase-row
skeletons. Not found: `app/runs/[runId]/not-found.tsx` — "No run with this ID.
It may have been started on a different deployment of Preview Reel." with a
link to `/`. Failure: `app/runs/[runId]/error.tsx` mirroring the gallery's.

### 5.12 Copy rules (from `AGENTS.md`)

Plain and specific. No exclamation marks, no "Oops", no apologies. Every
failure names its stage and reason. In-progress always names the phase. The
stage labels are exactly: Scoping, Provisioning, Exploring, Recording,
Uploading.

---

## 6. The loop

### Slice 1 — storage and schema (40 min)

Keys with `runId`, `demoMetadataSchema`, `groupByRecency`, `newestPerPr`,
`phaseList`, `listCompletedDemos`, `readDemoForRun`, `readConfigUrl`,
`readExploreTranscriptUrl`. Workflow plumbing for `runId`, `modelCostUsd`,
typed metadata. Update fixture `metadata.json`. Tests for every pure function.

Existing PR #1/#2 metadata objects in Blob predate the schema and will
warn-and-skip. Do not migrate them by hand: the slice-4 verification runs a
real record-only re-run for PR #2, which writes a conforming object. PR #1 can
be re-run the same way or left out; the gallery must not depend on either.

Commit: `Nest demo artifacts under run and type their metadata`.
DECISIONS: §4.2, §4.3, §4.4, §4.5.

### Slice 2 — status API and page (60 min)

`loadRunView`, extended `GET /api/runs/[runId]`, `run-status.tsx` with
polling, phase list, metadata row, player, config collapsible, failure card.
Loading, not-found, error files. Generate shadcn components.

Verify locally with `npm run dev`: open `/runs/{PR #2 runId}` (find it via
`runs/by-pr/evangabe/preview-reel-target/pr-2/` in the store) — done state,
video plays, config expands and shows only `${…}` placeholders. Open a failed
run ID from the same prefix — stage named, log link works. Open a fabricated
ID — 404 page.

Commit: `Render live run status, player, and config`.

### Slice 3 — gallery (35 min)

`app/page.tsx`, `site-header.tsx`, `gallery-table.tsx`, `empty-state.tsx`,
`app/loading.tsx`, `app/error.tsx`. Verify with data present, then verify the
empty state by temporarily pointing `listCompletedDemos` at a prefix that does
not exist — and revert before committing.

Commit: `Show completed demos in a recency-grouped gallery`.
DECISIONS: §4.7, §4.8.

### Slice 4 — re-run (40 min)

Route per §5.9, `rerun-buttons.tsx`. Verify: from PR #2's done page click
"Re-run recording" → lands on a new run page → phases advance without reload
→ done within ~40 s → PR #2's *same* comment ID updates (compare against
`5608924861`'s successor in DECISIONS) → gallery still shows one PR #2 card,
now pointing at the new run. Click "Re-run recording" again immediately on the
first page while the second is running → inline 409 with a link.

Then the deliberately broken run for R-13.3: start a `record-only` re-run
after temporarily setting a wrong `VERCEL_PROTECTION_BYPASS` locally, confirm
the failure card reads `record / element-not-found` with redacted detail
(per DECISIONS `[Recording]`), and restore the secret. Note the run ID in
`DECISIONS.md` so it can be shown on demo day.

Commit: `Re-run a demo from its persisted config or from scratch`.
DECISIONS: §4.6, the PR-title-snapshot note from §5.9.

### Slice 5 — close out (15 min)

Delete `app/api/dev/trigger-run/route.ts` and `scripts/trigger-run.ts`; the
rerun route and the webhook cover every path they exercised. Keep
`scripts/replay-webhook.ts` (signature verification has no other harness).
Fix the two stale `README.md` paragraphs noted in §3 and add a "Using the app"
section: gallery, run page, re-run modes. Run `npm run build`.

Commit: `Remove the dev trigger harness and refresh the README`.

---

## 7. Assumptions register

Log the outcome of each in `DECISIONS.md` when it is tested.

| # | Assumption | If false |
|---|---|---|
| A1 | `head()` on a public Blob key returns within ~100 ms; four in parallel per poll tick is fine. | Fold `configUrl`/`logsUrl`/`transcriptUrl` into the run record at write time instead. |
| A2 | A `<video>` with a public Blob `src` streams with range requests in Chrome and Safari without a proxy route. | Add `app/api/runs/[runId]/video/route.ts` that streams from Blob with `Range` passthrough. Log why. |
| A3 | `listAll("demos/")` for two PRs is one page. | It is, for years, at this scale; if the store ever crosses 1 000 objects, add a per-repo index later. |
| A4 | A `record-only` re-run against PR #2's current preview URL still authenticates (the `DEMO_LOGIN_TOKEN` was rotated and older *immutable* deployments hold the old value — DECISIONS `[Security]`). | Re-run against a fresh deployment; the route uses the record's `previewUrl`, so pick a run whose deployment postdates the rotation. |

---

## 8. Files this work produces or changes

```
app/
  page.tsx                          rewrite
  loading.tsx                       new
  error.tsx                         new
  runs/[runId]/page.tsx             rewrite
  runs/[runId]/loading.tsx          new
  runs/[runId]/not-found.tsx        new
  runs/[runId]/error.tsx            new
  api/runs/[runId]/route.ts         extend response via loadRunView
  api/runs/[runId]/rerun/route.ts   implement
  api/dev/trigger-run/route.ts      delete (slice 5)
  api/webhooks/vercel/route.ts      share in-progress guard in slice 4
components/
  site-header.tsx  gallery-table.tsx  empty-state.tsx  run-status.tsx
  run-metadata.tsx  demo-player.tsx  rerun-buttons.tsx        new
  ui/{card,badge,skeleton,collapsible,input,alert,separator}.tsx  generated
lib/storage/
  keys.ts          runId segment
  metadata.ts      new — schema, groupByRecency, newestPerPr (+ tests)
  phases.ts        new — phaseList (+ tests)
  run-view.ts      new — loadRunView
  runs.ts          listCompletedDemos, readDemoForRun, readConfigUrl,
                   readExploreTranscriptUrl, typed metadata
lib/runs/in-progress.ts             new in slice 4 — shared Workflow guard
lib/sandbox/run.ts                  modelCostUsd on result
lib/scope/scope-demo.ts             scope cost
workflows/record-demo.ts            artifact identity, typed metadata, cost
fixtures/sample-run/metadata.json   new shape
scripts/trigger-run.ts              delete (slice 5)
README.md                           stale status text, "Using the app"
DECISIONS.md                        per slice
```

---

## 9. Brittleness checklist — things this work must not do

- Read run status from any overwritten blob. Status comes from events plus
  Workflow status, via `deriveRunStatus`, and nothing else.
- Mount `<video>` before `metadata.json` is readable.
- Render a config with a resolved credential. Placeholder check in §5.11.5.
- Show a bare spinner anywhere. Every loading state has shape or a phase name.
- Add a database, ORM, auth, state manager, data-fetching library, or a
  non-shadcn component library. `useEffect` + `fetch` is the polling layer.
- Hand-edit `components/ui/`.
- Let the rerun route start a second concurrent run for a PR.
- Let the rerun route bypass the *webhook's* guards silently — it bypasses the
  completed-demo and sentinel checks by design, and the decision log says so.
- Add a `fixture` mode, a `?demo=` query param, or any prod code path that
  reads from `fixtures/`.
- Write copy with an exclamation mark, "Oops", or an apology.
- Skip a state. Each of the two views ships empty (gallery) or not-found
  (run), loading, and error in the same commit as the view.

---

## 10. Done means

- `/` shows PR #2's card grouped under the right recency heading; searching
  "palette" narrows to it; clearing restores the grid. An empty store shows the
  setup steps.
- `/runs/{id}` for an in-progress run advances Scoping → Provisioning →
  Exploring → Recording → Uploading without a reload and flips to the player
  when done. For a failed run it names the phase and reason and links the log
  (and the transcript when exploration ran). For an unknown id it 404s with
  copy.
- The config collapsible on both done and record-failed runs shows JSON
  containing `${VERCEL_PROTECTION_BYPASS}` and `${DEMO_LOGIN_TOKEN}` literally.
- "Re-run recording" from PR #2's page produces a new run, a new video under a
  new `runId` prefix, updates the same PR comment, and the gallery still shows
  exactly one PR #2 card pointing at the newer run.
- Model cost is shown on completed runs where Gateway reported it and reads
  "not reported" otherwise.
- `npm run type-check && npm test && npm run lint && npm run build` pass. The
  dev harness is gone. `README.md` describes the app as it is.
- `DECISIONS.md` has entries for §4.2, §4.3, §4.5, §4.6, §4.7, §4.8, the
  R-13.3 broken run ID, and every assumption in §7 that was tested.

---

## 11. Not this work

The settings page (`04-settings.png`; spec §7.9 says config is environment
variables). Filter-by-feature, auth, multi-demo per PR, stale-demo detection,
and everything else in `docs/spec.md` §11. Any change to the explorer prompt,
step budget, or WebReel step schema. (The R-3.3 five-minute hard timeout was
checked during this audit and is already enforced: `DEADLINE_MS` in
`lib/sandbox/run.ts` and the Sandbox `timeout` in `lib/sandbox/provision.ts`.)
Step 5's AI-journey notes and blurb.
