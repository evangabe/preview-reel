# Setup

Everything needed to stand Preview Reel up against a new target repo. The
short version is in the [README](../README.md); this is the long one.

## Environment

Run `vercel link` then `vercel env pull` to populate `.env.local`, or copy
`.env.example` and fill it in by hand.

The application settings below are yours to set, in the Vercel dashboard or
`.env.local`:

```bash
VERCEL_WEBHOOK_SECRET=       # shown once when the team webhook is created
PREVIEW_REEL_REPOS=          # comma-separated allowlist, e.g. me/preview-reel-target
GITHUB_TOKEN=                # fine-grained PAT: PRs read, Issues write
VERCEL_PROTECTION_BYPASS=    # generated on the *target* project, copied here
DEMO_LOGIN_TOKEN=            # long-lived secret; target app trades it for a session at /api/demo-login
AI_GATEWAY_API_KEY=          # spend-capped, see below
APP_BASE_URL=https://preview-reel.vercel.app  # public production alias for links
```

Two more come from the platform and must **not** be set by hand — a typed-in
value shadows the injected one:

- `BLOB_READ_WRITE_TOKEN` appears once a Blob store is connected to the
  project. Present at build time and at runtime.
- `VERCEL_OIDC_TOKEN` is build-time and local-development only. Deployed
  functions never see it on `process.env`; the Sandbox SDK acquires it out
  of band. Locally `vercel env pull` writes it to `.env.local` and it
  expires after 12 hours — re-pull if Sandbox provisioning starts failing
  authentication.

The settings above plus `BLOB_READ_WRITE_TOKEN` are validated at boot
(`lib/env.ts`, called from `instrumentation.ts`). Validation runs at server
startup rather than at build, because the webhook secret cannot exist before
the first deploy.

## Steps for a new target repo

Preview Reel needs a Vercel **Pro** team. Team-level webhooks are not
available on Hobby, and the webhook is the entire trigger — nothing else in
the stack requires the upgrade.

1. Deploy the target app to a Vercel project in the same team as Preview Reel.
2. Generate a Protection Bypass for Automation secret on the target project and copy it into `VERCEL_PROTECTION_BYPASS`. Either Settings → Deployment Protection → Protection Bypass for Automation → Create, or:

   ```bash
   curl -X PATCH "https://api.vercel.com/v1/projects/<target-project-id>/protection-bypass?teamId=<team-id>" \
     -H "Authorization: Bearer $VERCEL_TOKEN" -H "content-type: application/json" \
     -d '{"generate":{"note":"preview-reel"}}'
   ```

3. Add `owner/repo` to `PREVIEW_REEL_REPOS`.
4. Create a fine-grained PAT scoped to that repo; set `GITHUB_TOKEN`. Grant **Pull requests: Read and write** and **Issues: Read and write** (Metadata: Read-only is added automatically). GitHub lists the create-issue-comment endpoint under both the Issues and Pull requests permission sets, and a PR comment is attributed to the pull request resource — granting only one side is the usual cause of `Resource not accessible by personal access token`.
5. Target app exposes `/api/demo-login?token=...&next=...`, which validates the token, sets the session cookie, and redirects. Set that same token as `DEMO_LOGIN_TOKEN`. No credential pair, no scripted login.
6. Open a PR titled `[feat] ...`.

## Vercel resources this project expects

Created once, with the CLI where possible:

```bash
vercel link --project preview-reel
vercel git connect
vercel blob create-store preview-reel-demos --access public --yes
vercel ai-gateway api-keys create --name preview-reel --limit 25 --refresh-period monthly
vercel webhooks create https://<prod-url>/api/webhooks/vercel --event deployment.succeeded
```

The webhook must point at the project's **production alias**, not a
deployment-specific URL — those sit behind Vercel Authentication and would
auth-wall Vercel's own delivery service. `vercel webhooks create` prints the
signing secret once; that value is `VERCEL_WEBHOOK_SECRET`.

`vercel.json` pins `iad1` because the Vercel World backend for Workflow is
deployed only there, and pins the `nextjs` framework preset because a project
created via `vercel project add` has none.

## Sandbox snapshot

The runner executes inside a Vercel Sandbox started from an immutable
snapshot with Chrome, ffmpeg, `agent-browser`, and `webreel` baked in. Build
it once with `npx tsx scripts/build-snapshot.ts` and store the printed ID in
`SANDBOX_SNAPSHOT_ID` (see `.env.example`).

## Local checks

```bash
npm install
npm run type-check   # the real safety net; run before every commit
npm run lint
npm run test         # pure functions only: tag matcher, schemas, comment renderer, keys
```

`npx tsx scripts/replay-webhook.ts` re-signs `fixtures/webhook/deployment-succeeded.json`
and posts it to a running server, which is the quickest way to exercise the
trigger path without pushing a commit.

## Constraints

Target projects must live in the same Vercel team as Preview Reel
(team-level webhook, v1 constraint). Single-tenant by construction: one
PAT, one bypass secret, one login token — multi-repo with differing
credentials is out of scope. See the punts table in `docs/spec.md` for the
full list and why.
