# Preview Reel

Preview Reel records a short demo video of a new feature running on its
Vercel preview deployment, and posts it to the PR.

A PR titled `[feat] ...` triggers the pipeline automatically: no tag, no
comment, no model call, no cost. Full requirements are in
[`docs/spec.md`](docs/spec.md); decisions and tradeoffs are logged as
they're made in [`DECISIONS.md`](DECISIONS.md).

**Status:** scaffold only. The Next.js app, directory structure, and
tooling are in place; the pipeline itself is not wired up yet. See
`docs/spec.md` §12 for build order.

## Stack

Next.js (App Router, TypeScript strict) · Tailwind · shadcn/ui · Vercel
Workflow · Vercel Sandbox · Vercel Blob · AI Gateway · `agent-browser` +
`webreel` · npm.

## Repositories

| Repo | Purpose |
|---|---|
| `preview-reel` (this repo) | The product — Next.js app, Workflow, Sandbox runner. |
| `preview-reel-target` | A small Next.js app deployed to its own Vercel project in the same team. Has a login and two or three demoable features. Exists to be recorded and to have `[feat]` PRs opened against it. |

## Local development

```bash
npm install
npm run dev
```

- `npm run type-check` — the real safety net for this project; run it before every commit.
- `npm run lint`

A test runner isn't wired up yet — it lands with the first pure function
that needs one (tag matcher, zod schemas, comment renderer, blob key
builder), per `AGENTS.md`.

## Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
VERCEL_WEBHOOK_SECRET=       # shown once when the team webhook is created
PREVIEW_REEL_REPOS=          # comma-separated allowlist, e.g. me/preview-reel-target
GITHUB_TOKEN=                # fine-grained PAT: PRs read, Issues write
VERCEL_PROTECTION_BYPASS=    # per target project
DEMO_LOGIN_TOKEN=            # long-lived secret; target app trades it for a session at /api/demo-login
AI_GATEWAY_API_KEY=
BLOB_READ_WRITE_TOKEN=
VERCEL_OIDC_TOKEN=           # or team token, for Sandbox provisioning
```

All of the above are validated at boot (`lib/env.ts`) — a missing secret
fails the deploy, not the third stage of a run.

## Setup steps for a new target repo

1. Deploy the target app to a Vercel project in the same team as Preview Reel.
2. Project settings → enable Protection Bypass for Automation → copy the secret into `VERCEL_PROTECTION_BYPASS`.
3. Add `owner/repo` to `PREVIEW_REEL_REPOS`.
4. Create a fine-grained PAT scoped to that repo; set `GITHUB_TOKEN`.
5. Target app exposes `/api/demo-login?token=...&next=...`, which validates the token, sets the session cookie, and redirects. Set that same token as `DEMO_LOGIN_TOKEN`. No credential pair, no scripted login.
6. Open a PR titled `[feat] ...`.

## Constraints worth knowing before you touch this repo

Target projects must live in the same Vercel team as Preview Reel
(team-level webhook, v1 constraint). Single-tenant by construction: one
PAT, one bypass secret, one credential pair — multi-repo with differing
credentials is out of scope. See `docs/spec.md` §11 for the full list of
explicit punts and why.
