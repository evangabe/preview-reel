# Plan: trigger, run state, orchestration, PR comment

A brief for a coding agent. Scope: P0.1–P0.4 from the post-sandbox-runner
triage — `lib/storage/runs.ts` (run state + idempotency), `lib/trigger/*`,
`app/api/webhooks/vercel/route.ts`, `workflows/record-demo.ts`,
`lib/comment/render.ts`, and the smallest `GET /api/runs/[runId]` that lets us
verify any of it. Nothing here touches the gallery, the status page UI, the
rerun route, or the AI scoping call.

Read `AGENTS.md`, `DECISIONS.md`, and `docs/plan-sandbox-runner.md` §2–§3 first.
Append to `DECISIONS.md` in the same commit as every call you make. Run
`npm run type-check && npm test` before every commit.

---

## 1. The question this work answers

Can a `deployment.succeeded` webhook, redelivered any number of times over 24
hours and racing against a second push to the same PR, produce **exactly one**
durable run per deployment and **at most one** concurrent run per PR — with
every stage transition readable live, every failure named, and one PR comment
that tracks the run without ever posting twice?

The sandbox runner already turns a config into a video. This work is the
plumbing that makes that happen without a human pressing a button, and makes
it safe to leave switched on.

---

## 2. What is already verified — do not re-verify

Checked live on 2026-09-09 against the target project and the installed SDKs.

| Fact | Evidence |
|---|---|
| Team webhook is registered, unscoped, pointed at `https://preview-reel.vercel.app/api/webhooks/vercel`. The stub answers 200. | DECISIONS `[Trigger]`, `[Access]` |
| Real PR deployment: `target: null`, `deployment.url` is a bare host (`preview-reel-target-k8fxqt9wc-….vercel.app`, **no scheme**). | Vercel API v13, `dpl_Eb2kwnpY8TzuCEwJBnt2eiHm7Am4` |
| `deployment.meta` keys present: `githubOrg`, `githubRepo`, `githubCommitOrg`, `githubCommitRepo`, `githubPrId`, `githubCommitRef`, `githubCommitSha`, `githubDeployment`, `branchAlias`, `githubCommitMessage`, `githubCommitAuthorLogin`, `githubRepoId`, `githubRepoVisibility`, … | same |
| **Every `meta` value is a string.** `githubPrId` is `"1"`, not `1`. `githubDeployment` is `"1"`. | same |
| `githubOrg`/`githubRepo` = the repo the Vercel project is connected to. `githubCommitOrg`/`githubCommitRepo` = where the commit came from (differs on fork PRs). | Vercel meta semantics; identical for PR #1 |
| Webhook envelope: `{ id, type, createdAt, region, payload: { team: { id }, user: { id }, deployment: { id, meta, url, name }, links, target, project: { id }, plan, regions } }`. Signature: `x-vercel-signature` = hex `HMAC-SHA1(secret, rawBody)`. | vercel.com/docs/webhooks/webhooks-api |
| Workflow SDK `4.8.6`: `start(fn, args)` from `workflow/api` returns `Run` with `runId`; **no idempotency-key option exists on `start`**. `getRun(runId)` throws `WorkflowRunNotFoundError` for unknown ids; `.status` is `pending \| running \| completed \| failed \| cancelled`. | `node_modules/@workflow/core/dist/runtime/*.d.ts` |
| Steps retry 3× by default on any thrown error; `fn.maxRetries = n` overrides; `FatalError` skips retries; `RetryableError({ retryAfter })` delays. `getWorkflowMetadata().workflowRunId` is available inside `"use workflow"`. | useworkflow.dev/docs/foundations/errors-and-retries |
| `withWorkflow()` already sets step `maxDuration` to the plan max; nothing to configure for the 5-minute sandbox step. | DECISIONS `[Workflow]` |
| `lib/storage/runs.ts::putOnce` is immutable and race-safe (head → put `allowOverwrite:false` → head). `runEventKey` zero-pads `seq` so `list()` order is stage order. | DECISIONS checkpoint 4 |
| `runInSandbox()` supports `record-only` and `explore-and-record`, calls `onConfig` before recording, streams logs, tears down in `finally`, and throws `RunnerFailure { stage, reason, detail }`. | `lib/sandbox/run.ts` |
| AI Gateway returns **403 until a card is on the team**. Every `explore-and-record` run currently fails as `explore/model-call-failed` within ~15 s. `record-only` is unaffected. | DECISIONS checkpoint 2 |
| PAT works for issue comments on the target: create 201, update 200. | DECISIONS step 0b |
| `@vercel/blob` `list({ prefix, limit, cursor })` returns `blobs[]` with `pathname`, `url`, `uploadedAt`. | `@vercel/blob/dist/index.d.ts` |

---

## 3. Decisions fixed for this work

Do not relitigate mid-loop. If one proves wrong, log it in `DECISIONS.md` and stop.

