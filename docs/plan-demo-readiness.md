# Plan: demo readiness — re-run, config as artifact, staged failures, model and cost

A brief for a coding agent. Scope: the four items from the assessment review
that strengthen the live demo and the 60-minute conversation around it:

1. **Re-run** — `POST /api/runs/[runId]/rerun` (currently `501`) plus the
   buttons on the run page. This is the on-stage "watch it run" moment
   (spec R-8.4, R-13.5).
2. **Config as the artifact** — the Steps view exists; make the
   `${VAR}` placeholders and the entry URL visible as a *feature*, not
   incidental text (R-3.8, R-9.2).
3. **Staged failures** — make the record path detect the auth wall
   explicitly instead of reporting `element-not-found` (R-3.6, §8), then
   produce the demo-day failure fixtures (R-13.3).
6. **Model and cost visibility** — persist which model recorded each demo,
   show it as a provider-icon tag with an effort sub-tag, and total reported
   spend on the gallery (R-10.1a, R-10.2).

Nothing here touches the webhook's decision order, the Workflow's stage
order, the exploration prompt, storage keys, or the polling loop, except
where a field has to be surfaced. Read `AGENTS.md` → "How to work", "UI",
"Pipeline rules"; `docs/plan-ui-and-api.md` §4.6 and §5.9 (the rerun
contract this brief inherits); and `DECISIONS.md` from the
`## UI and API — planning` heading down. Append to `DECISIONS.md` in the
same commit as each call.

**Validation environment.** Do not use the local `next dev` server for UI
checks — a Next/Workflow streaming issue leaves page GETs open for minutes
(DECISIONS `[Run status]`, `[Validation]`). Verify API routes on the branch
preview with `vercel curl`; verify UI on production after merge (the
production alias in `APP_BASE_URL` is public; previews sit behind Deployment
Protection). The local **Workflow runtime** is fine for starting runs:
`./node_modules/.bin/tsx scripts/trigger-run.ts --pr 2 --record-only`
produced three real runs on 2026-09-09. Use the local `tsx` binary directly,
not `npx tsx` (DECISIONS `[Planning]`).

**Git.** One branch per slice, PR merged to `main`, commit messages as given
below. No co-author trailers. `npm run type-check` before every commit.

---

## 1. What exists — do not re-verify

Checked at commit `55479af`.

