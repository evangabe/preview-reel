# Plan: Steps-first recording config and run logs disclosures

A brief for a coding agent. Scope: two client components on the run page —
`components/recording-config.tsx` (extend) and a new run-logs disclosure
rendered by `components/run-status.tsx`. Nothing here touches the player, the
polling loop, the Workflow, the sandbox runner, storage keys, or the API
response shape. `RunView` already carries everything needed.

Design reference: Figma file `R9c3VVxW6boAhWbkIwN5O5` ("Preview Reels",
page `0:1`). Its "Read me / Design direction" frame (`1:12`) says:
Vercel-inspired, existing functionality only, two routes (gallery and run
details). The player/source layout in the mockups predates this work — take
only the two disclosures from it. Pull the frames with `get_design_context`
before starting; the Figma MCP call quota was exhausted while this plan was
written, so the mockups were not inspected here. Where the mockup and this
brief disagree on behaviour, the brief wins; where they disagree on layout,
the mockup wins.

Read `AGENTS.md` → UI and "Pipeline rules", `docs/plan-ui-and-api.md` §5.11.5
(the current config collapsible), and `DECISIONS.md`. Append to `DECISIONS.md`
in the same commit as each call. Run `npm run type-check && npm test && npm run
lint` before every commit.

---

## 1. What exists — do not re-verify

Checked at commit `8fb0af6`.

| Fact | Evidence |
|---|---|
| `RecordingConfig({ configUrl })` is a `Collapsible` with a "Recording config" trigger, a "Download JSON" `<a>` in the header, and lazy `fetch(configUrl)` on first open. Loading = `Skeleton`, error = destructive `Alert` "Config unavailable", success = `<pre className="max-h-96 overflow-auto …">` of the raw text. | `components/recording-config.tsx` |
| `containsResolvedCredential(text)` rejects a config whose `token=` or `x-vercel-protection-bypass=` query value is not the `${…}` placeholder, and renders the Alert instead. This is the credential guard to preserve. | same file, lines 18–33 |
| Config shape (WebReel v1): `{ "$schema", videos: { [name]: { url, viewport, output, thumbnail, defaultDelay, steps: Step[] } } }`. A step is a flat object with `action` plus action-specific fields (`selector`, `text`, `ms`, `timeout`, `description`, …). The step list is whatever the explorer emitted; actions and field sets are not enumerated anywhere the UI can rely on. | `fixtures/sample-run/config.json`, `sandbox-runner/explore.ts` |
| `RunView.logsUrl: string \| null` is populated from `readRunLogsUrl(runId)` — a public, immutable `runs/{runId}/logs.jsonl`. It is written once, in the `finally` of the sandbox step, after the runner exits — on success, failure, and timeout alike. It is therefore `null` for the whole in-progress lifetime of a run and non-null on every terminal run that reached the sandbox step. | `workflows/record-demo.ts` lines 320–356, `lib/storage/runs.ts::persistRunLogs` |
| Each log line is `JSON.stringify({ at: ISO-8601 UTC, stage: "explore" \| "record", stream: "stdout" \| "stderr" \| "artifact", data: string })`. `data` is a raw process chunk and may contain embedded newlines. Secrets are redacted before the line is produced. The file may be empty (zero bytes) when the runner logged nothing. | `workflows/record-demo.ts`, `lib/sandbox/run.ts::SandboxLog` |
| `FailureAlert` already links "Run log" to `logsUrl` on failed runs. Leave it. | `components/run-status.tsx` |
| Generated shadcn primitives: `alert`, `badge`, `button`, `card`, `collapsible`, `input`, `separator`, `skeleton`. `Collapsible` wraps `@base-ui/react/collapsible` — the trigger is a real `<button>` with `aria-expanded` and keyboard handling for free. `Button` has `focus-visible:ring-3` styling and `aria-expanded:` variants. No `tabs` component exists. | `components/ui/*` |

---

## 2. Decisions fixed for this work

1. **No new shadcn components.** The brief names Collapsible, Skeleton,
   Alert, Button. The Steps / Raw JSON switch is two `Button variant="ghost"
   size="sm"` elements inside `<div role="tablist">`, each with `role="tab"`,
   `aria-selected`, `aria-controls`, `tabIndex={selected ? 0 : -1}`, and
   Left/Right/Home/End arrow handling (≈15 lines). Panels get `role="tabpanel"`
   and `aria-labelledby`. If this grows past 30 lines, generate `tabs` instead
   and log why.