1. **The Workflow run ID is the run ID.** No separate UUID, no mapping table.
   `runs/{runId}/…` keys use the value returned by `start()`. Cost: the
   `(repo, prNumber)` index pointer can only be written *after* `start()`, so
   there is a sub-second window where a second deployment could slip past the
   in-progress check. Accepted and logged; the deployment-ID sentinel still
   guarantees no *duplicate* run for the same deployment.
2. **The tag check lives in the webhook handler, not the Workflow.** Spec §6
   draws it as Workflow step 1, but the handler already has to call GitHub once
   to resolve the PR (R-1.8), and the title arrives in that same response.
   Checking it there means an untagged PR produces **no Workflow run and no
   Blob object of any kind**, which is what "no run record" means. Tradeoff:
   the handler does one GitHub call per allowlisted preview deployment (R-1.10
   already accepts this).
3. **The deployment sentinel is claimed *last* in the handler, immediately
   before `start()`.** Filters and the GitHub call run first, so a transient
   GitHub failure never permanently burns a deployment. The claim is a
   conditional Blob write (`allowOverwrite: false`); the loser of a race sees
   `claimed: false` and returns 200 without starting anything. This is the
   only idempotency primitive — do not add a second one.
4. **Idempotency, three axes, three mechanisms.** Same deployment redelivered →
   sentinel (3). Second deployment while a run is in progress → PR index
   pointer + `getRun().status` liveness (§5.2). PR already demoed → any
   `demos/{owner}/{repo}/pr-{n}/*/metadata.json` exists (R-2.10). Don't
   combine them into one "run record" that has to be kept current.
5. **Live status is derived, never stored.** `deriveRunStatus(events,
   workflowStatus)` is a pure fold over the append-only event list plus the
   Workflow's own status. Nothing writes a "current status" object. If the
   Workflow is terminal but no terminal event exists, the run is reported as
   failed at the last started stage with reason `workflow-crashed`.
6. **Event sequence numbers are a fixed table, not a counter.** Each
   `(stage, status)` pair has one hard-coded `seq`, so a retried step re-puts
   the same key and `putOnce` returns the existing object. A counter would
   need a read-modify-write and would break on retry.
7. **Binary never crosses a step boundary.** Provision → explore → record →
   upload is *one* step (`runPipeline`). Step inputs and return values are
   serialized into the event log; they carry identities, URLs, and small
   JSON only. The Sandbox handle and the mp4 live and die inside that step.
8. **Expected failures are return values, not exceptions.** `runPipeline`
   returns `Outcome = { ok: true, … } | { ok: false, failure: RunFailure }`.
   `maxRetries = 0`. The single automatic provision retry from §8 of the spec
   happens *inside* `provisionSandbox()`, not via Workflow retries — because
   Workflow retries can't distinguish `provision/create-failed` (retry) from
   `explore/preview-protected` (never retry). Only bugs throw across the
   step boundary, and the Workflow body catches those into
   `reason: "unexpected"`.
9. **Comment delivery never fails the run.** Comment steps keep default
   retries (the upsert is idempotent). If they still throw, the Workflow body
   catches, records `commentError` in the outcome, and the run's own status
   is unaffected. A video with a missing comment is a delivery bug; a
   "failed" run because GitHub was down is a lie.
10. **The demo spec is a stand-in until the AI scoping stage lands.**
    `fallbackDemoSpec(pr)` is pure: title with the tag stripped, kebab slug
    from it, `entryPoint: null`, `intent` from the title,
    `reason: "model scoping not yet enabled"`. It produces the same `DemoSpec`
    type `lib/scope/scope-demo.ts` will produce later, so the Workflow does
    not change when the model call arrives. Logged as a stand-in, not hidden.
11. **The webhook always requests `explore-and-record`.** There is no env
    toggle to force record-only. While AI Gateway is 403 that means live
    runs fail fast and honestly as `explore/model-call-failed` — which
    exercises the failure comment for real. `record-only` is reachable through
    the Workflow input (for the dev harness now, the rerun route later) with a
    `ConfigSource` of `{ kind: "inline", json }` or `{ kind: "blob", url }`.
    No `fixture` kind in production code.
12. **No Octokit.** `lib/trigger/github.ts` is a ~60-line `fetch` wrapper with
    a typed `GitHubError { status }`. Four endpoints don't justify a
    dependency. If a fifth endpoint needs pagination helpers, log it and
    reconsider.
13. **Status-page URLs come from `VERCEL_PROJECT_PRODUCTION_URL`**, an
    injected variable, with `http://localhost:3000` off-platform. No new
    manual env var.

---

## 4. Contracts

Write these types first; they are the seams between the four pieces. Names
are fixed so the later UI work can be written against them.

### 4.1 `lib/trigger/verify.ts` — pure, tested

