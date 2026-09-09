import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";

import {
  claimDeployment,
  hasCompletedDemo,
  indexRunForPr,
  listRunIdsForPr,
} from "@/lib/storage/runs";
import {
  findOpenPullRequestByBranch,
  getPullRequest,
  GitHubError,
  type PullRequest,
  type RepoRef,
} from "@/lib/trigger/github";
import {
  deploymentFacts,
  deploymentSucceededSchema,
  eventTypeSchema,
} from "@/lib/trigger/payload";
import { matchFeatureTag } from "@/lib/trigger/tag";
import { verifyVercelSignature } from "@/lib/trigger/verify";
import {
  recordDemo,
  type RecordDemoInput,
} from "@/workflows/record-demo";

type SkipReason =
  | "bad-signature"
  | "ignored-event"
  | "malformed-payload"
  | "production-target"
  | "repo-not-allowlisted"
  | "no-pr"
  | "pr-closed"
  | "untagged"
  | "already-demoed"
  | "run-in-progress"
  | "already-claimed";

function response(reason: SkipReason, status = 200) {
  return NextResponse.json({ handled: false, reason }, { status });
}

function logDecision(
  context: Record<string, unknown>,
  reason: string,
) {
  console.log(JSON.stringify({ ...context, reason }));
}

function allowlisted(ref: RepoRef): boolean {
  const wanted = `${ref.owner}/${ref.repo}`.toLowerCase();
  return (process.env.PREVIEW_REEL_REPOS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

async function resolvePullRequest(
  ref: RepoRef,
  prNumber: number | null,
  headRef: string,
): Promise<PullRequest | null> {
  return prNumber === null
    ? findOpenPullRequestByBranch(ref, headRef)
    : getPullRequest(ref, prNumber);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (
    !verifyVercelSignature(
      rawBody,
      request.headers.get("x-vercel-signature"),
      process.env.VERCEL_WEBHOOK_SECRET ?? "",
    )
  ) {
    logDecision({}, "bad-signature");
    return response("bad-signature", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logDecision({}, "malformed-payload");
    return response("malformed-payload");
  }

  const eventType = eventTypeSchema.safeParse(body);
  if (!eventType.success) {
    logDecision({}, "malformed-payload");
    return response("malformed-payload");
  }
  if (eventType.data.type !== "deployment.succeeded") {
    logDecision({}, "ignored-event");
    return response("ignored-event");
  }

  const parsed = deploymentSucceededSchema.safeParse(body);
  if (!parsed.success) {
    logDecision({}, "malformed-payload");
    return response("malformed-payload");
  }

  const facts = deploymentFacts(parsed.data);
  const context: Record<string, unknown> = {
    deploymentId: facts.deploymentId,
    owner: facts.owner,
    repo: facts.repo,
    prNumber: facts.prNumber,
  };
  if (parsed.data.payload.target === "production") {
    logDecision(context, "production-target");
    return response("production-target");
  }

  const ref = { owner: facts.owner, repo: facts.repo };
  if (!allowlisted(ref)) {
    logDecision(context, "repo-not-allowlisted");
    return response("repo-not-allowlisted");
  }

  let pr: PullRequest | null;
  try {
    pr = await resolvePullRequest(ref, facts.prNumber, facts.headRef);
  } catch (error) {
    const retry =
      !(error instanceof GitHubError) || error.status >= 500;
    logDecision(context, "github-unavailable");
    return NextResponse.json(
      { handled: false, reason: "github-unavailable", retry },
      { status: retry ? 502 : 200 },
    );
  }
  if (!pr) {
    logDecision(context, "no-pr");
    return response("no-pr");
  }
  context.prNumber = pr.number;
  if (pr.state !== "open") {
    logDecision(context, "pr-closed");
    return response("pr-closed");
  }

  const tag = matchFeatureTag(pr.title);
  if (!tag.matched) {
    logDecision(context, "untagged");
    return response("untagged");
  }

  const identity = { ...ref, prNumber: pr.number };
  try {
    if (await hasCompletedDemo(identity)) {
      logDecision(context, "already-demoed");
      return response("already-demoed");
    }

    const pointers = await listRunIdsForPr(identity);
    const cutoff = Date.now() - 15 * 60_000;
    const fresh = pointers.filter(
      (pointer) => Date.parse(pointer.claimedAt) > cutoff,
    );
    const statuses = await Promise.all(
      fresh.map((pointer) =>
        getRun(pointer.runId).status.catch(() => "failed" as const),
      ),
    );
    if (
      statuses.some(
        (status) => status === "pending" || status === "running",
      )
    ) {
      logDecision(context, "run-in-progress");
      return response("run-in-progress");
    }

    const claimedAt = new Date().toISOString();
    const claim = await claimDeployment(facts.deploymentId, {
      ...identity,
      claimedAt,
    });
    if (!claim.claimed) {
      logDecision(context, "already-claimed");
      return response("already-claimed");
    }

    const input: RecordDemoInput = {
      identity: { ...identity, deploymentId: facts.deploymentId },
      previewUrl: facts.previewUrl,
      commitSha: facts.commitSha,
      pr: {
        title: tag.title,
        body: pr.body,
        headRef: pr.headRef,
        htmlUrl: pr.htmlUrl,
      },
      mode: "explore-and-record",
    };
    let runId: string | null = null;
    try {
      const run = await start(recordDemo, [input]);
      runId = run.runId;
      await indexRunForPr(identity, runId, claimedAt);
    } catch (error) {
      logDecision(
        { ...context, error: error instanceof Error ? error.message : String(error) },
        runId ? "run-index-failed" : "workflow-start-failed",
      );
      return NextResponse.json({
        handled: true,
        ...(runId ? { runId } : { reason: "workflow-start-failed" }),
      });
    }

    logDecision({ ...context, runId }, "started");
    return NextResponse.json({ handled: true, runId });
  } catch (error) {
    logDecision(
      { ...context, error: error instanceof Error ? error.message : String(error) },
      "pre-claim-failed",
    );
    return NextResponse.json(
      { handled: false, retry: true, reason: "pre-claim-failed" },
      { status: 500 },
    );
  }
}
