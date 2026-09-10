# Plan: Steps-first recording config and run logs disclosures

A brief for a coding agent. Scope: two client components on the run page —
`components/recording-config.tsx` (extend) and a new run-logs disclosure
rendered by `components/run-status.tsx`. Nothing here touches the player, the
polling loop, the Workflow, the sandbox runner, storage keys, or the API
response shape. `RunView` already carries everything needed.

Design reference: Figma file `R9c3VVxW6boAhWbkIwN5O5` ("Preview Reels"). The
eight exported frames are the source of truth for layout; the relevant ones
are: run details, done, both disclosures collapsed; Recording config open on
Steps; Steps with one row expanded; Recording config open on Raw JSON; Run
logs open; run details, failed; run details, in progress. The mockups'
breadcrumb, "Visit preview" button, status/mode/started pill row, and the
player-plus-source two-column card predate this work — **do not build them**.
Take only the two disclosures and the failed-run caption. Where a mockup and
this brief disagree on behaviour, the brief wins; on layout, the mockup wins.
(The gallery frame lacks loading, error, and empty states; those exist in code
already and are not part of this work.)

Read `AGENTS.md` → UI and "Pipeline rules", `docs/plan-ui-and-api.md` §5.11.5
(the current config collapsible), and `DECISIONS.md`. Append to `DECISIONS.md`
in the same commit as each call. Do not use the local app as a validation
environment: its current Vercel/runtime issue prevents the UI from loading
reliably and will be triaged separately. Validate each slice through its
Vercel preview deployment and browser screenshots instead. Do not add or run
tests for this take-home slice.

---

## 1. What exists — do not re-verify

Checked at commit `bb1ff50`.

