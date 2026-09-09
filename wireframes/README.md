# Wireframes

Initial visual references, not final design. Hand-drawn, for layout and
information hierarchy only — spacing, copy, and components are shadcn's,
not these sketches'.

- **`01-gallery.png`** — gallery (`app/page.tsx`, R-8.1): search, grouped by recency ("Today", "Past week"), poster grid, link to Vercel project, settings icon.
- **`02-run-status.png`** — in-progress run (`app/runs/[runId]/page.tsx`, R-8.2): phase list with per-phase status, current-stage indicator ("Recording in progress...").
- **`03-run-player.png`** — completed run: collapsed phase summary + timestamp, player (R-8.3), link to view the config.
- **`04-settings.png`** — a settings screen with editable config sections. Not in `docs/spec.md`'s requirements as an in-app UI — spec's config model (§7.9) is environment variables validated at boot (`lib/env.ts`, R-CFG.1), not a UI. Keeping the sketch for reference; treat this page as deferred/out-of-scope unless the spec changes.
