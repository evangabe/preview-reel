import { NextResponse } from "next/server";
import { getRun } from "workflow/api";

import { readRunEvents, readRunRecord } from "@/lib/storage/runs";
import {
  deriveRunStatus,
  type WorkflowRunStatus,
} from "@/lib/storage/status";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const [record, events, workflowStatus] = await Promise.all([
    readRunRecord(runId),
    readRunEvents(runId),
    getRun(runId).status.catch(() => null) as Promise<WorkflowRunStatus | null>,
  ]);
  const status = deriveRunStatus(events, workflowStatus);
  const headers = { "Cache-Control": "no-store" };

  if (!status) {
    return NextResponse.json(
      { error: "run not found" },
      { status: 404, headers },
    );
  }
  return NextResponse.json({ runId, record, status }, { headers });
}