| Fact | Evidence |
|---|---|
| `RecordingConfig({ configUrl })` is a `Collapsible` with a "Recording config" trigger, a "Download JSON" `<a>` in the header, and lazy `fetch(configUrl)` on first open. Loading = `Skeleton`, error = destructive `Alert` "Config unavailable", success = `<pre className="max-h-96 overflow-auto …">` of the raw text. | `components/recording-config.tsx` |
| `containsResolvedCredential(text)` rejects a config whose `token=` or `x-vercel-protection-bypass=` query value is not the `${…}` placeholder and renders the Alert instead. This is the credential guard to preserve. | same file, lines 18–33 |
| Config shape (WebReel v1): `{ "$schema", baseUrl?, videos: { [name]: { url, viewport, output, thumbnail, defaultDelay, steps: Step[] } } }`. Steps are flat objects with `action` plus action-specific fields. | `fixtures/sample-run/config.json`, Raw JSON mockup |
| The repo already declares the WebReel step contract it asks the model for: twelve actions — `pause { ms }`, `click { text \| selector, modifiers? }`, `key { key, target? }`, `drag { from, to }`, `type { text, selector, within?, charDelay? }`, `scroll { x?, y?, text? \| selector? }`, `wait { text \| selector, timeout? }`, `moveTo`, `screenshot { output }`, `navigate { url }`, `hover`, `select { …, value }` — each optionally carrying `description` and delay fields. `webreel` itself may accept more; the UI must not assume this list is closed. | `lib/scope/schema.ts::webreelStepSchema` |
| `RunView.logsUrl: string \| null` comes from `readRunLogsUrl(runId)` — a public, immutable `runs/{runId}/logs.jsonl` written once in the `finally` of the sandbox step, after the runner exits, on success, failure, and timeout alike. It is `null` for the whole in-progress lifetime of a run and non-null on every terminal run that reached the sandbox step. | `workflows/record-demo.ts` lines 320–356, `lib/storage/runs.ts::persistRunLogs` |
| Each log line is `JSON.stringify({ at: ISO-8601 UTC, stage: "explore" \| "record", stream: "stdout" \| "stderr" \| "artifact", data: string })`. `data` is a raw process chunk and may contain embedded newlines (the mockup's "Thumbnail: … / Done: …" pair is one line). Secrets are redacted before the line is produced. The file may be zero bytes. | `workflows/record-demo.ts`, `lib/sandbox/run.ts::SandboxLog` |
| `FailureAlert` already links "Run log" and "Exploration transcript" on failed runs, matching the failed mockup. Leave it. | `components/run-status.tsx` |
| Generated shadcn primitives: `alert`, `badge`, `button`, `card`, `collapsible`, `input`, `separator`, `skeleton`. `Collapsible` wraps `@base-ui/react/collapsible` — the trigger is a real `<button>` with `aria-expanded` and keyboard handling for free. `Button` ships `focus-visible:ring-3`. No `tabs` component exists. | `components/ui/*` |

---

## 2. What the mockups specify

Transcribed so the implementer does not have to squint. Dark theme, cards are
`rounded-xl border` on the page background, matching the existing
"4/4 phases complete" collapsible.

**Recording config, collapsed.** `›  Recording config` left; `Download JSON ↓`
right, muted. Same as today.

**Recording config, open, Steps tab.** Under the header: a tab row `Steps
Raw JSON`, selected tab underlined, unselected muted. Then the video key in
monospace (`command-palette-k-for-part-lookup`). Then a muted caption:
"Configured actions in replay order. Expand a step to inspect its
parameters." Then the step rows, one per line, divided by hairlines:

```
 1   Press key                                        Control+k  ›
 2   Wait for element               [data-testid="palette-input"]  ›
 3   Take screenshot                             palette-open.png  ›
 4   Type text                                              6202  ›
 5   Pause                                                300 ms  ›
 …
10   Click                                                 Close  ›
```

Index muted, label in foreground, primary value right-aligned in muted
monospace, chevron. Below the list a muted caption: "Screenshot steps
describe capture actions; output filenames are configuration values."

**Steps, one row expanded.** Chevron rotates; beneath the row a block with a
muted "Parameters" label and the step pretty-printed as JSON, 2-space indent,
monospace, on a slightly darker panel:

```
{
  "action": "type",
  "text": "6202",
  "selector": "[data-testid=\"palette-input\"]"
}
```

Other rows stay collapsed — rows are independent.

**Recording config, open, Raw JSON tab.** Same tab row, `Raw JSON`
underlined. Full original text in a monospace `<pre>`, long `url` lines
wrapping, `${DEMO_LOGIN_TOKEN}` and `${VERCEL_PROTECTION_BYPASS}` shown
literally, clipped at a fixed height with internal scroll.

**Run logs, collapsed.** `›  Run logs` left; `Saved output` right, muted.

**Run logs, open.** Muted caption "Saved after the runner finishes." Then one
row per persisted line: `2026-09-10  00:20:01.245 UTC` in muted monospace,
then the message in monospace. Multiline `data` stays under one timestamp.
No stream column, no colour by severity, no durations.

**Failed run.** Phases card and failure copy (already built), then the
Recording config disclosure, then a muted caption *outside* the card: "The
recording config is available for inspection even though recording failed."
The mockup omits Run logs here; the brief says add it (§3.5), so it renders
beneath the config with real content since `logsUrl` is set on every run that
reached the sandbox.

**In-progress run.** The mockup shows neither disclosure. The brief requires
the Run logs disclosure to explain that logs arrive after the runner
finishes, so it renders with header trailing text "Not saved yet" and the
in-progress copy inside (§3.5). Recording config renders only when
`configUrl !== null`, as today (it appears mid-run once the config is
persisted before recording starts).

---

## 3. Decisions fixed for this work

1. **No new shadcn components.** The Steps / Raw JSON switch is two `Button
   variant="ghost" size="sm"` elements inside `<div role="tablist">`, each
   with `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex={selected ?
   0 : -1}`, Left/Right/Home/End handling, and an underline on
   `aria-selected="true"` per the mockup. Panels get `role="tabpanel"` and
   `aria-labelledby`. If this grows past 30 lines, generate `tabs` and log why.
2. **One fetch, two views.** Fetch the config once as text, run
   `containsResolvedCredential` on the text exactly as today, then
   `JSON.parse`. Steps renders from the parsed object; Raw JSON renders the
   original text unmodified (keep the runner's formatting). If the parse
   fails, Steps shows an inline `Alert` "Config is not valid JSON" and Raw
   JSON still shows the text. Never hide the raw text because parsing failed.
3. **Steps come from every `videos[*].steps` array, in file order.** Render
   the video key in monospace above each group as the mockup does. Do not
   flatten across videos.
4. **Labels come from the repo's step contract; values come from the step.**
   `actionLabel(step)` maps the twelve actions in `webreelStepSchema` to the
   mockup's phrasing — `key`→"Press key", `wait`→"Wait for element" when
   `selector` is set / "Wait for text" when `text` is set, `screenshot`→"Take
   screenshot", `type`→"Type text", `pause`→"Pause", `click`→"Click",
   `navigate`→"Navigate", `hover`→"Hover", `scroll`→"Scroll",
   `moveTo`→"Move to", `drag`→"Drag", `select`→"Select". Anything else renders
   `String(step.action)` verbatim in monospace, or "Unknown action" when
   `action` is missing — never dropped, still expandable. `primaryValue(step)`
   returns the first present of `key`, `selector`, `text`, `output`, `url`,
   `value`, then `ms` formatted `"{ms} ms"`, then `timeout`, then `x`/`y` as
   `"x, y"`, else `""`. When `description` is present it renders as a muted
   second line under the label; it never replaces the value column. The
   contract list is a label lookup, not a filter: the sample's action names,
   filenames, and ten-step length are data, not constants.
5. **Every row is its own `Collapsible`, collapsed by default.** The expanded
   block is `JSON.stringify(step, null, 2)` in a `<pre
   className="whitespace-pre-wrap break-words">` under a muted "Parameters"
   label — this preserves key order, nesting (`target`, `from`/`to`),
   placeholders, and screenshot output paths as plain values without a
   bespoke renderer. Rows grow with content; no max-height. Raw JSON keeps a
   bounded `max-h-96 overflow-auto`.
6. **Run logs is a sibling disclosure, always rendered.** New
   `components/run-logs.tsx`, `RunLogs({ logsUrl, inProgress })`, rendered by
   `RunStatus` directly below `RecordingConfig` on every status, so the
   unavailable and in-progress copy has a home. Collapsed by default; fetches
   on first open; keeps parsed lines in state for the life of the page. No
   refetch on re-open, no refetch when the poll updates `view` — the file is
   immutable. If `logsUrl` flips from `null` to a URL while the disclosure is
   open (poll reaches a terminal state), fetch then.
7. **Log rendering is `at` beside `data`, nothing else.** Two-column grid per
   line: `<time dateTime={at}>` formatted `YYYY-MM-DD HH:mm:ss.SSS UTC` in
   muted monospace with `whitespace-nowrap`, then `data` in `<pre
   className="whitespace-pre-wrap break-words font-mono">`. `stage` and
   `stream` are not shown. No severity colouring from `stderr`, no deltas
   between timestamps, no mapping to video time, no completion badges — the
   phase list and `FailureAlert` own those facts. Lines that fail `JSON.parse`
   render raw with an empty timestamp cell rather than being dropped.
8. **Header trailing text reflects availability.** "Saved output" when
   `logsUrl` is set (mockup); "Not saved yet" when `inProgress`; "Unavailable"
   when `logsUrl === null` on a terminal run. Muted, not a badge.
9. **Non-content states live inside the disclosure body.**
   - `logsUrl === null && inProgress`: "Logs are saved after the runner
     finishes. They will appear here once the run ends." No fetch.
   - `logsUrl === null && !inProgress`: "No run log was saved for this run."
     (runs that failed before the sandbox step, e.g. scoping).
   - fetch failed: destructive `Alert` "Run log unavailable" with the message
     and a `Button variant="outline" size="sm"` "Try again". The same retry
     goes into `RecordingConfig`'s fetch-error Alert; the credential Alert
     gets no retry because the bytes will not change.
   - `text.trim() === ""`: "The runner produced no output."
   - loading: three row-height `Skeleton` bars, not one block.
10. **Both disclosures share one fetch hook.** `useLazyText(url)` in
    `components/use-lazy-text.ts`: `{ status: "idle" | "loading" | "ok" |
    "error", text, error, load(), retry() }`; `load()` is a no-op unless
    `status === "idle"` and `url !== null`. Two callers justify the extraction.
11. **Pure helpers in `lib/config/steps.ts` and `lib/logs/parse.ts`, tested.**
    Components stay presentational.

---

## 4. Contracts

### 4.1 `lib/config/steps.ts` — pure, tested

```ts
export type StepRecord = Record<string, unknown>;
export interface VideoSteps { name: string; steps: StepRecord[] }
export function extractSteps(text: string):
  | { ok: true; videos: VideoSteps[] }
  | { ok: false; reason: string };   // not JSON, `videos` not an object, or a video's `steps` not an array
export function actionLabel(step: StepRecord): { label: string; known: boolean };  // §3.4
export function primaryValue(step: StepRecord): string;                            // §3.4
```

The implementer should reason through these cases against the preview rather
than adding a test suite. The fixture config should yield one video with six
steps in order; a two-video config should preserve order and names;
`actionLabel` maps `wait`+`selector` to
"Wait for element" and `wait`+`text` to "Wait for text"; an unknown `{ action:
"tap", selector: "#x" }` yields `{ label: "tap", known: false }` and
`primaryValue` `"#x"`; a step without `action` yields "Unknown action"; `pause`
formats `"300 ms"`; non-JSON returns `ok:false`.

### 4.2 `lib/logs/parse.ts` — pure, tested

```ts
export interface LogLineView { at: string | null; data: string }
export function parseLogLines(text: string): LogLineView[];
// Split on "\n", drop the trailing empty line only, JSON.parse each; on
// failure { at: null, data: rawLine }. Never reorders, dedupes, or drops.
export function formatLogTime(iso: string): string;
// "2026-09-10 00:20:01.245 UTC"; returns the input unchanged if unparsable.
```

The implementer should inspect these cases through the preview rather than
adding tests. Three lines parse in order; a line whose `data` contains `\n` survives
intact (build the fixture with `JSON.stringify`); a garbage line is kept with
`at: null`; empty string returns `[]`; `formatLogTime` renders UTC regardless
of the test runner's zone.

### 4.3 `components/use-lazy-text.ts` — client hook

Wraps `fetch(url, { cache: "no-store" })`; throws "… returned {status}" on
`!response.ok`. `retry()` resets to `idle` then loads. No abort controller —
content is immutable and the component stays mounted.

### 4.4 `components/recording-config.tsx` — extend

Header unchanged. Body on open, per §2: tablist → video key → caption → rows
→ footer caption (Steps), or bounded `<pre tabIndex={0}>` (Raw JSON). Tab
choice is local state; switching never refetches. States per §3.9. The
Steps-only "Config is not valid JSON" Alert from §3.2.

### 4.5 `components/run-logs.tsx` — new

```tsx
export function RunLogs({ logsUrl, inProgress }: { logsUrl: string | null; inProgress: boolean })
```

Shell identical to `RecordingConfig`: `Collapsible.rounded-xl.border`, trigger
`›  Run logs`, trailing text per §3.8. Body: caption "Saved after the runner
finishes." then the `<ol aria-label="Run log lines">` per §3.7, or one of the
§3.9 states.

### 4.6 `components/run-status.tsx` — small

Replace the trailing `{view.configUrl ? <RecordingConfig … /> : null}` with a
`space-y-4` block:

```tsx
{view.configUrl ? <RecordingConfig configUrl={view.configUrl} /> : null}
{view.configUrl && view.status.state === "failed" ? (
  <p className="text-sm text-muted-foreground">
    The recording config is available for inspection even though recording failed.
  </p>
) : null}
<RunLogs logsUrl={view.logsUrl} inProgress={view.status.state === "in_progress"} />
```

Nothing else changes.

### 4.7 Accessibility and focus

- Disclosure triggers are the base-ui `<button>`; add `rounded-lg
  outline-none focus-visible:ring-3 focus-visible:ring-ring/50` so focus is
  visible on the dark theme. Chevron rotates via
  `group-aria-expanded:rotate-90` (mockup uses `›` → `⌄`).
- Step rows: the whole row is the `CollapsibleTrigger`; index, label, and
  value are inside it so the accessible name reads "4 Type text 6202".
- Tabs per §3.1. Verify keyboard-only: Tab to "Recording config", Enter, Tab
  to the tablist, Right arrow to Raw JSON, Tab into the `<pre>` scroll
  region, Shift+Tab back, Left arrow to Steps, Tab to the first row, Enter.

### 4.8 Copy

Exact strings: "Recording config", "Download JSON", "Steps", "Raw JSON",
"Configured actions in replay order. Expand a step to inspect its
parameters.", "Parameters", "Screenshot steps describe capture actions;
output filenames are configuration values.", "Run logs", "Saved output",
"Not saved yet", "Unavailable", "Saved after the runner finishes.", "Logs are
saved after the runner finishes. They will appear here once the run ends.",
"No run log was saved for this run.", "The runner produced no output.", "Run
log unavailable", "Config unavailable", "Config is not valid JSON", "Try
again", "Unknown action", "The recording config is available for inspection
even though recording failed." No exclamation marks.

---

## 5. The loop

### Slice 1 — pure helpers (25 min)

`lib/config/steps.ts`, `lib/logs/parse.ts`, tests against
`fixtures/sample-run/config.json` and a hand-written NDJSON string (one line
with an embedded `\n`, one malformed).

Commit: `Parse recording steps and run log lines for the UI`.

### Slice 2 — Steps-first config (45 min)

`use-lazy-text.ts`, rewrite `recording-config.tsx` body. Verify on PR #2's
done run against the Steps mockup: ten rows, labels and values match the
frame ("Press key / Control+k" … "Click / Close"), row 4 expands to the
three-field JSON, other rows stay closed; Raw JSON shows both `${…}`
placeholders literally and scrolls; Download JSON still opens the blob; tab
switching makes no network request.

Commit: `Show recording steps before raw JSON`.
DECISIONS: §3.1, §3.4, §3.5.

### Slice 3 — Run logs (35 min)

`run-logs.tsx`, wire into `run-status.tsx` with the failed-run caption.
Verify: done run → rows match the Run logs mockup, the "Thumbnail / Done"
chunk stays under one timestamp, no stream column; the retained
failure-fixture run (`record / element-not-found`) → caption under the config,
logs beneath, failure alert still links the raw file; a scoping-failed run or
a locally forced `logsUrl: null` → "Unavailable" / "No run log was saved";
start a record-only re-run, open Run logs while it runs → "Not saved yet" and
the in-progress copy, then content after completion without a reload; block
the blob host in devtools → error Alert, unblock, "Try again" loads.

Commit: `Add a run logs disclosure to the run page`.
DECISIONS: §3.6–§3.9.

---

## 6. Brittleness checklist

- Do not build the mockups' breadcrumb, "Visit preview" button, pill row, or
  player/source two-column card. Not this work.
- Do not filter, sort, or cap steps by action name, filename, or count. The
  label map is a lookup with a verbatim fallback, never a gate.
- Do not hide, mask, or reformat `${VAR}` placeholders; do not add a parsed-
  object credential guard looser than the text guard.
- Do not colour `stderr`, compute durations between `at` values, or map lines
  to video time.
- Do not fetch logs while `logsUrl` is `null`, and never poll the logs URL.
- Do not add a `<Tabs>` component, a state manager, a virtualised list, a
  syntax highlighter, or a bespoke JSON tree renderer.
- Do not touch `demo-player.tsx`, `FailureAlert`, `PhaseStatus`, or polling.
- A disclosure without loading, unavailable, and error treatments inside its
  body is not done.

---

## 7. Files

```
components/
  recording-config.tsx     rewrite body; keep header and credential guard
  run-logs.tsx             new
  run-status.tsx           render RunLogs and the failed-run caption
  use-lazy-text.ts         new — shared lazy fetch hook
lib/config/steps.ts        new + steps.test.ts
lib/logs/parse.ts          new + parse.test.ts
DECISIONS.md               per slice
```

---

## 8. Done means

- "Recording config" on a completed run opens on Steps and matches the
  mockup: video key, caption, every step in file order with contract-derived
  label and primary value, each row expanding independently to its full JSON
  with nesting and placeholders intact, footer caption; Raw JSON one tab away
  in a bounded scroll region; Download JSON still in the header.
- "Run logs" on a terminal run matches the mockup: "Saved output" in the
  header, caption, every persisted line with a UTC timestamp beside the
  output, multiline preserved, no stream column. On an active run it reads
  "Not saved yet" and explains; on a run with no log it reads "Unavailable"
  and says so; a failed fetch offers Try again.
- Failed runs show the config caption from the mockup beneath the disclosure.
- Both disclosures start collapsed, fetch once on first open, and keep their
  content across re-opens and poll updates.
- Everything is keyboard-operable with visible focus; tabs expose selected
  state to assistive tech.
- Preview screenshots show the done, expanded Steps, Raw JSON, Run logs,
  failed, and in-progress states matching the supplied frames. `DECISIONS.md`
  records the preview-only validation decision and entries for §3.1,
  §3.4–§3.9. Local tests are intentionally not a completion criterion because
  the current local Vercel/runtime issue is deferred for later triage.