```ts
export function verifyVercelSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean;
```
HMAC-SHA1 hex over `rawBody`; `timingSafeEqual` on the *bytes* of both hex
strings after a length check. Returns `false` (never throws) on a missing or
malformed header. Tests: valid; wrong secret; tampered body; header absent;
header with wrong length; uppercase hex is rejected (Vercel sends lowercase —
don't normalize, don't be clever).

### 4.2 `lib/trigger/tag.ts` — pure, tested

```ts
export type TagMatch =
  | { matched: true; title: string }   // title with the tag and surrounding whitespace removed
  | { matched: false };

export function matchFeatureTag(title: string): TagMatch;
```
Regex from R-2.1: `^\s*\[(feat|feature)\]`, case-insensitive. Tests:
`[feat] X`, `  [Feature]X`, `[FEAT]`, no tag, `feat: X` (no match), tag not at
start (no match), tag only with empty remainder → `matched: true, title: ""`
(the caller decides what an empty title means, not the matcher).

### 4.3 `lib/trigger/payload.ts` — zod, tested

```ts
export const deploymentSucceededSchema = z.object({
  id: z.string(),
  type: z.literal("deployment.succeeded"),
  createdAt: z.number(),
  payload: z.object({
    target: z.enum(["production", "staging"]).nullable(),
    deployment: z.object({
      id: z.string().min(1),
      url: z.string().min(1),                    // bare host; caller prefixes https://
      meta: z.object({
        githubOrg: z.string().min(1),
        githubRepo: z.string().min(1),
        githubPrId: z.string().regex(/^\d+$/).optional(),
        githubCommitRef: z.string().min(1),
        githubCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
      }).passthrough(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type DeploymentSucceeded = z.infer<typeof deploymentSucceededSchema>;

export interface DeploymentFacts {
  deploymentId: string;
  previewUrl: string;            // https://<deployment.url>
  owner: string;                 // meta.githubOrg
  repo: string;                  // meta.githubRepo
  prNumber: number | null;       // Number(meta.githubPrId) when present
  headRef: string;
  commitSha: string;
}

export function deploymentFacts(event: DeploymentSucceeded): DeploymentFacts;
```
Parse the envelope with `safeParse`. An event of another `type` is not an
error — check `body.type` first with a tiny `z.object({ type: z.string() })`
and return `ignored-event` before running the full schema. A
`deployment.succeeded` that fails the full schema **is** an error: log it,
return 200 with `reason: "malformed-payload"` (a 5xx would make Vercel retry
a payload that will never parse). `meta` is `.passthrough()` because the
undocumented keys are not ours to reject; the five we read are required.
`githubPrId` is validated as a digit string and converted once, here.

### 4.4 `lib/trigger/github.ts`

```ts
export class GitHubError extends Error { constructor(readonly status: number, message: string) }

export interface PullRequest {
  number: number;
  title: string;
  body: string;                 // "" when GitHub returns null
  headRef: string;
  headSha: string;
  htmlUrl: string;
  state: "open" | "closed";
}

export interface RepoRef { owner: string; repo: string }

export function getPullRequest(ref: RepoRef, prNumber: number): Promise<PullRequest | null>;   // 404 → null
export function findOpenPullRequestByBranch(ref: RepoRef, headRef: string): Promise<PullRequest | null>;
export function listChangedPaths(ref: RepoRef, prNumber: number): Promise<string[]>;       // cap 300, 3 pages
export function findCommentByMarker(ref: RepoRef, prNumber: number, marker: string): Promise<{ id: number } | null>;
export function createComment(ref: RepoRef, prNumber: number, body: string): Promise<{ id: number }>;
export function updateComment(ref: RepoRef, commentId: number, body: string): Promise<void>;  // 404 → GitHubError(404)
```
One private `githubRequest<T>(path, init)` sets `Authorization: Bearer`,
`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`,
`User-Agent: preview-reel`, and throws `GitHubError` on non-2xx. Branch
lookup: `GET /repos/{o}/{r}/pulls?state=open&head={owner}:{headRef}&per_page=1`.
Comments: `GET /repos/{o}/{r}/issues/{n}/comments?per_page=100`, walk `Link:
rel="next"` up to 3 pages; a PR with >300 comments falls through to
"create" and that is a documented limitation, not a bug to fix now.

### 4.5 `lib/storage/keys.ts` — additions, tested

```ts
export interface PrIdentity { owner: string; repo: string; prNumber: number }   // DemoIdentity minus deploymentId

export function prDemosPrefix(identity: PrIdentity): string;        // demos/{owner}/{repo}/pr-{n}/
export function prRunsPrefix(identity: PrIdentity): string;         // runs/by-pr/{owner}/{repo}/pr-{n}/
export function prRunIndexKey(identity: PrIdentity, runId: string): string; // runs/by-pr/{owner}/{repo}/pr-{n}/{runId}.json
export function runRecordKey(runId: string): string;                // runs/{runId}/run.json
export function runEventsPrefix(runId: string): string;             // runs/{runId}/events/
```
Same `component()`/`positiveInteger()` validation as the existing builders.
`runs/{runId}/…` and `runs/by-pr/…` share a top-level prefix; that is fine
because nothing lists `runs/` bare. A `runId` literally equal to `by-pr` must
be rejected — add `component()` a reserved-word check and test it.

