import { NextResponse, type NextRequest } from "next/server";

// Status polling for a single run (R-8.2). Build order step 4.
//
// TODO: read live stage from the Workflow run (`getRun(runId)`) or the
// latest append-only event record (lib/storage/runs.ts) — never a single
// overwritten Blob object (R-6.4, Blob's 60s cache/propagation floor).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  await params;
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
