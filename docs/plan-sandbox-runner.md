# Plan: sandbox runner, riskiest path first

A brief for a coding agent. Scope: `sandbox-runner/`, `scripts/build-snapshot.ts`,
`lib/sandbox/`, `lib/storage/keys.ts`, and the failure taxonomy — the part of
`docs/spec.md` §12 steps 0 and 1 that decides whether this project exists.
Nothing here touches the webhook, the Workflow, the PR comment, or the UI.

Read `AGENTS.md` and `DECISIONS.md` first. Append to `DECISIONS.md` in the same
commit as every call you make. Run `npm run type-check` before every commit.

---

## 1. The question this work answers

Can an LLM driving `agent-browser` against a real preview deployment reliably
emit a `webreel` config that, replayed in a fresh browser context inside a
Vercel Sandbox, produces a watchable video of the feature the PR shipped?

Everything else in the product is plumbing around a "yes". If the answer is
"no" or "sometimes", the fallback (§12: committed configs + record-only
re-trigger) has to be known by hour 4, so this plan is ordered to surface a
"no" as early as possible.

---

## 2. What is already verified — do not re-verify

These were checked live against the target on 2026-09-09. Build on them.

| Fact | Evidence |
|---|---|
| Target project `preview-reel-target` exists; PR #1 `[feat] Bulk select and CSV export` is open on `feat/bulk-select-csv-export`. | GitHub API + `vercel project ls` |
| Its preview deployment arrives with `target: null` and `meta.githubPrId: 1`. | Vercel deployments API |
| No bypass → `302 https://vercel.com/sso-api?url=…&nonce=…`. Correct bypass header → `302 /login` (the *app's* redirect). Wrong bypass → `vercel.com/sso-api` again. | curl against the PR preview |
| Query-param bypass + `x-vercel-set-bypass-cookie=true` → `307` to the clean URL, sets `_vercel_jwt` (7d, HttpOnly). | curl |
| Fresh cookie-less context: `/api/demo-login?token=<DEMO_LOGIN_TOKEN>&next=/` + bypass params → two redirects → `200 /`. Wrong token → `401`. | curl with cookie jar |
| `DEMO_LOGIN_TOKEN` in Preview Reel matches the target. | The chain above only works if it does |
| `VERCEL_PROTECTION_BYPASS`, `GITHUB_TOKEN`, `AI_GATEWAY_API_KEY`, `BLOB_READ_WRITE_TOKEN` are real and in `.env.local` via `vercel env pull`. | `vercel env ls` |
| `VERCEL_OIDC_TOKEN` is in `.env.local` but **expires in 12h**. If `Sandbox.create()` fails auth, run `vercel env pull` and retry before debugging anything else. | DECISIONS.md `[Config]` |
| Blob store `preview-reel-demos` is public, `iad1`, linked to the project. | `vercel blob list-stores` |

Package facts from inspecting `webreel@0.1.4` / `@webreel/core@0.1.4` and the
`agent-browser` README (not from their docs sites):

- `webreel` step actions: `pause, click, key, type, drag, scroll, wait, moveTo,
  screenshot, navigate, hover, select`. Targets are `text` or `selector`, with
  optional `within`. **No header, cookie, or auth field exists.**
- `webreel validate -c <path>` exists. `webreel record -c <path> --verbose`
  records; `--dry-run` prints the resolved step list without a browser.
- `${VAR}` substitution applies to every string value; **unset variables are
  left as literal text**, so a missing env var at replay time surfaces as a
  navigation/`Element not found` failure, not a config error.
- Chrome is launched with `--no-sandbox` already. `CHROME_PATH` /
  `CHROME_HEADLESS_PATH` / `FFMPEG_PATH` are honored; otherwise binaries are
  downloaded to `~/.webreel/bin/{chrome,chrome-headless-shell,ffmpeg}`.
- Thumbnail PNG is written alongside the mp4 by default (`thumbnail.time: 0`).
- `agent-browser open <url> --headers '{"x-vercel-protection-bypass":"…","x-vercel-set-bypass-cookie":"true"}'`
  scopes the headers to that origin for the session. `snapshot -i -c --json`
  returns interactive elements with `@eN` refs. Refs are **session-scoped and
  meaningless to `webreel`** — the explorer must translate every ref it wants to
  replay into `text` or a stable CSS selector. `agent-browser install --with-deps`
  installs Linux system deps. `--session <name>` isolates state.
- Sandbox SDK: `Sandbox.create({ runtime: 'node24', timeout, source: { type:
  'snapshot', snapshotId } })`; `runCommand({ cmd, args, env, sudo, detached })`;
  detached commands expose `for await (const l of cmd.logs())` and `cmd.wait()`;
  `writeFiles([{ path, content, mode }])`, `readFileToBuffer({ path })`;
  `sandbox.snapshot()` stops the VM. Default session timeout is 5 min. New
  sandboxes are Ubuntu (`apt-get`, not `dnf`). Pass `persistent: false` — we do
  not want automatic snapshots on stop.

---

## 3. Decisions fixed for this work

Do not relitigate these mid-loop; if one proves wrong, log it and stop.

1. **The explorer runs inside the Sandbox**, as `sandbox-runner/explore.ts`,
   invoked by one `runCommand`. It shells out to `agent-browser` on the VM's
   PATH and makes its model calls through AI Gateway from inside the VM
   (`AI_GATEWAY_API_KEY` passed via `env`). Rationale: one command, one log
   stream, no per-action round trip through the Sandbox API, and the identical
   binary runs on a laptop for development. Tradeoff: the gateway key enters the
   VM. Acceptable — the VM is the isolation boundary and the key is spend-capped.
2. **The runner is one bundled file.** `sandbox-runner/` is bundled with esbuild
   to a single `runner.mjs` and written into the VM with `writeFiles` at run
   start (spec §12). The snapshot contains only Chrome, ffmpeg, `agent-browser`,
   and `webreel`. Runner changes never require a re-snapshot.
3. **Develop locally first, then move into the Sandbox.** The runner is a CLI:
   `node runner.mjs explore <args>` / `node runner.mjs record <args>`. Phases 1–3
   below run it on the laptop against the real PR #1 preview. Phase 4 runs the
   same file via `runCommand`. There is no local/sandbox abstraction — it's the
   same process with the same environment variables, in a different place.
4. **The entry URL shape is fixed.** Every emitted config's `videos.<name>.url`
   is:
   ```
   <previewUrl>/api/demo-login?token=${DEMO_LOGIN_TOKEN}&next=<entryPoint>&x-vercel-protection-bypass=${VERCEL_PROTECTION_BYPASS}&x-vercel-set-bypass-cookie=true
   ```
   with the `${…}` placeholders literal in the persisted file. The runner
   asserts both variables are set before invoking `webreel record`, because
   `webreel` will not.
5. **Selectors: `text` for clickable things, `selector` for inputs, refs never.**
   The explorer prefers `{ "action": "click", "text": "<visible label>" }`. For
   inputs it uses `[data-testid=…]`, `#id`, or `[aria-label=…]`, in that order.
   Every selector it intends to emit is checked live with
   `agent-browser is visible "<selector>"` before the config is finalized. This
   is the "resolution pass" from spec Open Question 4, done inline rather than as
   a separate stage.
6. **Budgets are hard.** Explorer: 25 agent actions, then fail with
   `explore/step-budget-exceeded`. Emitted config: ≤ 12 steps (R-4.3). Sandbox
   session: 5 minutes (R-3.3), no `extendTimeout()`. Model output: one repair
   retry on schema failure, then fail (R-2.8).
7. **Sandbox teardown is in a `finally`**, and the config is uploaded to Blob
   *before* recording starts (R-4.6), so a recording failure still leaves the
   reviewable artifact.

---

## 4. The loop

Each phase has a time box, an exit criterion, and what to do if it fails.
Blowing a time box is itself a result — write it down and move on.

### Phase 0 — `agent-browser` can drive the target (20 min)

Install locally: `npm i -g agent-browser webreel && agent-browser install`.

Manually, against the PR #1 preview URL:

```bash
B=$VERCEL_PROTECTION_BYPASS; T=$DEMO_LOGIN_TOKEN; U=<pr-1-preview-url>
agent-browser --session p0 open "$U/api/demo-login?token=$T&next=/" \
  --headers "{\"x-vercel-protection-bypass\":\"$B\",\"x-vercel-set-bypass-cookie\":\"true\"}"
agent-browser --session p0 get url          # expect $U/ , not /login, not vercel.com
agent-browser --session p0 snapshot -i -c   # expect the app's UI with refs
agent-browser --session p0 click @eN        # navigate to the bulk-select feature
agent-browser --session p0 is visible "text=Export CSV"   # or whatever the label is
```

Exit: you have, in a text file, the hand-discovered sequence of ≤ 8 actions that
exercises bulk select + CSV export, and for each action the `text` or
`selector` you would give `webreel`. Note which controls have no stable
selector — that list goes to the target app as `data-testid` additions
(cheap, and it's our app).

If it fails: if `get url` shows `vercel.com/sso-api`, the header bypass isn't
being applied — check header JSON quoting before anything else. If it shows
`/login`, the demo-login redirect didn't set a cookie in agent-browser's context
— compare with the curl chain in §2 and check whether agent-browser follows
redirects with headers preserved.

### Phase 1 — a hand-written config records the feature (40 min)

Write `fixtures/sample-run/config.json` from Phase 0's action list, using the
fixed URL shape from §3.4 with literal `${…}` placeholders. Then:

```bash
webreel validate -c fixtures/sample-run/config.json
webreel record   -c fixtures/sample-run/config.json --verbose
```

Exit: `videos/<name>.mp4` and `videos/<name>.png` exist, the mp4 plays, the
feature is visible in it, and the address bar in frame 0 does not contain the
secret (the 307 should have cleaned it — confirm by scrubbing the first second).
Copy the mp4, png, config, and a hand-written `metadata.json` into
`fixtures/sample-run/`. This is now the golden artifact for the UI work and the
hour-4 fallback.

If it fails on `Element not found`: the `text` match is probably exact and
case-sensitive — check with `agent-browser find text "<label>"`. If the video
shows the Vercel login page: `${VERCEL_PROTECTION_BYPASS}` was not substituted,
because the variable isn't in the shell env — this is the exact failure §3.4's
assertion exists to catch. If the first frame shows the secret in the URL:
note it in DECISIONS.md; mitigation is `thumbnail.time` ≥ 1.5 and a leading
`pause`, not a redesign.

### Phase 2 — the explorer emits that config on its own (90 min) — **the risk**

Build `sandbox-runner/explore.ts`:

- Inputs (argv or a JSON file): `previewUrl`, `demoSpec` (`title`, `entryPoint`,
  `intent`), `changedPaths[]`, `outDir`.
- AI SDK `generateText` via AI Gateway with tools that wrap `agent-browser`
  (`--session <runId>`, `--json`): `open(path)`, `snapshot()`, `click(ref)`,
  `fill(ref, text)`, `press(key)`, `back()`, `isVisible(selector)`,
  `getAttr(ref, name)`, and a terminal `finish(config)`.
  `stopWhen: stepCountIs(25)`.
- `open` always prepends the demo-login + bypass wrapper from §3.4 with the
  *resolved* values (the agent works against real credentials) and sets the
  bypass headers. The emitted config uses placeholders. Never let the model
  construct the URL.
- `finish(config)` validates against `lib/scope/schema.ts`'s zod mirror of
  `webreel`'s `Step` union (write that file now; it's the first zod schema),
  then runs `webreel validate` on the written file. Schema failure → one repair
  message with the zod error → retry → fail with `explore/invalid-config`.
- Writes `outDir/config.json`, `outDir/explore-transcript.jsonl` (every tool
  call and result, secrets redacted), and `outDir/explore-summary.json`
  (`{ actions, durationMs, modelCost, stepsEmitted }`).
- Detects the auth wall (§2): if any `get url` / snapshot shows host
  `vercel.com`, fail immediately with `explore/preview-protected` — don't let the
  model wander around the SSO page for 20 actions.

Run it three times against PR #1 with the demo spec you'd expect the scoping
stage to produce for its title and body. Score each run: `validate` passes?
`record` produces an mp4? The mp4 shows the feature? Steps ≤ 12? Actions used?

Exit: **2 of 3 runs** produce a config that records and shows the feature.
Record the action counts and wall times in DECISIONS.md.

If 0–1 of 3: spend at most 30 more minutes on the prompt and the `isVisible`
verification loop. If still under 2/3, **stop and declare the fallback**: ship
Phase 1's committed config with the record-only re-trigger (R-8.4), log the
exact failure pattern (lost on the page? unstable selectors? bad text
matching?), and move to Phase 3 with the hand-written config as input. That is
a legitimate hour-4 outcome, not a defeat; it's what §12 says to do.

### Phase 3 — the recorder is a stage with a contract (30 min)

Build `sandbox-runner/record.ts` and `sandbox-runner/index.ts`:

- `record` takes `configPath`, `outDir`; asserts `DEMO_LOGIN_TOKEN` and
  `VERCEL_PROTECTION_BYPASS` are set; runs `webreel record -c … --verbose`;
  emits `outDir/video.mp4`, `outDir/poster.png`, `outDir/record-summary.json`.
- `index.ts` dispatches `explore` / `record` and exits non-zero with a
  one-line JSON `{ stage, reason, detail }` on stderr for every failure path.
  This line is what the Workflow parses; it must never be a stack trace.
- Bundle: `esbuild sandbox-runner/index.ts --bundle --platform=node
  --format=esm --outfile=.runner/runner.mjs`. Add it as `npm run build:runner`.
  Confirm the bundle runs on the laptop with no `node_modules` present.

Exit: `node .runner/runner.mjs record --config fixtures/sample-run/config.json`
reproduces Phase 1's video from a clean shell.

### Phase 4 — the same file runs in a Sandbox from a snapshot (60 min)

Build `scripts/build-snapshot.ts`:

1. `Sandbox.create({ runtime: 'node24', timeout: 10*60*1000, persistent: false })`.
2. `sudo apt-get update && sudo apt-get install -y <chrome deps>`, then
   `npm i -g agent-browser webreel`, `agent-browser install --with-deps`,
   `webreel install`. Try `CHROME_PATH=<agent-browser's chrome> webreel install`
   first to avoid two Chromes (spec Open Question 1); if `webreel record` in
   step 3 fails, fall back to letting it download its own and log the result.
3. **Smoke test inside the VM before snapshotting**: write a 2-step config
   against `https://example.com` and `webreel record` it. Assert the mp4 exists
   and is > 10 KB. A snapshot that can't record must fail here, not on stage.
4. `sandbox.snapshot()` → print `snapshotId`. Store it as `SANDBOX_SNAPSHOT_ID`
   in Vercel env (all three targets) and `.env.example` (hand-set section).

Build `lib/sandbox/provision.ts` (snapshot → `Sandbox`, `timeout: 5 min`,
`persistent: false`) and `lib/sandbox/run.ts`:

- `writeFiles` the bundle and a `run.json` input; `runCommand({ cmd: 'node',
  args: ['runner.mjs', 'explore', …], env: { DEMO_LOGIN_TOKEN,
  VERCEL_PROTECTION_BYPASS, AI_GATEWAY_API_KEY }, detached: true })`; stream
  `cmd.logs()` to a callback; `cmd.wait()`; parse the stderr JSON line on
  non-zero exit.
- `readFileToBuffer` for `config.json` **immediately after explore**, before
  record starts. Then `record`. Then `video.mp4`, `poster.png`.
- `sandbox.stop()` in `finally`. Wrap the whole thing in a 5-minute deadline
  that kills the command and reports `timeout` as the stage's reason.

Run the full explore → record against PR #1 from a laptop script
(`scripts/run-once.ts` — throwaway, delete before the end). Measure each stage.

Exit: video and poster come back out of the VM; stage timings are recorded in
DECISIONS.md against spec Open Question 3's 4-minute ceiling. Expected shape:
provision < 10 s from snapshot, explore 60–120 s, record 30–60 s.

If provisioning from the snapshot is slow (> 30 s): check `persistent: false`
was passed and the snapshot isn't being re-created. If Chrome fails to launch
in the VM: `agent-browser doctor` inside the VM, then check for missing
`libnss3`/`libatk` deps — `--with-deps` should have covered this, so a failure
here is a snapshot build bug, not a runtime one.

### Phase 5 — persistence and failure modes (45 min)

- `lib/storage/keys.ts`: pure builders for the R-6.1 keys, the deployment-ID
  sentinel, and `runs/{runId}/events/{seq}-{stage}.json`. Unit test it (first
  test file; add `vitest` now, `npm test`).
- Upload order: `config.json` right after explore; `video.mp4` + `poster.png`
  after record; a terminal `metadata.json` last. Public access (the store is
  already public). Never `allowOverwrite` on event records.
- Failure taxonomy — every exit from the runner and from `run.ts` maps to one
  of these, and only these:

  | stage | reason | how it's detected |
  |---|---|---|
  | `provision` | `snapshot-missing` / `create-failed` / `oidc-expired` | SDK error class / message |
  | `explore` | `preview-protected` | URL host is `vercel.com` |
  | `explore` | `login-failed` | URL path is `/login` after the demo-login wrapper, or 401 from `/api/demo-login` |
  | `explore` | `feature-not-found` | model called `finish` with `found: false`, or budget hit without `finish` |
  | `explore` | `step-budget-exceeded` | 25 actions |
  | `explore` | `invalid-config` | zod or `webreel validate` failed after one repair |
  | `record` | `substitution-vars-missing` | runner assertion |
  | `record` | `element-not-found` / `navigation-failed` / `encode-failed` | `webreel` stderr pattern |
  | `*` | `timeout` | 5-min deadline |

  Stage a real `preview-protected` run by passing a wrong bypass secret; it's
  the R-13.3 demo failure and it should take < 15 s to fail, not 5 min.

Exit: a successful run and a deliberately failed run both have complete
artifacts in Blob under the right keys, and both failure objects carry
`{ stage, reason, logsUrl }`.

---

## 5. Assumptions register

Each row is a thing the spec or this plan assumes. Check it at the phase named,
and write the outcome to DECISIONS.md whether or not it held.

| # | Assumption | Phase | Probe |
|---|---|---|---|
| A1 | `agent-browser` follows the demo-login redirect chain with the bypass header applied to each hop, and keeps the session cookie. | 0 | `get url` after `open` shows `/`, not `/login` or `vercel.com` |
| A2 | `webreel`'s `click.text` matches the target app's visible button labels without needing `selector`. | 1 | hand config records with `text` only |
| A3 | The first frame of the recording does not show the secret in the address bar (the 307 completes before capture starts). | 1 | scrub frame 0 |
| A4 | The model can translate `@eN` refs into `text`/selectors that `webreel` resolves, ≥ 2/3 of the time. | 2 | the scored runs |
| A5 | Text snapshots (`snapshot -i -c --json`) are sufficient; no screenshots needed for the model. | 2 | if runs fail with "can't find", try one run with a screenshot tool before concluding |
| A6 | `agent-browser install --with-deps` works under `sudo` in the Ubuntu Sandbox image and Chrome launches as the sandbox user. | 4 | snapshot smoke test |
| A7 | One Chrome can serve both tools via `CHROME_PATH`. | 4 | `webreel record` in the VM with `CHROME_PATH` set |
| A8 | Snapshot restore is < 10 s. | 4 | timing |
| A9 | End-to-end < 4 min, leaving 60 s headroom under the 5-min session. | 4 | timing |
| A10 | The AI Gateway key works from inside the VM (outbound to `ai-gateway.vercel.sh` isn't blocked). | 4 | first explore in the VM |
| A11 | Wrong-bypass runs fail in < 15 s via the `vercel.com` host check. | 5 | staged failure |

---

## 6. Files this work produces

```
sandbox-runner/index.ts          dispatcher; stderr JSON failure line
sandbox-runner/explore.ts        AI SDK loop over agent-browser -> config.json
sandbox-runner/record.ts         webreel record -> video.mp4 + poster.png
lib/scope/schema.ts              zod: demo spec (R-2.6) + webreel Step union
lib/sandbox/provision.ts         snapshot -> Sandbox, 5-min timeout
lib/sandbox/run.ts               writeFiles, runCommand, stream, readFile, finally stop
lib/storage/keys.ts              pure key builders (+ keys.test.ts)
scripts/build-snapshot.ts        install, smoke-record, snapshot, print id
fixtures/sample-run/{config.json,video.mp4,poster.png,metadata.json}
.env.example                     + SANDBOX_SNAPSHOT_ID
```

`scripts/run-once.ts` is a development harness. It does not ship.

---

## 7. Done means

- `npm run build:runner && npx tsx scripts/run-once.ts --pr 1` produces a video
  of PR #1's feature in Blob, from a Sandbox, from a snapshot, in under 4
  minutes, with the config persisted before recording began.
- The same command with `VERCEL_PROTECTION_BYPASS=wrong` fails in under 15 s
  with `{ stage: "explore", reason: "preview-protected" }`.
- `fixtures/sample-run/` is populated from a real run.
- Every row in §5 has an outcome in DECISIONS.md.
- The Phase 2 score (n of 3) is written down. If it was < 2, DECISIONS.md says
  so and says the product ships on the record-only path.

## 8. Not this work

Webhook handler, Workflow wiring, tag matcher, scoping prompt, PR comment,
gallery, status page. Anything in `docs/spec.md` §11.
