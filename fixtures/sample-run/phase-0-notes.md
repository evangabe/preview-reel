# Phase 0 — hand-discovered flow

Target: PR #1, `[feat] Bulk select and CSV export`.

`agent-browser` reached the authenticated inventory page only when headers
were installed once with `set headers` before `open`. Passing `--headers` to
`open` and then omitting it on later commands changed the launch options and
restarted the browser at `about:blank`.

The replayable flow is:

1. Open `/api/demo-login?...&next=/` through the fixed auth wrapper.
2. Pause for the inventory table to settle.
3. Click `[data-testid="select-P-1001"]`.
4. Click `[data-testid="select-P-1002"]`.
5. Wait for `[data-testid="export-csv"]`.
6. Click the visible text `Export CSV`.

The row controls already have stable test IDs (`select-P-1001`,
`select-P-1002`), and the export button has `data-testid="export-csv"`.
No target-app changes are needed for this flow.