### 4.6 `lib/storage/runs.ts` — additions

```ts
export type RunStage = "scope" | "comment" | "provision" | "explore" | "record" | "upload";
export type RunMode = "explore-and-record" | "record-only";
export type ConfigSource = { kind: "inline"; json: string } | { kind: "blob"; url: string };

export interface RunFailure { stage: RunStage; reason: string; detail: string; logsUrl: string | null }

export interface RunRecord {                      // runs/{runId}/run.json — written once by the Workflow
  runId: string;
  identity: DemoIdentity;
  previewUrl: string;
  commitSha: string;
  pr: { title: string; body: string; headRef: string; htmlUrl: string };
  demo: DemoSpec;
  mode: RunMode;
  thinInput: boolean;                             // pr.body was empty (spec §8)
  startedAt: string;
}

export interface RunEvent {                       // existing shape, stage narrowed
  at: string;
  stage: RunStage;
  status: "started" | "completed" | "failed";
  reason?: string;
  detail?: string;
  logsUrl?: string;
}

// Fixed sequence table (decision 6). Terminal events share seq 100; exactly one is ever written.
export const EVENT_SEQ = {
  "scope:started": 10, "comment:started": 20, "provision:started": 30,
  "explore:started": 40, "record:started": 50, "upload:started": 60,
  "upload:completed": 100, "failed": 100,
} as const;

export function markStage(runId: string, stage: RunStage): Promise<void>;                 // status: started
export function markDone(runId: string): Promise<void>;                                   // upload:completed
export function markFailed(runId: string, failure: RunFailure): Promise<void>;
export function readRunEvents(runId: string): Promise<RunEvent[]>;                        // list prefix, fetch each, sort by seq

export function claimDeployment(deploymentId: string, claim: { owner: string; repo: string; prNumber: number; claimedAt: string })
  : Promise<{ claimed: true } | { claimed: false; existing: unknown }>;
export function indexRunForPr(identity: PrIdentity, runId: string, claimedAt: string): Promise<void>;
export function writeRunRecord(record: RunRecord): Promise<void>;
export function readRunRecord(runId: string): Promise<RunRecord | null>;
export function listRunIdsForPr(identity: PrIdentity): Promise<Array<{ runId: string; claimedAt: string }>>;
export function hasCompletedDemo(identity: PrIdentity): Promise<boolean>;                 // any */metadata.json under prDemosPrefix
```
`claimDeployment` is the one place `putOnce`'s "existed vs created" distinction
matters, so `putOnce` grows a `{ blob, created: boolean }` return and every
existing caller ignores `created`. Don't fork a second put helper.
`readRunEvents` fetches each event body with `fetch(blob.url, { cache: "no-store" })`;
event blobs are ≤ 300 bytes and there are ≤ 8 per run. Reading through the
CDN is fine *because* the objects are immutable — that is the whole point of
R-6.4.

### 4.7 `lib/storage/status.ts` — pure, tested

```ts
export type RunStatusView =
  | { state: "in_progress"; stage: RunStage; since: string }
  | { state: "done"; completedAt: string }
  | { state: "failed"; failure: RunFailure; at: string };

export function deriveRunStatus(
  events: RunEvent[],
  workflowStatus: WorkflowRunStatus | null,     // null = getRun threw NotFound
): RunStatusView | null;                        // null = no events and no run: unknown runId
```
Rules, in order: a `failed` event wins; `upload:completed` → done; otherwise
the highest-seq `started` event is the current stage — **unless**
`workflowStatus` is `failed`/`cancelled`, in which case return failed at that
stage with `reason: "workflow-crashed"`. `pending`/`running` with no events
yet → `in_progress` at `scope`. Tests: each branch, plus "events arrive out of
order in the array" (sort inside, don't trust the caller).

### 4.8 `lib/comment/render.ts` — pure, tested

```ts
export const COMMENT_MARKER_PREFIX = "<!-- preview-reel:pr-";
export function commentMarker(prNumber: number): string;   // `<!-- preview-reel:pr-${n} -->`

export type CommentState =
  | { state: "in_progress"; title: string; statusUrl: string }
  | { state: "done"; title: string; statusUrl: string; posterUrl: string; configUrl: string }
  | { state: "failed"; title: string; statusUrl: string; failure: RunFailure };

export function renderComment(prNumber: number, state: CommentState): string;
```
Line 1 is always the marker. Copy rules from AGENTS.md: plain, specific, no
exclamation marks. `in_progress`: "Recording a demo of **{title}** on this
preview. Usually takes about three minutes. [Watch progress]({statusUrl})".
`done`: poster as `[![{title}]({posterUrl})]({statusUrl})`, then title, then
"[Watch the demo]({statusUrl}) · [View the recording config]({configUrl})".
`failed`: "Demo recording failed during **{stage}**: {reason}. {detail}
[Run log and re-run]({statusUrl})". `logsUrl` is *not* linked directly — the
log is credential-scrubbed but raw NDJSON; the status page is the human
surface. Tests: snapshot-free — assert the marker is line 1, assert each
required link is present, assert no `!` in any output.