| Fact | Evidence |
|---|---|
| `POST /api/runs/[runId]/rerun` returns `501 { error: "not implemented" }`. | `app/api/runs/[runId]/rerun/route.ts` |
| The webhook's in-progress guard: `listRunIdsForPr(identity)` → keep pointers with `claimedAt` in the last 15 min → `getRun(id).status` for each (`.catch(() => "failed")`) → skip if any is `pending`/`running`. It lives inline in the route. DECISIONS `[Planning]` deferred extracting it "until the rerun route lands". | `app/api/webhooks/vercel/route.ts` lines 162–179 |
| `start(recordDemo, [input])` returns `{ runId }`; `indexRunForPr(identity, runId, claimedAt)` writes the pointer the guard reads. The dev harness does exactly this with a raw body. | `app/api/dev/trigger-run/route.ts`, webhook lines 203–207 |
| `RecordDemoInput = { identity: DemoIdentity, previewUrl, commitSha, pr: { title, body, headRef, htmlUrl }, mode, configSource? }`. `DemoIdentity` has **no** `runId`; the Workflow assigns it. `RunRecord.identity` is `DemoArtifactIdentity` (**with** `runId`) and `readRunRecord` backfills it for legacy records. `configSource: { kind: "blob", url }` is implemented in `loadConfig()` and used only by the dev harness. | `workflows/record-demo.ts` lines 48–60, 267–286; `lib/storage/runs.ts::readRunRecord` |
| `scopeDemo` runs in **both** modes — a record-only run still makes one Gateway call and reports its cost (the 2026-09-10 record-only run shows `$0.000323`). So the model is never `null` for a completed demo. | `workflows/record-demo.ts::recordDemo`, DECISIONS `[Validation]` |
| `RunView = { runId, record, status, demo, configUrl, logsUrl, transcriptUrl }`. `configUrl` is non-null on done runs and on record/upload failures. `status.state ∈ in_progress \| done \| failed`. | `lib/storage/run-view.ts`, `lib/storage/status.ts` |
| The run page header is a flex row: title + `RunMetadata` on the left, a primary "Visit preview" `<a>` on the right. `FailureAlert` links "Run log ↗" and "Exploration transcript ↗". `RecordingConfig` and `RunLogs` are `Disclosure`s at the bottom. | `components/run-status.tsx` lines 297–363 |
| Steps view: `extractSteps(text)` → `{ videos: [{ name, steps }] }`; `ConfigSteps` renders per-video `<h3>` (video key, monospace), a caption, numbered `StepRow`s with `actionLabel`/`primaryValue`/`stepDescription`, expanding to `JSON.stringify(step)`. **The video's `url` (entry URL) is not rendered anywhere in the Steps tab.** | `lib/config/steps.ts`, `components/config-steps.tsx` |
| `containsResolvedCredential(text)` hides the config behind a destructive Alert if `token=` or `x-vercel-protection-bypass=` carries anything but its `${…}` placeholder. Preserve it. | `components/recording-config.tsx` lines 19–34 |
| Explore path detects the auth wall: after `agent-browser open`, `assertAuthenticated()` reads the URL and throws `RunnerFailure("explore", "preview-protected", …)` for `vercel.com` hosts and `("explore", "login-failed", …)` for `/login`. | `sandbox-runner/explore.ts` lines 241–268 |
| **Record path does not.** `recordingFailure(output)` classifies webreel's exit text by regex into `element-not-found` / `encode-failed` / `navigation-failed` / `record-failed`. A wrong bypass secret redirects to Vercel login, the first `click` finds nothing, and the run reports `element-not-found`. Run `wrun_01M24AN0VAZYS7GDSVHCPJW10D` is a real example (wrong config for the deployment, same symptom). | `sandbox-runner/record.ts` lines 66–77 |
| `record()` already calls `requireSubstitutionVariables()` (throws `substitution-vars-missing` if `DEMO_LOGIN_TOKEN` or `VERCEL_PROTECTION_BYPASS` is unset) before `webreel validate`. The config's first video `url` is the entry URL with `${…}` placeholders. | `sandbox-runner/record.ts` lines 36–47, 79–129 |
| Model: `DEFAULT_MODEL_ID = "openai/gpt-5.6-luna"`, `DEFAULT_REASONING_EFFORT = "medium"`; both call sites import them. The explore summary already writes `model: DEFAULT_MODEL_ID` to `explore-summary.json` inside the sandbox, but `SandboxRunResult` carries only `modelCostUsd`. | `lib/ai/model.ts`, `sandbox-runner/explore.ts` line 615, `lib/sandbox/run.ts` lines 30–40 |
| `demoMetadataSchema` is `.strict()` and has no model field. Reader is warn-and-skip (`readMetadata`). Three conforming objects exist in Blob (PR #2 ×2, plus whatever has run since); two legacy ones are already skipped. | `lib/storage/metadata.ts`, `lib/storage/runs.ts::readMetadata` |
| `sumReportedCosts(...costs)` returns `null` when nothing was reported; never estimates. `cost()` and `duration()` formatters are local to `demo-player.tsx`. | `lib/ai/model.ts`, `components/demo-player.tsx` lines 3–14 |
| Gallery: `app/page.tsx` server component → `listCompletedDemos()` (newest per PR) → `GalleryTable` (client; search, `groupByRecency`, clickable rows, PR tag styled `rounded-md bg-muted/80 px-2 py-1 text-foreground`, no border). | `app/page.tsx`, `components/gallery-table.tsx` |
| Generated shadcn: `alert badge button card collapsible input separator skeleton`. `lucide-react` has no OpenAI mark. | `components/ui/` |
| Comment renderer's failed state already says "[Run log and re-run](statusUrl)" — the run page **must** carry the re-run control or that link lies. | `lib/comment/render.ts` line 54 |

---

## 2. Product decisions

Numbered so the slices can cite them. Each becomes a `DECISIONS.md` line
when implemented.

1. **The rerun route is public and skips the automatic-path guards on
   purpose.** Already logged (DECISIONS `[Rerun]`). It keeps the in-progress
   guard so a PR never has two concurrent runs, and it indexes the new run so
   the webhook's guard sees it. It does *not* re-check `hasCompletedDemo` or
   `claimDeployment` — those stop automatic re-recording (R-2.10); this is
   the manual path.

2. **Extract the in-progress guard now.** The rerun route is the second
   caller DECISIONS `[Planning]` was waiting for. `lib/runs/in-progress.ts`
   owns it and is the only module outside `app/` and `workflows/` that
   imports `workflow/api`. Do not pull it into `lib/storage/runs.ts`, which
   standalone scripts import.

3. **Re-run controls live in the header action cluster, once.** Next to
   "Visit preview", on `done` and `failed`. Not duplicated under the failure
   alert. One place for "act on this run"; the alert stays diagnostic.
   Tradeoff: on a failed run the eye lands on the alert first and must travel
   up; the alert's copy can point there if testing shows confusion.

4. **Record-only re-run reuses the *source run's* `previewUrl` and `pr`
   snapshot.** A re-run after the PR title was edited records the old title.
   Acceptable — identity is `(repo, prNumber)` and the title is display
   material. Log it.

5. **Auth-wall detection in the record path is a preflight, not output
   parsing.** Before `webreel record`, resolve the first video's entry URL
   with `${VAR}` substitution in memory and follow its redirect chain
   manually. A hop to `vercel.com` is `preview-protected`; a same-origin hop
   to `/login` is `login-failed`; anything else proceeds. Webreel's own exit
   text stays the fallback classifier. Tradeoff: one extra HTTP round trip
   (~200 ms) per recording, and the classification is a pure function that
   gets a unit test — this is the failure mode with the most design behind
   it (R-3.6, R-9.6, §8) and it deserves one.

6. **Failure copy aligns to the spec table.** `preview-protected` detail
   becomes "Preview deployment is protected — check the bypass secret."
   in both paths; `login-failed` becomes "Target app rejected the demo login
   token — check DEMO_LOGIN_TOKEN." The detail never contains a URL: the
   preflight URL holds resolved secrets.

7. **`metadata.json` gains `model: { id, reasoningEffort } | null`,
   defaulting to `null` on read.** The Workflow writes it from the shared
   constants in `lib/ai/model.ts` — the same source both call sites use, so
   there is exactly one place a model change shows up. `.nullable().default(null)`
   on the *reader* keeps the three existing conforming objects in the
   gallery; the UI renders "not recorded" for them. This is a storage-schema
   evolution, not model-output coercion — `AGENTS.md`'s "never coerce or
   default" is about zod on model output, and stays absolute there.
   Tradeoff: two of the reels shown on demo day will say "not recorded"
   until re-run.

8. **Provider icon by id prefix, one provider, no registry.** `openai/…`
   gets an inline-SVG OpenAI mark (`components/icons/openai.tsx`,
   `aria-hidden`, `fill-current`). Any other prefix renders the name with no
   icon. Human-readable names are a one-entry lookup with the id suffix as
   fallback. Write the second provider before extracting a registry.

9. **Gallery spend is the sum over the reels shown, and says so.** Under
   the subtitle: "3 reels · $0.0009 in model spend for these reels". Uses
   `sumReportedCosts` over `newestPerPr` output; omit the spend clause when
   it returns `null`. Not lifetime spend, not a per-row column — the table's
   right edge belongs to the timestamp.

10. **Placeholders are highlighted, and the entry URL is shown.** In the
    Steps tab, under each video's name: "Entry URL" in monospace with
    `${…}` tokens rendered as a distinct inline mark, then one caption:
    "Credentials appear as `${DEMO_LOGIN_TOKEN}` and
    `${VERCEL_PROTECTION_BYPASS}`. They are substituted from environment
    variables at replay time and never written to this file." The same
    highlighter runs over step values and the expanded JSON. The existing
    `containsResolvedCredential` guard is unchanged; this makes the rule it
    enforces legible.

11. **Keep the dev trigger harness.** `docs/plan-ui-and-api.md` slice 5
    planned to delete it once the rerun route existed. Keep it one more
    round: it is how the auth-wall fixture gets staged locally with an
    overridden secret (slice C). Delete it in the README close-out, not
    here.

---

## 3. Contracts

### 3.1 `lib/runs/in-progress.ts`

```ts
import { getRun } from "workflow/api";
import { listRunIdsForPr } from "@/lib/storage/runs";
import type { PrIdentity } from "@/lib/storage/keys";

const FRESH_WINDOW_MS = 15 * 60_000;

/** Run ID of a pending/running run for this PR started in the last 15 min, else null. */
export async function findInProgressRun(identity: PrIdentity): Promise<string | null>
```

Move the webhook's lines 162–179 here verbatim in behaviour (same window,
same `.catch(() => "failed")`), returning the *first* in-progress `runId`
rather than a boolean so the rerun route can link to it. The webhook keeps
its `"run-in-progress"` skip reason and log line; only the lookup moves.

