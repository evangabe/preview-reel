import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";

import { findInProgressRun } from "@/lib/runs/in-progress";
import {
  indexRunForPr,
  readConfigUrl,
  readRunRecord,
} from "@/lib/storage/runs";
import {
  recordDemo,
  type RecordDemoInput,
} from "@/workflows/record-demo";

// Manual re-trigger (R-8.4). This is the manual path, so it deliberately
// skips the completed-demo and deployment-sentinel guards that stop
// *automatic* re-recording. It keeps the in-progress guard so a PR never has
// two concurrent runs, and indexes the new run so the webhook's guard sees it.

const bodySchema = z
  .object({
    mode: z.enum(["explore-and-record", "record-only"]),
  })
  .strict();

const headers = { "Cache-Control": "no-store" };

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: sourceRunId } = await params;

  const record = await readRunRecord(sourceRunId);
  if (!record) {
    console.log(JSON.stringify({ sourceRunId, reason: "run-not-found" }));
    return json({ error: "run not found" }, 404);
  }

  const { runId: _artifactRunId, ...identity } = record.identity;
  const context = {
    sourceRunId,
    owner: identity.owner,
    repo: identity.repo,
    prNumber: identity.prNumber,
  };

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    console.log(JSON.stringify({ ...context, reason: "bad-mode" }));
    return json(
      { error: "mode must be explore-and-record or record-only" },
      400,
    );
  }
  const { mode } = body.data;
  const logContext = { ...context, mode };

  const inProgress = await findInProgressRun(identity);
  if (inProgress) {
    console.log(
      JSON.stringify({ ...logContext, reason: "run-in-progress", runId: inProgress }),
    );
    return json({ error: "run-in-progress", runId: inProgress }, 409);
  }

  let configUrl: string | null = null;
  if (mode === "record-only") {
    configUrl = await readConfigUrl(record.identity);
    if (!configUrl) {
      console.log(JSON.stringify({ ...logContext, reason: "no-config" }));
      return json(
        {
          error: "no-config",
          detail:
            "This run never produced a config. Re-run the full pipeline instead.",
        },
        409,
      );
    }
  }

  const input: RecordDemoInput = {
    identity,
    previewUrl: record.previewUrl,
    commitSha: record.commitSha,
    pr: record.pr,
    mode,
    ...(configUrl ? { configSource: { kind: "blob", url: configUrl } } : {}),
  };

  const claimedAt = new Date().toISOString();
  let runId: string;
  try {
    runId = (await start(recordDemo, [input])).runId;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(
      JSON.stringify({ ...logContext, reason: "workflow-start-failed", detail }),
    );
    return json({ error: "workflow-start-failed", detail }, 502);
  }

  try {
    await indexRunForPr(identity, runId, claimedAt);
  } catch (error) {
    // The run is already going; a missing pointer only weakens the
    // in-progress guard for this PR, so report the run and log the gap.
    console.log(
      JSON.stringify({
        ...logContext,
        runId,
        reason: "run-index-failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return json({ runId }, 202);
  }

  console.log(JSON.stringify({ ...logContext, runId, reason: "started" }));
  return json({ runId }, 202);
}