### 4.9 `workflows/record-demo.ts`

```ts
export interface RecordDemoInput {
  identity: DemoIdentity;
  previewUrl: string;
  commitSha: string;
  pr: { title: string; body: string; headRef: string; htmlUrl: string };   // title already tag-stripped
  mode: RunMode;
  configSource?: ConfigSource;                     // required when mode === "record-only"
}

export type Outcome =
  | { ok: true; artifacts: { configUrl: string; videoUrl: string; posterUrl: string; metadataUrl: string }; timings: SandboxRunResult["timings"] }
  | { ok: false; failure: RunFailure };

export async function recordDemo(input: RecordDemoInput): Promise<Outcome & { commentError?: string }> {
  "use workflow";
  const { workflowRunId: runId } = getWorkflowMetadata();
  const demo = await scopeDemo(runId, input);                           // step, maxRetries 0
  await openRun(runId, input, demo);                                    // step: run.json + comment:started event
  let commentId: number | null = null, commentError: string | undefined;
  try { commentId = await postInProgressComment(runId, input, demo); } catch (e) { commentError = describe(e); }
  let outcome: Outcome;
  try { outcome = await runPipeline(runId, input, demo); }              // step, maxRetries 0
  catch (e) { outcome = { ok: false, failure: await unexpectedFailure(runId, e) }; }  // step: reads last started stage
  await recordOutcome(runId, outcome);                                  // step: markDone | markFailed
  try { await finalizeComment(runId, input, demo, commentId, outcome); } catch (e) { commentError = describe(e); }
  return { ...outcome, commentError };
}
```
Rules for the body: no `Date.now()`, no `fetch`, no `process.env`, no
randomness — all of that lives in steps. Steps are top-level functions in
the same file with `"use step"`, one per line above. `runPipeline`:

- `markStage(provision)` → `runInSandbox(...)` with callbacks:
  `onProvisioned` → `markStage(explore | record)` by mode; `onConfig` →
  `persistConfig` then `markStage(record)`; `onRecorded` → `markStage(upload)`.
  (`runInSandbox` needs an `onProvisioned` and `onRecorded` hook added; both
  are two-line changes. Don't restructure the function.)
- Logs accumulate in memory as NDJSON `{ at, stage, stream, data }` and are
  persisted with `persistRunLogs` in a `finally`, so `logsUrl` exists on
  every path including timeout.
- `RunnerFailure` → `{ ok: false, failure: { stage, reason, detail, logsUrl } }`.
  Anything else rethrows (decision 8).
- Returns URLs and timings only.

`scopeDemo` for this slice: `markStage(scope)`, `listChangedPaths` (needed by
explore), `fallbackDemoSpec(input.pr)`. When `lib/scope/scope-demo.ts` lands
it replaces the last line and nothing else moves.

### 4.10 `app/api/webhooks/vercel/route.ts`

```ts
type SkipReason =
  | "bad-signature" | "ignored-event" | "malformed-payload" | "production-target"
  | "repo-not-allowlisted" | "no-pr" | "pr-closed" | "untagged" | "already-demoed"
  | "run-in-progress" | "already-claimed";

// 401 { reason: "bad-signature" }
// 200 { handled: false, reason: SkipReason }
// 200 { handled: true, runId }
// 502 { retry: true, reason: "github-unavailable" }   ← only for GitHub 5xx/network *before* the claim
```
Order, and it matters: `request.text()` → verify → parse `type` → full parse
→ `target !== "production"` → allowlist (case-insensitive `owner/repo`) →
resolve PR (`getPullRequest` by `prNumber`, else `findOpenPullRequestByBranch`)
→ `state === "open"` → tag → `hasCompletedDemo` → in-progress check (§5.2) →
`claimDeployment` → `start(recordDemo, [input])` → `indexRunForPr` → 200.
After `claimDeployment` succeeds, **every** error path still returns 200 with
`handled: true` or a logged `reason` — a retry after the claim can never
start anything, so a 5xx there only generates a day of noise. Wrap the
handler body in one `try` with that rule at the boundary. Log every decision
as one structured line: `{ deploymentId, owner, repo, prNumber, reason }`.

### 4.11 `app/api/runs/[runId]/route.ts`

```ts
// 200 { runId, record: RunRecord | null, status: RunStatusView }
// 404 { error: "run not found" }   when getRun throws NotFound AND no events exist
```
`Promise.all([readRunRecord, readRunEvents, getRun(runId).status.catch(() => null)])`
then `deriveRunStatus`. `Cache-Control: no-store`. Twenty lines; this is
the verification surface for everything above and the UI's data source
later.

---

## 5. The loop

Each slice ends demoable. Time boxes are estimates; blowing one is a result
to write down.

### Slice 1 — run state and idempotency primitives (45 min) — P0.1

Files: `lib/storage/keys.ts` (+tests), `lib/storage/runs.ts`,
`lib/storage/status.ts` (+tests).

Order: key builders and tests → `putOnce` returns `created` → `claimDeployment`
→ `markStage/markDone/markFailed` using `EVENT_SEQ` → `readRunEvents` →
`deriveRunStatus` and tests → `indexRunForPr`, `listRunIdsForPr`,
`hasCompletedDemo`, `writeRunRecord`, `readRunRecord`.

Exit: `npm test` green; a throwaway `tsx -e` against the real store shows
`claimDeployment("dpl_test_…")` returning `{ claimed: true }` then
`{ claimed: false }` on the second call; delete the test sentinel with
`del()` afterwards (it's the one legitimate delete — test data).

If `list()` doesn't return `uploadedAt` or returns unexpected ordering, sort by
`pathname` in code and log it. Don't depend on API ordering anywhere.

### 5.2 — the in-progress check, spelled out

```ts
const pointers = await listRunIdsForPr(identity);
const fresh = pointers.filter(p => Date.parse(p.claimedAt) > Date.now() - 15 * 60_000);
const statuses = await Promise.all(fresh.map(p => getRun(p.runId).status.catch(() => "failed" as const)));
const inProgress = statuses.some(s => s === "pending" || s === "running");
```
The 15-minute staleness guard exists so a Workflow stuck in `running` (which
should be impossible past the 5-minute sandbox deadline, but "should") cannot
lock a PR out of demos forever. `getRun` throwing means the run is gone —
treat as not in progress. Log the guard as a decision.

### Slice 2 — the Workflow runs record-only from a harness (60 min) — P0.2a

Files: `workflows/record-demo.ts`, `lib/sandbox/run.ts` (two hooks),
`app/api/runs/[runId]/route.ts`, `scripts/trigger-run.ts` (dev harness, does
not ship — delete it in the final slice's commit like `run-once.ts` was).

Harness: `npx tsx scripts/trigger-run.ts --pr 1 --record-only` reads
`fixtures/sample-run/config.json`, looks up PR #1's latest preview deployment
via the Vercel API (token from the CLI auth file, same as the earlier probes),
builds `RecordDemoInput` with `configSource: { kind: "inline", json }`, calls
`start(recordDemo, [input])`, prints `runId`, then polls
`GET /api/runs/{runId}` on the running `next dev` every 3 s until terminal.
**Comment steps are no-ops in this slice** (return `null`); they land in
Slice 4.

Exit: the poll output shows `provision → record → upload → done` with real
timestamps; `runs/{runId}/run.json`, six event blobs, and `logs.jsonl` exist;
`demos/…/metadata.json` exists under the deployment's prefix. Then run once
more with `VERCEL_PROTECTION_BYPASS=wrong` in the *server's* env and confirm
the terminal event is `{ stage: "record", reason: "…" , logsUrl }` — note
what reason the recorder actually reports for an auth-walled replay, because
`webreel` will surface it as a navigation/element failure, not as
`preview-protected` (that detection is explore-only). Log the observed reason.

If `start()` fails locally: check whether `next dev` under `withWorkflow`
exposes a local world or needs `npx workflow dev`; whichever it is, write it
down (assumption A1). If the Workflow body throws about non-determinism, a
`Date`/`env`/`fetch` leaked into the body — move it into a step, don't
suppress. If the run stays `pending`: the workflow route isn't being served;
check `withWorkflow` is applied in `next.config.ts` (it is) and that the dev
server was restarted after adding the workflow file.

### Slice 3 — the webhook starts a run from a live deployment (60 min) — P0.3 + P0.2b

Files: `lib/trigger/verify.ts` (+tests), `lib/trigger/tag.ts` (+tests),
`lib/trigger/payload.ts` (+tests), `lib/trigger/github.ts`,
`app/api/webhooks/vercel/route.ts`, `fixtures/webhook/deployment-succeeded.json`,
`scripts/replay-webhook.ts` (dev harness, does not ship).

Build the fixture by hand from §2's envelope shape and the real meta values
already captured (nothing in it is secret). The replay script signs the
fixture with `VERCEL_WEBHOOK_SECRET` from `.env.local` and posts it to
`http://localhost:3000/api/webhooks/vercel` with an optional `--deployment-id`
override so each replay can be a "new" deployment.

Local sequence, each one assertion:
1. Replay with a bad secret → 401.
2. Replay with `type: "deployment.created"` → 200 `ignored-event`.
3. Replay with `target: "production"` → 200 `production-target`.
4. Replay with `githubRepo: "other"` → 200 `repo-not-allowlisted`, and the
   dev server log shows **no** GitHub request.
5. Replay as-is → PR #1 is tagged → but `hasCompletedDemo` is true from
   Slice 2 → 200 `already-demoed`. Good: R-2.10 works. Then point
   `PREVIEW_REEL_REPOS` at a scratch identity? No — instead replay with
   `githubPrId` set to a PR number that has no demo yet. Open PR #2 on the
   target titled `[feat] …` if one doesn't exist (it's needed for the live
   demo anyway) and use its real deployment id.
6. Replay for PR #2 → 200 `{ handled: true, runId }`; the run fails within
   ~20 s as `explore/model-call-failed` (Gateway 403) — expected, and the
   status endpoint says so with stage and reason.
7. Replay the exact same payload again → 200 `already-claimed`.
8. Replay with a fresh `--deployment-id` while step 6's run is still
   `running` → 200 `run-in-progress`. (Time it: the run fails in ~20 s, so
   fire this within 10 s of step 6.)
9. Replay with `githubPrId` removed and `githubCommitRef` set to PR #2's
   branch → resolves via branch search → `already-demoed` or
   `already-claimed`, proving the fallback path is wired.

Then deploy and do it for real: push a trivial commit to PR #2's branch, watch
the Vercel webhook log show 200 with `handled: true`, and confirm the run
appears via the production `GET /api/runs/{runId}`.

Exit: all nine local assertions plus one live delivery, written into
`DECISIONS.md` as a single entry with the observed reasons.

If the live delivery returns 200 `malformed-payload`: the real envelope
differs from the doc — capture it from the function logs, fix the fixture
*and* the schema, and record the diff. If `no-pr` on a PR you can see: check
`githubPrId` type handling (string!) before anything else.

### Slice 4 — the comment tracks the run (45 min) — P0.4

Files: `lib/comment/render.ts` (+tests), `lib/trigger/github.ts` (comment
endpoints), `workflows/record-demo.ts` (fill in the two comment steps),
`lib/env.ts` (`appBaseUrl()`).

Upsert, in `postInProgressComment`: `findCommentByMarker` → `updateComment`
or `createComment` → return `id`. In `finalizeComment`: if `commentId` is
non-null, `updateComment(commentId)`; on `GitHubError(404)` (someone deleted
it) fall back to the marker search and create. Never post a second comment
because the first id was lost — the marker search is the recovery path, not
a new create.

Exit, in order: run the record-only harness against PR #2 → the PR shows one
comment that reads `in_progress` then flips to `done` with the poster; the
comment's `id` did not change (check via the API). Push a commit to PR #2 →
Gateway-403 run → the *same* comment flips to `failed` naming `explore` and
`model-call-failed`. Then `npx tsx scripts/trigger-run.ts --pr 2 --record-only`
again — but this is now blocked by `already-demoed`? No: the harness calls
`start()` directly and bypasses the handler's checks by design; a rerun is
manual (R-8.4). Confirm the comment flips back to `done`.

If GitHub's image proxy doesn't render the poster: check the Blob URL is
public and returns `image/png`; camo requires a direct image response.

### Slice 5 — close out (15 min)

Delete `scripts/trigger-run.ts` and `scripts/replay-webhook.ts` **only if**
the rerun route in the next plan won't want them; otherwise move the
Vercel-API deployment lookup into `lib/` and delete the rest. Update
`.env.example` if anything changed (it should not have). Update the
`DECISIONS.md` assumptions register (§6). Run `npm run type-check && npm test
&& npm run lint`. Confirm `vercel deploy` succeeds and `/api/webhooks/vercel`
still answers 200 to a garbage body? No — it answers **401** to an unsigned
body now; confirm that instead, and confirm Vercel's webhook log for the
target project shows no 4xx/5xx from real deliveries.

---

## 6. Assumptions register

Check at the slice named; write the outcome to `DECISIONS.md` either way.

| # | Assumption | Slice | Probe |
|---|---|---|---|
| A1 | `start()` works under `next dev` with `withWorkflow` and no extra process. | 2 | first harness run |
| A2 | A `"use step"` function can accept and return the plain-object types in §4 without class-serialization registration (`DemoIdentity`, `Outcome`, `DemoSpec`). | 2 | type-check plus first run; if `RunnerFailure` instances leak into a return value they will not survive — the step must return the plain `RunFailure` |
| A3 | Step return values of a few KB (URLs, timings, changed-path list ≤ 300 strings) are within Workflow's event-log limits. | 2 | first run; if a size error appears, cap `changedPaths` at 100 |
| A4 | `getRun(runId).status` from a Next.js route handler resolves in < 500 ms in `iad1`. | 2 | time the status route |
| A5 | The live webhook envelope matches the docs shape in §2 (`payload.deployment.meta` etc.). | 3 | live delivery in slice 3 |
| A6 | `request.text()` in an App Router handler yields the byte-exact raw body Vercel signed (no re-serialization). | 3 | local replay signs the same bytes; live delivery must verify too |
| A7 | GitHub `pulls?head=owner:branch` finds the PR for a same-repo branch. | 3 | assertion 9 |
| A8 | Issue-comment `PATCH` on a closed PR succeeds (spec §8: PR closed mid-run). | 4 | close PR #2 briefly after a run, update, reopen |
| A9 | GitHub's camo proxy renders a public Vercel Blob PNG inline. | 4 | look at the `done` comment |
| A10 | Blob `list()` on a `runs/by-pr/…` prefix is consistent within a second of `put()` (the in-progress check reads what the previous handler just wrote). | 3 | assertion 8; if it misses, the window is longer than decision 1 states — log the measured gap |

---

## 7. Files this work produces or changes

```
lib/trigger/verify.ts          + verify.test.ts
lib/trigger/tag.ts             + tag.test.ts
lib/trigger/payload.ts         + payload.test.ts      (new file; envelope schema + deploymentFacts)
lib/trigger/github.ts
lib/storage/keys.ts            + keys.test.ts additions
lib/storage/runs.ts            claim, events, record, PR index, completed-demo lookup
lib/storage/status.ts          + status.test.ts       (new file; pure reducer)
lib/comment/render.ts          + render.test.ts
lib/scope/fallback.ts          fallbackDemoSpec — pure, tiny, replaced by scope-demo.ts later
lib/sandbox/run.ts             onProvisioned / onRecorded hooks only
lib/env.ts                     appBaseUrl()
workflows/record-demo.ts
app/api/webhooks/vercel/route.ts
app/api/runs/[runId]/route.ts
fixtures/webhook/deployment-succeeded.json
scripts/trigger-run.ts         dev harness — does not ship
scripts/replay-webhook.ts      dev harness — does not ship
```

Not touched: `sandbox-runner/*`, `scripts/build-snapshot.ts`, anything under
`app/` that renders HTML, `components/`.

---

## 8. Brittleness checklist — things this work must not do

Each of these has bitten a system like this. If you find yourself doing one,
stop and re-read the contract.

- Infer anything from **webhook arrival order**. Two deployments can arrive
  reversed. Only the sentinel and the PR index decide.
- Parse **error message strings** to classify failures. `RunnerFailure`
  carries `stage`/`reason`; `GitHubError` carries `status`. If a new failure
  needs classifying, give it a field.
- **Coerce** `githubPrId`, PR numbers, or anything into a number with
  `Number()` before validating it is a digit string.
- Read status from a **mutable** Blob object, or write one. If a design
  seems to need "update the run record," it needs a new event instead.
- Let a `Buffer`, a `Sandbox`, or an `Error` instance cross a **step
  boundary**. Plain JSON in, plain JSON out.
- Use **Workflow retries** to express business retry policy. The provision
  retry is inside `provisionSandbox`; comment retries are the default and
  harmless because the upsert is idempotent; the pipeline step never retries.
- Return **5xx after the sentinel is claimed**, or 2xx for a bad signature.
- Post a comment before the tag check passes, post a second comment, or edit
  the PR description.
- Put the **bypass secret, login token, or PAT** into a run record, an event,
  a log line, or a comment. `persistRunLogs` receives the same redacted
  stream the runner already produces; do not add un-redacted server-side
  logging of `env`.
- Add a **"current status" field** to `run.json`, a status cache, an env
  toggle for record-only, an Octokit dependency, or a per-repo config object.
  Each is a second implementation of something that already has one.

---

## 9. Done means

- `npm test` covers `verify`, `tag`, `payload`, `keys`, `status`, `render`;
  `npm run type-check` and `npm run lint` are clean.
- A live `deployment.succeeded` for a tagged PR on the target produces exactly
  one Workflow run, one `run.json`, an ordered event trail, a `logs.jsonl`,
  and one PR comment — and a replay of the same delivery produces 200
  `already-claimed` with nothing else written.
- A second deployment during a run produces 200 `run-in-progress`; a
  deployment for an already-demoed PR produces 200 `already-demoed`; an
  untagged PR produces 200 `untagged` with zero Blob writes and zero
  Workflow runs.
- `GET /api/runs/{runId}` reports the live stage while a record-only run is
  executing and the terminal `{ stage, reason, logsUrl }` after a staged
  failure.
- The comment on PR #2 has gone `in_progress → done → failed → done` across
  four runs and is still a single comment with a single `id`.
- Every row in §6 has an outcome in `DECISIONS.md`, and decisions 1, 2, 3,
  8, 10, and 11 from §3 each have their own line there.

## 10. Not this work

The AI scoping call (`lib/scope/scope-demo.ts`) — blocked on Gateway billing
and slotted for the next plan. The rerun route and its record-only-from-Blob
mode (the `ConfigSource` type is ready for it). The status page, gallery,
player, and their empty/loading/failure states. Model cost capture. Anything
in `docs/spec.md` §11.