### 3.2 `POST /api/runs/[runId]/rerun`

Body: `{ "mode": "explore-and-record" | "record-only" }` — zod, `.strict()`.

| Outcome | Status | Body |
|---|---|---|
| `readRunRecord(runId)` is null | 404 | `{ error: "run not found" }` |
| Body fails zod | 400 | `{ error: "mode must be explore-and-record or record-only" }` |
| `findInProgressRun(identity)` returns an id | 409 | `{ error: "run-in-progress", runId }` |
| `record-only` and `readConfigUrl(record.identity)` is null | 409 | `{ error: "no-config", detail: "This run never produced a config. Re-run the full pipeline instead." }` |
| `start()` throws | 502 | `{ error: "workflow-start-failed", detail }` — and log it |
| Started | 202 | `{ runId }` |

Input construction:

```ts
const { runId: _sourceRunId, ...identity } = record.identity;   // DemoIdentity
const input: RecordDemoInput = {
  identity,
  previewUrl: record.previewUrl,
  commitSha: record.commitSha,
  pr: record.pr,                                                   // decision 4
  mode,
  ...(mode === "record-only" ? { configSource: { kind: "blob", url: configUrl } } : {}),
};
const claimedAt = new Date().toISOString();
const run = await start(recordDemo, [input]);
await indexRunForPr(identity, run.runId, claimedAt);
```

