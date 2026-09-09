import { NextResponse, type NextRequest } from "next/server";

// Manual re-trigger (R-8.4). Build order step 4.
//
// TODO: two modes via a body flag — full pipeline (explore + record)
// against a given deployment, or record-only from the last persisted
// config (skips exploration). Same Workflow, same code path either way.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  await params;
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
