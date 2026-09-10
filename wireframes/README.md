# Wireframes

Initial visual references, not final design. Hand-drawn, for layout and
information hierarchy only — spacing, copy, and components are shadcn's,
not these sketches'.

- **`01-gallery.png`** — gallery (`app/page.tsx`, R-8.1): search, grouped by recency ("Today", "Past week"), poster grid, link to Vercel project, settings icon.
- **`02-run-status.png`** — in-progress run (`app/runs/[runId]/page.tsx`, R-8.2): phase list with per-phase status, current-stage indicator ("Recording in progress...").
- **`03-run-player.png`** — completed run: collapsed phase summary + timestamp, player (R-8.3), link to view the config.

A fourth sketch (a settings screen) was dropped: configuration is environment variables validated at boot (`lib/env.ts`), not a UI.