Order: 404 → 400 → 409 in-progress → 409 no-config → start. Log one JSON
line per outcome in the webhook's shape:
`{ sourceRunId, owner, repo, prNumber, mode, reason | runId }`.
`Cache-Control: no-store` on every response.

### 3.3 `components/rerun-buttons.tsx` (client)

```ts
export function RerunButtons({ runId, configUrl }: { runId: string; configUrl: string | null })
```

- Two `Button`s, `variant="outline" size="sm"`: **Re-run recording**
  (record-only) and **Re-run full pipeline**.
- "Re-run recording" is `disabled` with `title="No config was produced"`
  when `configUrl === null`. Render the same text visibly beneath the buttons
  in muted small type — tooltips are not the only affordance.
- On click: `POST`, then `router.push(/runs/${newRunId})`. Both disabled
  while a request is in flight; the clicked one shows `LoaderCircle`
  spinning.
- 409 `run-in-progress`: inline, beneath the buttons, plain copy:
  "A run for this PR is already in progress." with a `Link` to
  `/runs/${runId}` reading "Open it".
- 409 `no-config` / 502 / network: inline, the response `detail` or
  `error`. No toast library.
- Rendered by `run-status.tsx` in the header action cluster, left of "Visit
  preview", when `status.state !== "in_progress"` (decision 3).

### 3.4 `sandbox-runner/record.ts` preflight

Add before `webreel validate`:

```ts
// lib-free, pure, tested:
export type AuthHop = { status: number; location: string | null };
export type AuthVerdict = "ok" | "preview-protected" | "login-failed";
export function classifyAuthHop(hop: AuthHop, previewOrigin: string): AuthVerdict
```

Rules for `classifyAuthHop`:
- `status` 401 or 403 → `preview-protected` (Vercel's SSO wall for
  non-browser clients; assumption A2).
- 3xx with `location` whose host is `vercel.com` or ends with
  `.vercel.com` → `preview-protected`.
- 3xx with `location` resolving (against `previewOrigin`) to same-origin
  path `/login` → `login-failed`.
- Anything else → `ok`.

Then, in `record()`:

```ts
async function preflightAuth(entryUrl: string): Promise<void>
```

- `substitutePlaceholders(entryUrl)` replaces `${NAME}` with
  `process.env[NAME]` **in memory only**. `requireSubstitutionVariables()`
  has already run, so both exist.
- `fetch(url, { redirect: "manual", headers: { accept: "text/html" }, signal: AbortSignal.timeout(10_000) })`,
  follow up to 5 hops, classify each with `classifyAuthHop`. Throw
  `RunnerFailure("record", verdict, DETAIL[verdict])` on the first non-`ok`.
