import { NextResponse, type NextRequest } from "next/server";

// Entry point for Vercel's team-level `deployment.succeeded` webhook
// (docs/spec.md §7.1). Build order step 2.
//
// TODO:
// - verify `x-vercel-signature` (HMAC-SHA1, hex, raw body, constant-time)
// - act only on `deployment.succeeded` with `target !== "production"`
// - filter against `PREVIEW_REEL_REPOS` before any GitHub call
// - resolve the PR (meta.githubPrId, else branch search); no PR -> exit silently
// - idempotency: dedupe on deployment id, and skip if a run is already
//   in progress for (repo, prNumber)
// - start the `record-demo` Workflow and return before it finishes
//
// Must respond within 30s (R-1.4) and never fail the deploy (no non-2xx
// for anything other than a bad signature).
// 200 rather than 501 while unimplemented: the team webhook is already
// registered, and Vercel retries any non-2xx with backoff for 24 hours.
export async function POST(_request: NextRequest) {
  return NextResponse.json({ ok: true, handled: false });
}