2. **One fetch, two views.** The config is fetched once as text, guarded by
   `containsResolvedCredential` on the *text* exactly as today, then
   `JSON.parse`d. Steps renders from the parsed object; Raw JSON renders the
   original text (not re-serialised — keep the runner's formatting). If
   `JSON.parse` throws, the Steps tab shows an inline `Alert` "Config is not
   valid JSON" and Raw JSON still shows the text. Never hide the raw text
   because the parse failed.
3. **Steps come from every `videos[*].steps` array, in file order.** Almost
   always one video; if there are several, render a small muted heading with
   the video key above each group. Do not flatten across videos.
4. **Summaries are derived, never looked up.** A step row shows: 1-based
   index, `action` verbatim in monospace, and a summary string built by a pure
   function `summarizeStep(step)`:
   - `description` if it is a non-empty string; otherwise
   - the first present of `selector`, `text`, `url`, `key`, `value` as
     `field: value`; otherwise
   - `ms`/`timeout` as `field: value`; otherwise
   - "No parameters" when `action` is the only key, else "{n} parameters".
   No `switch` on action names. `pause`, `click`, `wait` in the fixture are
   sample data, not constants; the function must produce a usable row for an
   action it has never seen.
5. **Every row is its own `Collapsible`, collapsed by default.** Expanding
   shows all fields of the step (including `action` and `description`) as a
   definition list in key order from the JSON. Values render by type: strings
   as text (so `${DEMO_LOGIN_TOKEN}` and screenshot output paths like
   `../video.mp4` appear as-is — they are plain configuration values), numbers
   and booleans verbatim, `null` as `null`, arrays and objects recursively
   nested with indentation. Rows grow with content; no max-height on rows.
   Raw JSON keeps `max-h-96 overflow-auto`.
6. **Run logs is a sibling disclosure, not a tab.** New client component
   `components/run-logs.tsx`, `RunLogs({ logsUrl, inProgress })`, rendered by
   `RunStatus` directly below `RecordingConfig` (always rendered, even when
   `logsUrl === null`, so the unavailable copy has a home). Collapsed by
   default; fetches `logsUrl` on first open; keeps the parsed lines in state
   for the life of the page. Do not refetch on re-open. Do not refetch when
   the poll updates `view` — logs are immutable once written.
7. **Log rendering is `at` beside `data`, nothing else.** Two-column grid
   per line: `<time dateTime={at}>` formatted `HH:mm:ss.SSS` UTC in
   monospace muted text, then `data` in `<pre className="whitespace-pre-wrap
   break-words">`. `stage` and `stream` are not shown. No severity colouring
   from `stderr`, no "took 3.2s" deltas, no mapping to video time, no
   "completed"/"failed" badges — the phase list and `FailureAlert` already
   own those facts. Lines that fail `JSON.parse` render their raw text with
   the timestamp column blank rather than being dropped.
8. **Three non-content states, each inside the disclosure body.**
   - `logsUrl === null && inProgress`: muted paragraph "Logs are saved after
     the runner finishes. They will appear here once the run ends." No fetch.
   - `logsUrl === null && !inProgress`: "No run log was saved for this run."
     (covers runs that failed before the sandbox step, e.g. scoping).
   - fetch failed: destructive `Alert` "Run log unavailable" with the error
     message and a `Button variant="outline" size="sm"` "Try again" that
     re-runs the fetch. Same pattern goes into `RecordingConfig`, whose
     error state currently has no retry.
   - empty file (`text.trim() === ""`): "The runner produced no output."
   `inProgress` is `view.status.state === "in_progress"`; when the poll flips
   it and `logsUrl` becomes non-null while the disclosure is open, fetch then.
9. **Both disclosures share one fetch hook.** `useLazyText(url)` in
   `components/use-lazy-text.ts`: `{ status: "idle" | "loading" | "ok" |
   "error", text, error, load(), retry() }`; `load()` is a no-op when
   `status !== "idle"` or `url === null`. Two callers justify the extraction
   (AGENTS.md: write the second before extracting the first — this is the
   second).
10. **Pure helpers live in `lib/config/steps.ts` and `lib/logs/parse.ts`,
    tested.** `extractSteps(configText) → { videos: Array<{ name, steps }> } |
    { error }`, `summarizeStep(step)`, `parseLogLines(text) → Array<{ at:
    string | null, data: string }>`. Components stay presentational.

---

## 3. Contracts

### 3.1 `lib/config/steps.ts` — pure, tested

```ts
export type StepRecord = Record<string, unknown> & { action?: unknown };
export interface VideoSteps { name: string; steps: StepRecord[] }
export function extractSteps(text: string): { ok: true; videos: VideoSteps[] } | { ok: false; reason: string };
// ok:false when text is not JSON, `videos` is not an object, or a video's `steps` is not an array.
export function summarizeStep(step: StepRecord): string;   // §2.4
export function actionLabel(step: StepRecord): string;     // String(step.action) or "unknown action"
```

Tests: fixture config yields one video with six steps in order; a config with
two videos preserves order and names; `summarizeStep` prefers `description`,
falls back to `selector: …`, then `ms: …`, then the parameter count; an
unknown action `{ action: "hover", selector: "#x" }` produces `selector: #x`;
non-JSON returns `ok:false`.

### 3.2 `lib/logs/parse.ts` — pure, tested

```ts
export interface LogLineView { at: string | null; data: string }
export function parseLogLines(text: string): LogLineView[];
// Split on "\n", drop trailing empty line only, JSON.parse each; on failure
// { at: null, data: rawLine }. Never reorders, never dedupes, never drops.
export function formatLogTime(iso: string): string;  // "17:07:03.412" in UTC; returns iso unchanged if unparsable
```

Tests: three well-formed lines parse in order; a line with `\n` inside `data`
survives (build the fixture with `JSON.stringify` so the newline is escaped);
a garbage line is kept with `at: null`; empty string returns `[]`;
`formatLogTime` renders UTC, not local time.

### 3.3 `components/use-lazy-text.ts` — client hook

Wraps `fetch(url, { cache: "no-store" })`, throws on `!response.ok` with
"… returned {status}". Exposes `load` (idempotent) and `retry` (resets to
`idle` then loads). No abort controller needed — content is immutable and the
component stays mounted.

### 3.4 `components/recording-config.tsx` — extend

Header unchanged: `CollapsibleTrigger` "Recording config" left, "Download
JSON" `<a>` right. Body, on open:

```
[ Steps ] [ Raw JSON ]                      ← tablist, Steps selected by default
── Steps panel ─────────────────────────────
 1  pause   Let the inventory table settle          ˅
 2  click   Select the first inventory row          ˅
    ┌ action       click
    │ selector     [data-testid="select-P-1001"]
    │ description  Select the first inventory row
 3  click   …
── Raw JSON panel ──────────────────────────
 <pre max-h-96 overflow-auto> original text </pre>
```

States inside the body: `Skeleton` (three row-height bars, not one block)
while loading; destructive `Alert` "Config unavailable" + "Try again" on
fetch error; the existing credential Alert (no retry — retrying returns the
same bytes); "Config is not valid JSON" Alert on the Steps panel only. The
tab switch is local state; switching tabs never refetches.

### 3.5 `components/run-logs.tsx` — new

```tsx
export function RunLogs({ logsUrl, inProgress }: { logsUrl: string | null; inProgress: boolean })
```

Same shell as `RecordingConfig`: `Collapsible.rounded-xl.border`, trigger
"Run logs" with the chevron. No header action (the raw file is one click away
via the failure alert and is NDJSON, not something to hand a reviewer). Body
per §2.7–§2.8. Timestamps are `<time>` elements; the list is an `<ol>` with
`aria-label="Run log lines"`.

### 3.6 `components/run-status.tsx` — two lines

Replace the trailing `{view.configUrl ? <RecordingConfig … /> : null}` block
with a `space-y-4` wrapper holding the same conditional plus
`<RunLogs logsUrl={view.logsUrl} inProgress={view.status.state === "in_progress"} />`.
Nothing else changes.

### 3.7 Accessibility and focus

- Disclosure triggers are the base-ui `<button>`; add
  `focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg outline-none`
  so focus is visible on the dark theme. Chevron rotates on
  `[data-panel-open]` / `aria-expanded=true` via `group-aria-expanded:rotate-180`.
- Step rows: the whole row is the `CollapsibleTrigger`; index, action, and
  summary are inside it so the accessible name reads "2 click Select the
  first inventory row".
- Tabs per §2.1. Verify with keyboard only: Tab to "Recording config", Enter,
  Tab to the tablist, Right arrow to Raw JSON, Tab into the `<pre>`
  (`tabIndex={0}` so the scroll region is reachable), Tab onward to the first
  step row.

### 3.8 Copy

Plain, no exclamation marks. Exact strings: "Recording config", "Download
JSON", "Steps", "Raw JSON", "Run logs", "Try again", "Config unavailable",
"Run log unavailable", "Logs are saved after the runner finishes. They will
appear here once the run ends.", "No run log was saved for this run.", "The
runner produced no output.", "Config is not valid JSON", "No parameters".

---

## 4. The loop

### Slice 1 — pure helpers (25 min)

`lib/config/steps.ts`, `lib/logs/parse.ts`, tests. Use
`fixtures/sample-run/config.json` and a hand-written three-line NDJSON string
(one with an embedded `\n`, one malformed).

Commit: `Parse recording steps and run log lines for the UI`.

### Slice 2 — Steps-first config (45 min)

`use-lazy-text.ts`, rewrite `recording-config.tsx` per §3.4. Verify locally
on PR #2's done run: Steps shows the ten command-palette steps in order,
each expands to its full fields with any `${…}` placeholder rendered
literally; Raw JSON scrolls and shows `${VERCEL_PROTECTION_BYPASS}` and
`${DEMO_LOGIN_TOKEN}` in the video `url`; "Download JSON" still opens the blob; tab switching does
not refetch (check the network panel).

Commit: `Show recording steps before raw JSON`.
DECISIONS: §2.1, §2.4, §2.5.

### Slice 3 — Run logs (35 min)

`run-logs.tsx`, wire into `run-status.tsx`. Verify: done run → lines with UTC
timestamps, multiline chunks wrapped not truncated, no stream column; the
retained failure-fixture run (`record / element-not-found`, see DECISIONS
`[Validation]`) → same, with the failure alert above still linking the raw
file; a scoping-failed run or fabricated `logsUrl: null` → "No run log was
saved"; start a record-only re-run and open the disclosure while it runs →
in-progress copy, then flip to content after completion without a reload;
block the blob host in devtools → error Alert, unblock, "Try again" loads.

Commit: `Add a run logs disclosure to the run page`.
DECISIONS: §2.6, §2.7, §2.8, §2.9.

---

## 5. Brittleness checklist

- Do not switch on action names, filenames, or step counts anywhere in the
  UI or helpers.
- Do not hide, mask, or reformat `${VAR}` placeholders; do not add a
  credential guard on the parsed object that is looser than the text guard.
- Do not colour `stderr`, compute durations between `at` values, or map lines
  to video time.
- Do not fetch logs while `logsUrl` is `null`, and do not poll the logs URL.
- Do not add a `<Tabs>` component, a state manager, a virtualised list, or a
  syntax highlighter.
- Do not touch `demo-player.tsx`, `FailureAlert`, polling, or anything
  outside the files in §6.
- A view without loading, unavailable, and error treatments inside the
  disclosure body is not done.

---

## 6. Files

```
components/
  recording-config.tsx     rewrite body; keep header and credential guard
  run-logs.tsx             new
  run-status.tsx           render RunLogs beneath RecordingConfig
  use-lazy-text.ts         new — shared lazy fetch hook
lib/config/steps.ts        new + steps.test.ts
lib/logs/parse.ts          new + parse.test.ts
DECISIONS.md               per slice
```

---

## 7. Done means

- Opening "Recording config" on a completed run lands on Steps: every step in
  file order, each row expandable to its full parameters with nested values
  and placeholders intact; Raw JSON is one tab away in a bounded scroll
  region; Download JSON still works from the header.
- Opening "Run logs" on a terminal run shows every persisted line with its
  UTC timestamp beside the output, multiline preserved, no stream column.
  On an active run it explains logs arrive after the runner finishes; when
  no log exists it says so; a failed fetch offers Try again.
- Both disclosures start collapsed, fetch once on first open, and keep their
  content across re-opens and poll updates.
- Everything is reachable and operable by keyboard with visible focus; tabs
  expose selected state to assistive tech.
- `npm run type-check && npm test && npm run lint` pass. `DECISIONS.md` has
  entries for §2.1, §2.4–§2.9.