- `DETAIL` is the fixed copy from decision 6. Never interpolate the URL,
  the status, or the location into `detail` — the URL carries secrets.
- Network failure or timeout in the preflight → do **not** fail the run;
  log one line and continue to `webreel record`. The preflight sharpens a
  reason; it must not introduce a new way to fail.
- Entry URL: `Object.values(parsedConfig.videos)[0].url`. If the config has
  no `url` (schema allows `baseUrl` + relative), resolve against `baseUrl`;
  if neither, skip the preflight.

Also update the two explore-path detail strings to the decision-6 copy.

### 3.5 `demoMetadataSchema` — `model`

```ts
export const modelInfoSchema = z.object({
  id: z.string().min(1),                                   // "openai/gpt-5.6-luna"
  reasoningEffort: z.enum(["low", "medium", "high"]),
}).strict();

// in demoMetadataSchema:
model: modelInfoSchema.nullable().default(null),          // decision 7
```

Writer (`workflows/record-demo.ts::runPipeline`, the `metadata:` object):
`model: { id: DEFAULT_MODEL_ID, reasoningEffort: DEFAULT_REASONING_EFFORT }`.
`DemoMetadataInput` stays `Omit<DemoMetadata, "artifacts">`; the type now
requires `model`, so the writer cannot forget it. Update
`fixtures/sample-run/metadata.json` and `lib/storage/metadata.test.ts`
(one case: a legacy object without `model` parses with `model: null`; one
case: an object with a bad `reasoningEffort` is rejected).

### 3.6 `components/model-tag.tsx`

```ts
export function ModelTag({ model }: { model: DemoMetadata["model"] })
```

- `model === null` → `<span className="text-sm text-muted-foreground">not recorded</span>`.
- Otherwise a `Badge variant="secondary"`-based pill whose classes match the
  gallery PR tag (`rounded-md bg-muted/80 px-2 py-1 text-foreground`, no
  border) containing, in order: provider icon (`size-3.5`, only when prefix
  is `openai`), the display name, and a nested effort sub-tag
  `<span className="rounded bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">medium</span>`.
- Display name: `modelDisplayName(id)` in `lib/ai/model.ts` —
  `{ "openai/gpt-5.6-luna": "GPT-5.6 Luna" }` with fallback
  `id.split("/").pop()`.
- `aria-label={`${displayName}, ${effort} reasoning`}` on the outer span;
  icon `aria-hidden`.

Placement: `demo-player.tsx` aside `<dl>` — a new **Model** row above
**Model cost**. Nowhere else in this slice (the run record does not carry
the model; failed/in-progress runs show none — a stated cut).

### 3.7 `lib/format.ts`

Move `duration()` and `cost()` out of `demo-player.tsx` into
`lib/format.ts` as `formatDuration`, `formatCost` when the gallery becomes
the second caller of `formatCost` (slice D). Pure; two small tests.

### 3.8 Placeholder highlighting (`lib/config/steps.ts` + `components/config-steps.tsx`)

```ts
export const PLACEHOLDER = /\$\{[A-Z0-9_]+\}/g;
export function splitPlaceholders(text: string): Array<{ text: string; placeholder: boolean }>
export function entryUrl(video: unknown, baseUrl: unknown): string | null
```

`VideoSteps` gains `entryUrl: string | null`. `ConfigSteps` renders, under
the `<h3>`, a two-line block: `Entry URL` label (muted, xs) and the URL in
`font-mono text-xs break-all` with each placeholder wrapped in
`<mark className="rounded bg-amber-400/15 px-1 text-amber-200 [font-style:normal]">`
(dark theme; tune to the existing palette). Below it the decision-10
caption. `StepRow`'s `primaryValue` span and the expanded `<pre>` render
through the same splitter (the `<pre>` can map `JSON.stringify` output
through `splitPlaceholders` — it is text).

---

## 4. Slices

Order matters: C is last because staging the failure fixture flips a PR's
comment to `failed`, and the closing successful re-run must write the
new `model` field (D) so the gallery shows a complete reel.

### Slice A — rerun route and shared guard (35 min)

`lib/runs/in-progress.ts`; webhook calls it; rerun route per §3.2. Zod body
schema. Log lines.

Verify on the branch preview with `vercel curl`:
- `POST …/rerun` with `{}` → 400.
- `POST …/api/runs/not-a-run/rerun` → 404.
- `POST` against `wrun_01M24AQ2843D33JR5337ERV9Q4` (done, has config) with
  `{ "mode": "record-only" }` → 202 `{ runId }`; `GET /api/runs/{new}` shows
  `in_progress` then `done` within ~40 s; PR #2's comment updates in place
  (same comment id — compare against the current one before you start).
- Immediately POST again while it runs → 409 `run-in-progress` with the
  first `runId`.
- `POST` against a run with no config (`wrun_01M243FZVEH34VK0Z9F46JGAPQ`,
  legacy layout — `readConfigUrl` returns null) with `record-only` → 409
  `no-config`.
- Webhook still passes `npm test` and the route's own behaviour is
  unchanged (`replay-webhook.ts` if you want a live check).

Commit: `Re-run a demo from its persisted config or from scratch`.
DECISIONS: decisions 1 (reaffirm with the live comment id), 2, 4.

### Slice B — re-run controls (25 min)

`components/rerun-buttons.tsx` per §3.3; mount in `run-status.tsx` header
cluster. Merge, then verify on **production**:
- Done run: both buttons enabled; click "Re-run recording" → lands on
  the new run page, title falls back to the PR title, phases advance
  without reload, player appears at done.
- Failed run without config (`wrun_…FZVEH…`): "Re-run recording" disabled
  with the visible reason; "Re-run full pipeline" enabled.
- Failed run with config (`wrun_01M24AN0VAZYS7GDSVHCPJW10D`): both enabled.
- Double-click: second request never fires (disabled in flight).
- Start a re-run, open the *original* run page in another tab, click
  re-run → inline 409 with "Open it" link to the running one.

Commit: `Add re-run controls to the run page`.
DECISIONS: decision 3.

### Slice C — model field, tag, and gallery spend (35 min)

§3.5, §3.6, §3.7, gallery summary line per decision 9 (`app/page.tsx`
computes it server-side). Update the fixture and tests. `npm test`.

Verify on production after merge:
- Existing reels still listed (reader default works); their run pages show
  **Model: not recorded**.
- Gallery subtitle shows "N reels · $x.xxxx in model spend for these
  reels"; remove one reel's cost mentally and confirm the arithmetic
  against the run pages.
- Trigger one record-only re-run (slice B button) → its run page shows the
  OpenAI mark, "GPT-5.6 Luna", and the "medium" sub-tag; `metadata.json`
  in Blob has `model`.

Commit: `Record and show the model behind each demo`.
DECISIONS: decisions 7, 8, 9.

### Slice D — placeholders and entry URL in the Steps view (20 min)

§3.8. No schema or API change.

Verify on production: open a done run → Recording config → Steps. Entry URL
shows with two highlighted placeholders; the caption reads as written; a
`navigate`/`type` step value containing `${…}` (if any) is highlighted; Raw
JSON tab is unchanged; the credential guard still fires if you paste a
resolved value into a local fixture and render it (a two-minute check in a
scratch page you delete, or a quick unit test on `containsResolvedCredential`
— your call).

Commit: `Show the entry URL and credential placeholders in the config view`.
DECISIONS: decision 10.

### Slice E — auth-wall detection and the demo-day fixtures (45 min)

§3.4 with tests for `classifyAuthHop` and `substitutePlaceholders`. Update
explore-path copy (decision 6). `npm run build:runner` (the runner is
bundled, so a type error here surfaces at build).

**Stage the fixtures — read all of this before starting.** Every run updates
its PR's comment in place. Finish with a *successful* run on each PR you
touched so no comment is left `failed` on demo day.

1. **Auth wall (R-3.6, the one to show).** In `.env.local`, set
   `VERCEL_PROTECTION_BYPASS=wrong-on-purpose`. Run
   `./node_modules/.bin/tsx scripts/trigger-run.ts --pr 1 --record-only`
   (PR #1 so PR #2's comment stays untouched until the end). Expect
   `failed` at `record`, reason `preview-protected`, detail exactly the
   decision-6 copy, no URL, no secret. **Restore the secret immediately**
   and confirm with `git diff --quiet .env.local || echo CHANGED` that
   nothing else moved. Record the run id.
2. **Login token (second-best).** Same drill with
   `DEMO_LOGIN_TOKEN=wrong-on-purpose` → `login-failed`. Record the run id.
   If assumption A3 bites (the target app's `/api/demo-login` does
   something other than redirect to `/login` on a bad token), log what it
   does and skip this fixture.
3. **Selector drift.** Already exists: `wrun_01M24AN0VAZYS7GDSVHCPJW10D`
   (`element-not-found`, redacted detail). Keep it.
4. **Recovery.** Record-only re-run of PR #1 through the production UI so
   its comment ends `done` and the gallery has a second complete reel with
   `model` populated.

Add a `## Demo-day fixtures` block to `DECISIONS.md` listing each run id,
its `stage / reason`, and one line on what it demonstrates. R-13.3 says
"available to show"; this is where a reviewer finds them.

Commit: `Name the auth wall when recording, and stage the failure fixtures`.
DECISIONS: decisions 5, 6, 11, the fixture block, and the outcome of A2/A3.

---

## 5. Assumptions register

Log the outcome of each in `DECISIONS.md` when tested.

| # | Assumption | If false |
|---|---|---|
| A1 | `start()` + `indexRunForPr()` complete well inside a route handler's budget on Vercel (the webhook does the same). | Return 202 after `start()` and index in a `waitUntil`; log if the index write fails so the guard gap is visible. |
| A2 | A protected Vercel preview answers a non-browser `fetch` (no bypass param) with 401/403 or a 3xx to `vercel.com`. Check once with `curl -sI <target-preview>/` before writing `classifyAuthHop`. | Adjust the rule set to whatever the real first hop is; the function is pure, so the test pins it. |
| A3 | The target app's `/api/demo-login` redirects to `/login` on a bad token. | Read `preview-reel-target`'s route; classify on whatever it does (a 401 body, a `?error=` query). |
| A4 | The two 2026-09-10 record-only runs of PR #2 still authenticate against their deployment (the `DEMO_LOGIN_TOKEN` rotation noted in DECISIONS `[Security]` predates them). | Re-run from a fresh deployment of PR #2; the route uses the record's `previewUrl`, so pick a source run whose deployment postdates the rotation. |
| A5 | The in-flight `disabled` state is sufficient against double-submit; the ~1 s window between `start()` and `indexRunForPr()` in which a second POST could pass the guard is the same window the webhook has, and acceptable. | Do not add a second sentinel; log the duplicate if it ever happens. |
| A6 | Applying `.default(null)` to `model` on read does not disturb `.strict()` for the other fields (zod v4 applies defaults for missing keys, strict rejects *unknown* keys). One test case pins it. | Use `.optional()` and normalise in `readMetadata` instead. |

---

## 6. Carry forward (not this brief)

- Delete `app/api/dev/trigger-run/route.ts` and `scripts/trigger-run.ts`
  after the fixtures are staged (decision 11), and refresh the two stale
  `README.md` paragraphs ("pipeline … not built yet", "test runner isn't
  wired up") with a "Using the app" section. `docs/plan-ui-and-api.md`
  slice 5.
- Model on failed/in-progress runs (would need `model` on `RunRecord`).
- Stale-demo detection: with `model`, `commitSha`, and per-run configs now
  persisted, a record-only re-run against a new deployment plus a
  "step N no longer resolves" comparison is additive. Only if a full day
  remains after the above.

---

## 7. Do not

- Add a database, ORM, auth, state manager, data-fetching or toast library,
  or a component library other than shadcn. `useState` + `fetch` +
  `router.push` is the whole re-run client.
- Let the rerun route re-check `hasCompletedDemo` or `claimDeployment`.
  That is the automatic path's job (decision 1) and DECISIONS says so.
- Let the rerun route start a second concurrent run for a PR.
- Put a resolved credential — or the preflight URL, status, or `Location`
  header — into a `RunnerFailure.detail`, a log line, or a run record.
- Fail a run because the preflight itself errored (network, timeout).
- Build a provider registry, a model-name service, or a light-mode icon
  variant. One provider, one lookup, `fill-current`.
- Add a per-row cost column to the gallery table.
- Hand-edit `components/ui/`.
- Use `npx tsx`; use `./node_modules/.bin/tsx`.
- Leave a PR comment in `failed` when you finish slice E.
